-- =====================================================
-- Cascading Hazard Risk — affected_population radius should be per-rule,
-- not a single magnitude-wide blanket for every triggered rule
--
-- User-reported: for one M7.8 event, flood/epidemic/landslide all showed the
-- exact same affected_population figure, even though each rule's own "Why"
-- section cites a different, much smaller proximity_distance_km (flood
-- 1.2km, landslide's own threshold, etc). Root cause: 20260728092000's
-- v_population_radius_km := LEAST(GREATEST(POWER(2, magnitude),
-- rule.proximity_distance_km), 300) — for any real earthquake magnitude,
-- POWER(2, magnitude) (~223km at M7.8) dwarfs every rule's own
-- proximity_distance_km (5-15km in the starter seed), so GREATEST always
-- picked the magnitude-wide radius regardless of which specific rule
-- triggered — "population within the quake's whole impact zone", identical
-- for every secondary risk of that event, not the risk-specific figure the
-- recommendation text implies.
--
-- Fixed to prefer each rule's own proximity_distance_km (the same radius
-- that determined the rule triggered in the first place) whenever it's
-- configured, falling back to the magnitude-based estimate only for a rule
-- with no distance criterion at all (e.g. a hypothetical
-- vulnerability-score-only rule) — matching the ORIGINAL migration
-- comment's stated intent ("... or the rule's own proximity_distance_km if
-- no magnitude is available"), which the GREATEST() implementation had
-- actually inverted.
-- =====================================================

CREATE OR REPLACE FUNCTION _evaluate_cascade_rules_core(
  p_country_code VARCHAR(2),
  p_hazard_type TEXT,
  p_admin_boundary_code TEXT,
  p_event_lat DOUBLE PRECISION,
  p_event_lng DOUBLE PRECISION,
  p_magnitude DOUBLE PRECISION,
  p_source_type TEXT,
  p_source_event_ref JSONB,
  p_triggered_automatically BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rule cascade_rules%ROWTYPE;
  v_triggered JSONB := '[]'::JSONB;
  v_not_evaluable JSONB := '[]'::JSONB;
  v_not_triggered_count INTEGER := 0;
  v_missing TEXT[];
  v_satisfied BOOLEAN;
  v_distance_km DOUBLE PRECISION;
  v_proximity_dataset_id UUID;
  v_radius_degrees DOUBLE PRECISION;
  v_vulnerability_score DOUBLE PRECISION;
  v_input_values JSONB;
  v_affected_population DOUBLE PRECISION;
  v_population_radius_km DOUBLE PRECISION;
  v_recommendation_text TEXT;
  v_assessment_id UUID;
  v_event_point geometry;
BEGIN
  IF p_source_type NOT IN ('real_event', 'hypothetical_scenario') THEN
    RAISE EXCEPTION 'source_type must be real_event or hypothetical_scenario';
  END IF;

  v_event_point := ST_SetSRID(ST_MakePoint(p_event_lng, p_event_lat), 4326);

  FOR v_rule IN
    SELECT * FROM cascade_rules
    WHERE country_code = p_country_code
      AND is_active
      AND (trigger_hazard_type = p_hazard_type OR trigger_hazard_type = 'any')
  LOOP
    v_missing := '{}';
    v_satisfied := true;
    v_distance_km := NULL;
    v_vulnerability_score := NULL;

    IF v_rule.min_magnitude IS NOT NULL THEN
      IF p_magnitude IS NULL THEN
        v_missing := array_append(v_missing, 'event has no magnitude value');
      ELSIF p_magnitude < v_rule.min_magnitude THEN
        v_satisfied := false;
      END IF;
    END IF;

    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT id INTO v_proximity_dataset_id
      FROM exposure_datasets
      WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_proximity_dataset_id IS NULL THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        v_radius_degrees := v_rule.proximity_distance_km / 90.0;

        SELECT MIN(ST_Distance(ef.geom::geography, v_event_point::geography)) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        WHERE ef.dataset_id = v_proximity_dataset_id
          AND ef.geom && ST_Expand(v_event_point, v_radius_degrees)
          AND ST_DWithin(ef.geom::geography, v_event_point::geography, v_rule.proximity_distance_km * 1000);

        IF v_distance_km IS NULL THEN
          v_satisfied := false;
        END IF;
      END IF;
    END IF;

    IF v_rule.min_vulnerability_score IS NOT NULL THEN
      v_vulnerability_score := compute_risk_category_score(p_country_code, p_admin_boundary_code, 'vulnerability');
      IF v_vulnerability_score IS NULL THEN
        v_missing := array_append(v_missing, 'no vulnerability indicators configured for this area');
      ELSIF v_vulnerability_score < v_rule.min_vulnerability_score THEN
        v_satisfied := false;
      END IF;
    END IF;

    IF array_length(v_missing, 1) IS NOT NULL THEN
      v_not_evaluable := v_not_evaluable || jsonb_build_object(
        'rule_id', v_rule.id,
        'secondary_risk_category', v_rule.secondary_risk_category,
        'missing_prerequisite', array_to_string(v_missing, '; ')
      );
    ELSIF NOT v_satisfied THEN
      v_not_triggered_count := v_not_triggered_count + 1;
    ELSE
      -- Prefer this rule's OWN proximity_distance_km (the same radius that
      -- decided the rule triggered) — only fall back to the magnitude-wide
      -- estimate for a rule with no distance criterion configured at all.
      v_population_radius_km := LEAST(
        COALESCE(v_rule.proximity_distance_km, GREATEST(POWER(2, COALESCE(p_magnitude, 0)), 25)),
        300
      );

      SELECT SUM(ef.metric_value) INTO v_affected_population
      FROM exposure_features ef
      WHERE ef.dataset_id = (
        SELECT ed.id FROM exposure_datasets ed
        WHERE ed.country_code = p_country_code AND ed.metric_property_name ILIKE '%population%'
        ORDER BY ed.created_at DESC
        LIMIT 1
      )
      AND ST_DWithin(ef.geom::geography, v_event_point::geography, v_population_radius_km * 1000);

      v_input_values := jsonb_strip_nulls(jsonb_build_object(
        'magnitude', p_magnitude,
        'distance_km', v_distance_km,
        'vulnerability_score', v_vulnerability_score
      ));

      v_recommendation_text := render_recommendation_template(
        v_rule.recommendation_template, p_admin_boundary_code, p_magnitude,
        v_distance_km, v_vulnerability_score, v_affected_population
      );

      INSERT INTO cascading_risk_assessments (
        country_code, cascade_rule_id, rule_config_snapshot, source_type, source_hazard_type,
        source_event_ref, admin_boundary_code, input_values, affected_population, recommendation_text,
        triggered_automatically
      ) VALUES (
        p_country_code, v_rule.id, to_jsonb(v_rule), p_source_type, p_hazard_type,
        p_source_event_ref, p_admin_boundary_code, v_input_values, v_affected_population, v_recommendation_text,
        p_triggered_automatically
      ) RETURNING id INTO v_assessment_id;

      v_triggered := v_triggered || jsonb_build_object(
        'assessment_id', v_assessment_id,
        'rule_id', v_rule.id,
        'secondary_risk_category', v_rule.secondary_risk_category,
        'input_values', v_input_values,
        'affected_population', v_affected_population,
        'recommendation_text', v_recommendation_text
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'triggered', v_triggered,
    'not_evaluable', v_not_evaluable,
    'not_triggered_count', v_not_triggered_count
  );
END;
$$;
