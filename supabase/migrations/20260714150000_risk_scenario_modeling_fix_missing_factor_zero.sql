-- =====================================================
-- Risk & Scenario Modeling (spec 039) — fix-up migration #2
--
-- Live-testing finding (tasks.md T035c): with zero risk_indicators
-- configured for a country, compute_risk_area_score('tr','Istanbul',
-- 'earthquake') returned exposure_score/vulnerability_score/
-- coping_capacity_score/composite_score = 0 and missing_factors = [] —
-- exactly the silent-zero anti-pattern FR-007 explicitly forbids.
--
-- Root cause: compute_risk_category_score (fix-up migration #1,
-- 20260714130000) computes `LEAST(10, GREATEST(0, SUM(...)))`. When the
-- inner subquery has zero matching risk_indicators rows, SUM() over zero
-- rows correctly evaluates to NULL — but GREATEST(0, NULL) in Postgres
-- ignores the NULL argument and returns 0, not NULL (GREATEST/LEAST only
-- return NULL when *every* argument is NULL). The original inline version
-- (before fix-up #1) had an explicit `CASE WHEN COUNT(*) = 0 THEN NULL`
-- guard that was accidentally dropped during that refactor. Restored here.
-- =====================================================

CREATE OR REPLACE FUNCTION compute_risk_category_score(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_category TEXT
)
RETURNS DOUBLE PRECISION
LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE LEAST(10, GREATEST(0, SUM(weighted_normalized_value)))
         END
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
