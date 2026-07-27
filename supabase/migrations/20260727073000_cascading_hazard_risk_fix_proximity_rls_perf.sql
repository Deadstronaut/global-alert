-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #3
--
-- Live-testing finding (Playwright UI pass, real authenticated browser
-- session — not the superuser CLI connection used for fix-up #2's isolated
-- EXPLAIN ANALYZE, which bypasses RLS): the `<->` KNN nearest-neighbor
-- query from fix-up #2 still timed out ("canceling statement due to
-- statement timeout") when called through PostgREST as an authenticated
-- user. Root cause: `exposure_features`'s RLS policy
-- (`exposure_features_visible_with_dataset`) is an EXISTS-subquery
-- predicate that Postgres folds into the plan for every row the KNN index
-- scan visits in distance order — since the geom GiST index has no
-- awareness of which rows belong to which dataset, it must walk
-- index-order candidates one at a time (re-running the RLS EXISTS check
-- each time) until one happens to also match `dataset_id`/`source_name`.
-- Cheap when bypassing RLS (fix-up #2 measured 174ms via the superuser CLI
-- connection), materially more expensive per-candidate under RLS.
--
-- Fixed by reusing this project's own already-proven pattern for
-- exposure_features proximity queries — `compute_zonal_stats`
-- (spec 008, supabase/migrations/20260706170000_impact_analysis.sql):
-- `ST_DWithin(geom::geography, point::geography, radius * 1000)` as a
-- bounded WHERE filter (uses the geom GiST index directly, no per-row KNN
-- walk), scoped to the rule's own `proximity_distance_km` — we only ever
-- need to know whether ANY feature is within that specific threshold, not
-- the globally nearest one, so bounding the search first is strictly
-- correct here (not just faster) in addition to matching a pattern this
-- codebase already runs live under RLS without issue.
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

    -- Proximity condition — bounded ST_DWithin (see header comment), the
    -- same indexed-and-RLS-proven pattern as compute_zonal_stats (spec 008).
    IF v_rule.proximity_exposure_source_name IS NOT NULL THEN
      SELECT EXISTS(
        SELECT 1 FROM exposure_datasets
        WHERE country_code = p_country_code AND source_name = v_rule.proximity_exposure_source_name
      ) INTO v_layer_exists;

      IF NOT v_layer_exists THEN
        v_missing := array_append(v_missing, format('missing exposure layer: %s', v_rule.proximity_exposure_source_name));
      ELSE
        SELECT MIN(ST_Distance(ef.geom::geography, v_event_point::geography)) / 1000.0
        INTO v_distance_km
        FROM exposure_features ef
        JOIN exposure_datasets ed ON ed.id = ef.dataset_id
        WHERE ed.country_code = p_country_code
          AND ed.source_name = v_rule.proximity_exposure_source_name
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
