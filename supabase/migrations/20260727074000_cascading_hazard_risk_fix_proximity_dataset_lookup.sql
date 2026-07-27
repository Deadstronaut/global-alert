-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #4
--
-- Live-testing finding: fix-up #3's ST_DWithin-bounded query (an exact copy
-- of compute_zonal_stats' filter shape) still timed out through PostgREST
-- as an authenticated session, even though it matches an already-proven
-- pattern. Root cause found via `SET ROLE authenticated; EXPLAIN ANALYZE`
-- (with a superuser connection, so RLS returned zero rows and ran in ms —
-- but the PLAN SHAPE was revealing): the query resolved `exposure_datasets.
-- id` through a JOIN (`ed.country_code = ... AND ed.source_name = ...`)
-- inside the same statement as the `exposure_features` scan. The planner
-- chose to drive the join from `exposure_features` via its `dataset_id`
-- btree index rather than the `geom` GiST index, meaning it walks every
-- `exposure_features` row for the joined dataset(s) evaluating
-- `ST_DWithin` (a real geography calculation) AND the `exposure_features`
-- RLS policy's own per-row EXISTS subquery — for HydroRIVERS TR (40,421
-- rows) that's 40k geography distance calcs plus 40k redundant RLS
-- subquery lookups in the worst case, comfortably over the `authenticated`
-- role's 8s statement_timeout.
--
-- `compute_zonal_stats` (spec 008) — proven to run fine live under RLS —
-- never has this join-then-filter shape: it takes a single, already-known
-- `dataset_id UUID` parameter directly, so its `exposure_features` WHERE
-- clause is one plain equality with no join to resolve first. Fixed by
-- matching that exact shape: resolve the matching `exposure_datasets.id`
-- in its own separate statement first (also doubling as the "layer
-- exists" check), then query `exposure_features` by that single known id.
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
  v_proximity_dataset_id UUID;
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

    -- Proximity condition — resolve the dataset id in its own statement
    -- first (see header comment), then a single plain-equality
    -- exposure_features query (matches compute_zonal_stats' proven shape).
    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT id INTO v_proximity_dataset_id
      FROM exposure_datasets
      WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_proximity_dataset_id IS NULL THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        SELECT MIN(ST_Distance(ef.geom::geography, v_event_point::geography)) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        WHERE ef.dataset_id = v_proximity_dataset_id
          AND ST_DWithin(ef.geom::geography, v_event_point::geography, v_rule.proximity_distance_km * 1000);

        IF v_distance_km IS NULL THEN
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
