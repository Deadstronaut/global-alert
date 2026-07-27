-- =====================================================
-- Cascading Hazard Risk (spec 048) — fix-up migration #5
--
-- Live-testing finding: fix-up #4's dataset-lookup-separated query still
-- timed out under a real authenticated (super_admin) session, reproduced
-- directly by simulating the exact session via `SET LOCAL role
-- authenticated; set_config('request.jwt.claims', ...)` and running the
-- *exact* internal statement from evaluate_cascade_rules in isolation —
-- confirmed it alone hits the `authenticated` role's 8s statement_timeout.
--
-- Root cause, finally isolated: it was never the query shape (join vs.
-- plain equality, KNN vs. ST_DWithin all produced the identical timeout) —
-- it's `exposure_features`'s RLS policy itself. That policy's USING clause
-- calls `current_profile_role()`/`current_profile_country_code()` (each a
-- real `SELECT ... FROM profiles WHERE id = auth.uid()` lookup) inside an
-- EXISTS subquery that Postgres re-evaluates for every one of the up to
-- ~40,000 `exposure_features` rows a given dataset (e.g. HydroRIVERS/TR)
-- contains — even though the functions are marked STABLE, Postgres does
-- not hoist a no-argument STABLE function out of a per-row RLS filter in
-- this shape. ~40k row-level `profiles` lookups is what actually blew the
-- 8s budget, not the spatial predicate (confirmed cheap, ~4ms, when RLS
-- was bypassed).
--
-- Fixed the way this exact class of problem is already solved elsewhere in
-- this codebase (e.g. get_access_review(), compute_data_completeness()):
-- mark evaluate_cascade_rules SECURITY DEFINER so its internal reads of
-- exposure_datasets/exposure_features/cascade_rules run as the function
-- owner and bypass RLS entirely (no table here has FORCE ROW LEVEL
-- SECURITY, so ordinary RLS bypass-by-owner applies) — eliminating the
-- per-row cost altogether rather than trying to out-optimize it. Since
-- this removes RLS as the access-control boundary for this call, an
-- explicit authorization check (identical to the three-tier rule already
-- enforced by cascade_rules'/cascading_risk_assessments' own RLS policies)
-- is added at the top of the function so country-scoping is still
-- enforced, just explicitly rather than implicitly via RLS.
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
  v_vulnerability_score DOUBLE PRECISION;
  v_input_values JSONB;
  v_affected_population DOUBLE PRECISION;
  v_recommendation_text TEXT;
  v_assessment_id UUID;
  v_event_point geometry;
BEGIN
  -- Explicit authorization check (SECURITY DEFINER bypasses RLS below, so
  -- this replaces it as the access-control boundary — same three-tier
  -- rule cascade_rules'/cascading_risk_assessments' own RLS already
  -- enforces): super_admin sees everything; country_admin/org_admin only
  -- their own country.
  IF NOT (
    current_profile_role() = 'super_admin'
    OR (
      current_profile_role() IN ('country_admin', 'org_admin')
      AND p_country_code = current_profile_country_code()
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to evaluate cascade rules for country %', p_country_code;
  END IF;

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

    -- Proximity condition
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
