-- =====================================================
-- Risk & Scenario Modeling (spec 039) — fix-up migration
--
-- compute_risk_area_score's original body nested SUM(...AVG(...)...)
-- directly in one SELECT, which Postgres rejects
-- (42803: aggregate function calls cannot be nested) — caught by live
-- testing against the real deployed function (compute_hazard_area_score
-- itself worked correctly and returned a real score for Istanbul/tr/
-- earthquake; compute_risk_area_score errored). Fixed by factoring the
-- "weighted normalized composite for one category" computation into its
-- own STABLE helper function using a two-step aggregation (inner AVG per
-- indicator, outer SUM across indicators) instead of nesting them in one
-- SELECT — reused identically for exposure/vulnerability/coping_capacity
-- rather than repeating the (buggy) inline pattern three times.
-- =====================================================

CREATE OR REPLACE FUNCTION compute_risk_category_score(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_category TEXT
)
RETURNS DOUBLE PRECISION
LANGUAGE sql STABLE AS $$
  SELECT LEAST(10, GREATEST(0, SUM(weighted_normalized_value)))
  FROM (
    SELECT
      ri.weight * 10 * (AVG(ef.metric_value) - ri.normalize_min) / NULLIF(ri.normalize_max - ri.normalize_min, 0)
        AS weighted_normalized_value
    FROM risk_indicators ri
    JOIN exposure_features ef
      ON ef.dataset_id = ri.exposure_dataset_id
     AND ef.admin_boundary_code = p_admin_boundary_code
    WHERE ri.country_code = p_country_code
      AND ri.category = p_category
    GROUP BY ri.id, ri.weight, ri.normalize_min, ri.normalize_max
  ) per_indicator;
$$;

CREATE OR REPLACE FUNCTION compute_risk_area_score(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_hazard_type TEXT
)
RETURNS risk_area_scores
LANGUAGE plpgsql AS $$
DECLARE
  v_hazard_score DOUBLE PRECISION;
  v_exposure_score DOUBLE PRECISION;
  v_vulnerability_score DOUBLE PRECISION;
  v_coping_capacity_score DOUBLE PRECISION;
  v_composite_score DOUBLE PRECISION;
  v_missing TEXT[] := '{}';
  v_config_snapshot JSONB;
  v_result risk_area_scores;
BEGIN
  v_hazard_score := compute_hazard_area_score(p_country_code, p_admin_boundary_code, p_hazard_type);
  IF v_hazard_score IS NULL THEN v_missing := array_append(v_missing, 'hazard'); END IF;

  v_exposure_score := compute_risk_category_score(p_country_code, p_admin_boundary_code, 'exposure');
  IF v_exposure_score IS NULL THEN v_missing := array_append(v_missing, 'exposure'); END IF;

  v_vulnerability_score := compute_risk_category_score(p_country_code, p_admin_boundary_code, 'vulnerability');
  IF v_vulnerability_score IS NULL THEN v_missing := array_append(v_missing, 'vulnerability'); END IF;

  v_coping_capacity_score := compute_risk_category_score(p_country_code, p_admin_boundary_code, 'coping_capacity');
  IF v_coping_capacity_score IS NULL THEN v_missing := array_append(v_missing, 'coping_capacity'); END IF;

  IF array_length(v_missing, 1) IS NULL THEN
    -- Lack of Coping Capacity = 10 - coping_capacity_score (spec
    -- Assumptions/US2 acceptance scenario 3: lower coping capacity =>
    -- higher risk).
    v_composite_score := (v_hazard_score / 10.0) * (v_exposure_score / 10.0)
      * (v_vulnerability_score / 10.0) * ((10.0 - v_coping_capacity_score) / 10.0) * 10;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'category', category, 'weight', weight))
  INTO v_config_snapshot
  FROM risk_indicators WHERE country_code = p_country_code;

  INSERT INTO risk_area_scores (
    country_code, admin_boundary_code, hazard_type, hazard_score, exposure_score,
    vulnerability_score, coping_capacity_score, composite_score, missing_factors, indicator_config_snapshot
  ) VALUES (
    p_country_code, p_admin_boundary_code, p_hazard_type, v_hazard_score, v_exposure_score,
    v_vulnerability_score, v_coping_capacity_score, v_composite_score, v_missing, v_config_snapshot
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
