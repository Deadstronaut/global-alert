-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #2
--
-- Live-testing finding (Playwright UI pass, real TR HydroRIVERS data —
-- 40,421 features): evaluate_cascade_rules's proximity condition timed out
-- ("canceling statement due to statement timeout"). Root cause:
-- `MIN(ST_Distance(ef.geom::geography, point::geography))` forces an exact
-- geodesic distance calculation against every matching row before taking
-- MIN — the GiST index on `ef.geom` cannot accelerate a plain
-- `ST_Distance` aggregate, only spatial-predicate filters like
-- `ST_DWithin`/`&&` or a `<->` nearest-neighbor ORDER BY.
--
-- Fixed using PostGIS's standard indexed nearest-neighbor idiom: order by
-- the `<->` KNN operator (planar, uses the existing GiST index to find
-- candidates cheaply) with LIMIT 1, then compute the one accurate geodesic
-- distance only for that single nearest row. Planar-nearest and
-- geodesic-nearest can differ at extreme scales (near poles/the
-- antimeridian), an accepted, well-documented tradeoff of this idiom that
-- is immaterial at country scale.
-- =====================================================

CREATE OR REPLACE FUNCTION evaluate_cascade_rules(
  p_country_code VARCHAR(2),
  p_hazard_type TEXT,
  p_admin_boundary_code TEXT,
  p_event_lat DOUBLE PRECISION,
  p_event_lng DOUBLE PRECISION,
  p_magnitude DOUBLE PRECISION,
  p_source_type TEXT,
  p_source_event_ref JSONB
)
RETURNS JSONB
LANGUAGE plpgsql AS $$
DECLARE
  v_rule cascade_rules%ROWTYPE;
  v_triggered JSONB := '[]'::JSONB;
  v_not_evaluable JSONB := '[]'::JSONB;
  v_not_triggered_count INTEGER := 0;
  v_missing TEXT[];
  v_satisfied BOOLEAN;
  v_distance_km DOUBLE PRECISION;
  v_layer_exists BOOLEAN;
  v_vulnerability_score DOUBLE PRECISION;
  v_input_values JSONB;
  v_affected_population DOUBLE PRECISION;
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

    -- Magnitude condition
    IF v_rule.min_magnitude IS NOT NULL THEN
      IF p_magnitude IS NULL THEN
        v_missing := array_append(v_missing, 'event has no magnitude value');
      ELSIF p_magnitude < v_rule.min_magnitude THEN
        v_satisfied := false;
      END IF;
    END IF;

    -- Proximity condition — indexed nearest-neighbor (see header comment),
    -- not a full-table geography MIN(ST_Distance(...)).
    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM exposure_datasets
        WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ) INTO v_layer_exists;

      IF NOT v_layer_exists THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        SELECT ST_Distance(ef.geom::geography, v_event_point::geography) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        JOIN exposure_datasets ed ON ed.id = ef.dataset_id
        WHERE ed.country_code = p_country_code AND ed.source_name = v_rule.proximity_exposure_source_name
        ORDER BY ef.geom <-> v_event_point
        LIMIT 1;

        IF v_distance_km IS NULL OR v_distance_km > v_rule.proximity_distance_km THEN
          v_satisfied := false;
        END IF;
      END IF;
    END IF;

    -- Vulnerability condition (reuses spec 039's compute_risk_category_score, research.md §2)
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
      -- Every configured condition satisfied: compute affected population
      -- (most-recently-added population-like exposure dataset for this
      -- area, to avoid double-counting if multiple population sources
      -- exist for the same country) and render the recommendation text.
      SELECT sums.total INTO v_affected_population
      FROM (
        SELECT SUM(ef.metric_value) AS total
        FROM exposure_datasets ed
        JOIN exposure_features ef ON ef.dataset_id = ed.id AND ef.admin_boundary_code = p_admin_boundary_code
        WHERE ed.country_code = p_country_code AND ed.metric_property_name ILIKE '%population%'
        GROUP BY ed.id, ed.created_at
        ORDER BY ed.created_at DESC
        LIMIT 1
      ) sums;

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
        source_event_ref, admin_boundary_code, input_values, affected_population, recommendation_text
      ) VALUES (
        p_country_code, v_rule.id, to_jsonb(v_rule), p_source_type, p_hazard_type,
        p_source_event_ref, p_admin_boundary_code, v_input_values, v_affected_population, v_recommendation_text
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
