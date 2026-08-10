-- =====================================================
-- Risk Score Confidence Interval (spec 057)
--
-- risk_area_scores.composite_score has always been a single point value
-- (spec 039). This adds a low/high band alongside it, derived from how many
-- underlying data points (hazard events, exposure/vulnerability/coping
-- capacity feature rows) fed the score — an inverse-sqrt-of-sample-size
-- heuristic band, not a fitted statistical CI (no per-indicator variance is
-- stored anywhere to compute a rigorous one). A small sample still yields a
-- number, but the band widens to make that thinness visible instead of
-- presenting a single number with false precision.
--
-- Additive only: compute_hazard_area_score/get_hazard_area_event_magnitudes
-- and every other caller of the 039 functions are untouched.
-- =====================================================

ALTER TABLE risk_area_scores
  ADD COLUMN IF NOT EXISTS composite_score_low  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS composite_score_high DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS confidence_sample_size INTEGER;

-- ── compute_hazard_area_event_count: same polygon/lookup as
-- compute_hazard_area_score, but returns the raw qualifying event count
-- instead of the 0-10 score, so the confidence band can use it without
-- changing compute_hazard_area_score's existing return type/callers
-- (cascade auto-alert trigger, spec 048/049, calls it directly).
CREATE OR REPLACE FUNCTION compute_hazard_area_event_count(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_hazard_type TEXT,
  p_lookback_years INTEGER DEFAULT 20
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_area_geom geometry;
  v_event_count INTEGER;
BEGIN
  SELECT ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326) INTO v_area_geom
  FROM country_boundaries,
       jsonb_array_elements(geojson -> 'features') AS feature
  WHERE country_boundaries.country_code = p_country_code
    AND (feature -> 'properties' ->> (SELECT name_property FROM country_boundaries cb WHERE cb.country_code = p_country_code)) = p_admin_boundary_code
  LIMIT 1;

  IF v_area_geom IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_event_count
  FROM hazard_event_history_view h
  WHERE h.hazard_type = p_hazard_type
    AND h.country_code = p_country_code
    AND h.time >= NOW() - (p_lookback_years || ' years')::INTERVAL
    AND ST_Within(ST_SetSRID(ST_MakePoint(h.lng, h.lat), 4326), v_area_geom);

  RETURN COALESCE(v_event_count, 0);
END;
$$;

-- ── compute_risk_area_score: same formula as spec 039 (fix_missing_factor_zero
-- revision), now also capturing each factor's underlying row count and
-- writing a confidence band alongside composite_score.
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
  v_hazard_count INTEGER;
  v_exposure_count INTEGER;
  v_vulnerability_count INTEGER;
  v_coping_count INTEGER;
  v_sample_size INTEGER;
  v_margin DOUBLE PRECISION;
  v_low DOUBLE PRECISION;
  v_high DOUBLE PRECISION;
  v_result risk_area_scores;
BEGIN
  v_hazard_score := compute_hazard_area_score(p_country_code, p_admin_boundary_code, p_hazard_type);
  v_hazard_count := compute_hazard_area_event_count(p_country_code, p_admin_boundary_code, p_hazard_type);
  IF v_hazard_score IS NULL THEN v_missing := array_append(v_missing, 'hazard'); END IF;

  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE
      LEAST(10, GREATEST(0, SUM(
        ri.weight * 10 * (AVG(ef.metric_value) - ri.normalize_min) / NULLIF(ri.normalize_max - ri.normalize_min, 0)
      )))
    END,
    COUNT(*)
  INTO v_exposure_score, v_exposure_count
  FROM risk_indicators ri
  JOIN exposure_features ef ON ef.dataset_id = ri.exposure_dataset_id AND ef.admin_boundary_code = p_admin_boundary_code
  WHERE ri.country_code = p_country_code AND ri.category = 'exposure'
  GROUP BY ri.category;
  IF v_exposure_score IS NULL THEN v_missing := array_append(v_missing, 'exposure'); END IF;

  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE
      LEAST(10, GREATEST(0, SUM(
        ri.weight * 10 * (AVG(ef.metric_value) - ri.normalize_min) / NULLIF(ri.normalize_max - ri.normalize_min, 0)
      )))
    END,
    COUNT(*)
  INTO v_vulnerability_score, v_vulnerability_count
  FROM risk_indicators ri
  JOIN exposure_features ef ON ef.dataset_id = ri.exposure_dataset_id AND ef.admin_boundary_code = p_admin_boundary_code
  WHERE ri.country_code = p_country_code AND ri.category = 'vulnerability'
  GROUP BY ri.category;
  IF v_vulnerability_score IS NULL THEN v_missing := array_append(v_missing, 'vulnerability'); END IF;

  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE
      LEAST(10, GREATEST(0, SUM(
        ri.weight * 10 * (AVG(ef.metric_value) - ri.normalize_min) / NULLIF(ri.normalize_max - ri.normalize_min, 0)
      )))
    END,
    COUNT(*)
  INTO v_coping_capacity_score, v_coping_count
  FROM risk_indicators ri
  JOIN exposure_features ef ON ef.dataset_id = ri.exposure_dataset_id AND ef.admin_boundary_code = p_admin_boundary_code
  WHERE ri.country_code = p_country_code AND ri.category = 'coping_capacity'
  GROUP BY ri.category;
  IF v_coping_capacity_score IS NULL THEN v_missing := array_append(v_missing, 'coping_capacity'); END IF;

  IF array_length(v_missing, 1) IS NULL THEN
    v_composite_score := (v_hazard_score / 10.0) * (v_exposure_score / 10.0)
      * (v_vulnerability_score / 10.0) * ((10.0 - v_coping_capacity_score) / 10.0) * 10;

    v_sample_size := LEAST(v_hazard_count, v_exposure_count, v_vulnerability_count, v_coping_count);
    -- Band width shrinks as sqrt(sample_size) grows; a single-row factor
    -- (sample_size = 1) yields a ±100%-of-score band, a 25-row factor
    -- yields a ±20% band. Clamped to the score's valid 0-10 range.
    v_margin := v_composite_score / SQRT(GREATEST(v_sample_size, 1));
    v_low := GREATEST(0, v_composite_score - v_margin);
    v_high := LEAST(10, v_composite_score + v_margin);
  END IF;

  SELECT jsonb_agg(jsonb_build_object('id', id, 'category', category, 'weight', weight))
  INTO v_config_snapshot
  FROM risk_indicators WHERE country_code = p_country_code;

  INSERT INTO risk_area_scores (
    country_code, admin_boundary_code, hazard_type, hazard_score, exposure_score,
    vulnerability_score, coping_capacity_score, composite_score, missing_factors,
    indicator_config_snapshot, composite_score_low, composite_score_high, confidence_sample_size
  ) VALUES (
    p_country_code, p_admin_boundary_code, p_hazard_type, v_hazard_score, v_exposure_score,
    v_vulnerability_score, v_coping_capacity_score, v_composite_score, v_missing,
    v_config_snapshot, v_low, v_high, v_sample_size
  ) RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;
