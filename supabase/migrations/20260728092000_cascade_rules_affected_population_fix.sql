-- =====================================================
-- Cascading Hazard Risk — fix affected_population (always NULL)
--
-- Live-testing finding (user-reported): every triggered rule's
-- recommendation text always rendered "population data not available",
-- for every country/city, not just a specific case. Root cause: the
-- affected_population lookup joined
-- "exposure_features.admin_boundary_code = p_admin_boundary_code", but
-- writeExposureDataset() (the writer used by every raster-derived exposure
-- source — WorldPop/GHSL/Meta/HDX/Kontur) never sets admin_boundary_code at
-- all — confirmed live: 0 non-null rows across an entire dataset. That
-- column match could never succeed for ANY event, in ANY country — not a
-- capacity/timeout/scope issue as it first looked, a query bug.
--
-- Fixed by summing population within a radius of the event point (the same
-- spatial-distance approach compute_zonal_stats already uses successfully
-- elsewhere in this codebase), instead of a boundary-code text match that
-- never had any matching rows to find. Radius: 2^magnitude km (mirrors this
-- repo's client-side src/lib/hazardBuffer.js earthquake default-buffer
-- strategy, for consistency between the map's own impact radius and this
-- estimate), or the triggered rule's own proximity_distance_km if no
-- magnitude is available, capped at 300km to avoid a runaway sum for a
-- very high-magnitude event.
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
      v_population_radius_km := LEAST(
        GREATEST(POWER(2, COALESCE(p_magnitude, 0)), COALESCE(v_rule.proximity_distance_km, 25)),
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
