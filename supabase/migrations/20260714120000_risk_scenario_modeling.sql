-- =====================================================
-- Risk & Scenario Modeling (spec 039)
--
-- Deterministic, INFORM-methodology-style composite risk score
-- (Hazard x Exposure x Vulnerability x Lack of Coping Capacity), plus
-- hypothetical-scenario storage and a unified view over the 9 existing
-- per-hazard-type event tables. No AI/ML anywhere (FR-005/FR-015) — every
-- number here traces to a documented formula and its stored inputs.
--
-- Additive only: exposure_datasets/exposure_features (spec 008/034/038) and
-- the 9 hazard tables are untouched.
-- =====================================================

-- ── risk_indicators ──────────────────────────────────────────────────────────
-- Tags an existing exposure_datasets row (spec 008's generic upload path) as
-- contributing to one of the three non-Hazard risk factors, with a weight
-- within its category and a normalization range. Category CHECK includes
-- 'exposure' as well as 'vulnerability'/'coping_capacity' (data-model.md §1
-- implementation-time refinement) — one generic tag-and-weight mechanism for
-- all three, rather than a second bespoke "primary exposure dataset" concept.
CREATE TABLE IF NOT EXISTS risk_indicators (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exposure_dataset_id   UUID NOT NULL REFERENCES exposure_datasets(id) ON DELETE CASCADE,
  category              TEXT NOT NULL CHECK (category IN ('vulnerability', 'coping_capacity', 'exposure')),
  weight                DOUBLE PRECISION NOT NULL CHECK (weight > 0 AND weight <= 1),
  normalize_min         DOUBLE PRECISION NOT NULL,
  normalize_max         DOUBLE PRECISION NOT NULL CHECK (normalize_max > normalize_min),
  country_code          VARCHAR(2) NOT NULL,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_indicators_country_category ON risk_indicators (country_code, category);

ALTER TABLE risk_indicators ENABLE ROW LEVEL SECURITY;

-- No anon read policy anywhere in this migration: Vulnerability/Coping
-- Capacity data is exactly the sensitive-data category (poverty, food
-- insecurity) flagged in spec 001's data-privacy guardrail.
DROP POLICY IF EXISTS "super_admin_risk_indicators_all" ON risk_indicators;
CREATE POLICY "super_admin_risk_indicators_all" ON risk_indicators
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_risk_indicators_own" ON risk_indicators;
CREATE POLICY "country_admin_risk_indicators_own" ON risk_indicators
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_risk_indicators_own" ON risk_indicators;
CREATE POLICY "org_admin_risk_indicators_own" ON risk_indicators
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

DROP TRIGGER IF EXISTS audit_risk_indicators ON risk_indicators;
CREATE TRIGGER audit_risk_indicators
  AFTER INSERT OR UPDATE OR DELETE ON risk_indicators
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── risk_area_scores ─────────────────────────────────────────────────────────
-- A computed snapshot, not a live view, so a score stays attributable to the
-- exact indicator weights that produced it even after an admin later changes
-- them (Principle V auditability; spec Edge Cases). Rows are never updated,
-- only inserted — history is retained.
CREATE TABLE IF NOT EXISTS risk_area_scores (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code              VARCHAR(2) NOT NULL,
  admin_boundary_code       TEXT NOT NULL,
  hazard_type               TEXT NOT NULL,
  hazard_score              DOUBLE PRECISION,
  exposure_score            DOUBLE PRECISION,
  vulnerability_score       DOUBLE PRECISION,
  coping_capacity_score     DOUBLE PRECISION,
  composite_score           DOUBLE PRECISION,
  missing_factors           TEXT[] NOT NULL DEFAULT '{}',
  indicator_config_snapshot JSONB,
  computed_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_area_scores_lookup
  ON risk_area_scores (country_code, admin_boundary_code, hazard_type, computed_at DESC);

ALTER TABLE risk_area_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_risk_area_scores_all" ON risk_area_scores;
CREATE POLICY "super_admin_risk_area_scores_all" ON risk_area_scores
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_risk_area_scores_own" ON risk_area_scores;
CREATE POLICY "country_admin_risk_area_scores_own" ON risk_area_scores
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_risk_area_scores_own" ON risk_area_scores;
CREATE POLICY "org_admin_risk_area_scores_own" ON risk_area_scores
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
  );

-- ── hazard_scenarios ─────────────────────────────────────────────────────────
-- Modeled directly on impact_scenarios (spec 008) for *hypothetical* (not
-- real) hazard events.
CREATE TABLE IF NOT EXISTS hazard_scenarios (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  hazard_type              TEXT NOT NULL,
  parameters               JSONB NOT NULL,
  footprint_geojson        JSONB,
  estimated_impact         JSONB,
  formula_range_warning    BOOLEAN NOT NULL DEFAULT false,
  country_code             VARCHAR(2),
  org_id                   UUID REFERENCES organizations(id) ON DELETE SET NULL,
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hazard_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_hazard_scenarios_all" ON hazard_scenarios;
CREATE POLICY "super_admin_hazard_scenarios_all" ON hazard_scenarios
  FOR ALL USING (current_profile_role() = 'super_admin');

DROP POLICY IF EXISTS "country_admin_hazard_scenarios_own" ON hazard_scenarios;
CREATE POLICY "country_admin_hazard_scenarios_own" ON hazard_scenarios
  FOR ALL USING (
    current_profile_role() = 'country_admin'
    AND country_code = current_profile_country_code()
  );

DROP POLICY IF EXISTS "org_admin_hazard_scenarios_own" ON hazard_scenarios;
CREATE POLICY "org_admin_hazard_scenarios_own" ON hazard_scenarios
  FOR ALL USING (
    current_profile_role() = 'org_admin'
    AND country_code = current_profile_country_code()
    AND org_id = current_profile_org_id()
  );

DROP TRIGGER IF EXISTS audit_hazard_scenarios ON hazard_scenarios;
CREATE TRIGGER audit_hazard_scenarios
  AFTER INSERT OR UPDATE OR DELETE ON hazard_scenarios
  FOR EACH ROW EXECUTE FUNCTION log_table_change();

-- ── hazard_event_history_view ────────────────────────────────────────────────
-- Additive UNION ALL over the 9 existing per-hazard-type tables, which
-- already accumulate real historical events (upsert on source id, never
-- pruned — verified live, research.md §1). No schema change to any of them.
CREATE OR REPLACE VIEW hazard_event_history_view AS
  SELECT 'earthquake'::TEXT AS hazard_type, lat, lng, severity, magnitude, time, country_code FROM earthquake
  UNION ALL
  SELECT 'wildfire',      lat, lng, severity, magnitude, time, country_code FROM wildfire
  UNION ALL
  SELECT 'flood',         lat, lng, severity, magnitude, time, country_code FROM flood
  UNION ALL
  SELECT 'drought',       lat, lng, severity, magnitude, time, country_code FROM drought
  UNION ALL
  SELECT 'tsunami',       lat, lng, severity, magnitude, time, country_code FROM tsunami
  UNION ALL
  SELECT 'cyclone',       lat, lng, severity, magnitude, time, country_code FROM cyclone
  UNION ALL
  SELECT 'volcano',       lat, lng, severity, magnitude, time, country_code FROM volcano
  UNION ALL
  SELECT 'epidemic',      lat, lng, severity, magnitude, time, country_code FROM epidemic
  UNION ALL
  SELECT 'disaster',      lat, lng, severity, magnitude, time, country_code FROM disaster;

-- ── save_risk_indicator: validate category weights sum to 1.0, then upsert ──
CREATE OR REPLACE FUNCTION save_risk_indicator(
  p_exposure_dataset_id UUID,
  p_category TEXT,
  p_weight DOUBLE PRECISION,
  p_normalize_min DOUBLE PRECISION,
  p_normalize_max DOUBLE PRECISION
)
RETURNS risk_indicators
LANGUAGE plpgsql AS $$
DECLARE
  v_country_code VARCHAR(2);
  v_id UUID;
  v_other_weight_sum DOUBLE PRECISION;
  v_result risk_indicators;
BEGIN
  SELECT country_code INTO v_country_code FROM exposure_datasets WHERE id = p_exposure_dataset_id;
  IF v_country_code IS NULL THEN
    RAISE EXCEPTION 'exposure_dataset % has no country_code or does not exist', p_exposure_dataset_id;
  END IF;

  SELECT id INTO v_id FROM risk_indicators WHERE exposure_dataset_id = p_exposure_dataset_id;

  -- Weights within the same country+category MUST sum to 1.0 (FR-002),
  -- excluding this indicator's own prior weight if it already existed.
  SELECT COALESCE(SUM(weight), 0) INTO v_other_weight_sum
  FROM risk_indicators
  WHERE country_code = v_country_code
    AND category = p_category
    AND id IS DISTINCT FROM v_id;

  IF ROUND((v_other_weight_sum + p_weight)::NUMERIC, 4) != 1.0 THEN
    RAISE EXCEPTION 'risk indicator weights for category % in country % must sum to 1.0 (currently % including this one)',
      p_category, v_country_code, (v_other_weight_sum + p_weight);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO risk_indicators (exposure_dataset_id, category, weight, normalize_min, normalize_max, country_code, created_by)
    VALUES (p_exposure_dataset_id, p_category, p_weight, p_normalize_min, p_normalize_max, v_country_code, auth.uid())
    RETURNING * INTO v_result;
  ELSE
    UPDATE risk_indicators
    SET category = p_category, weight = p_weight, normalize_min = p_normalize_min, normalize_max = p_normalize_max
    WHERE id = v_id
    RETURNING * INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

-- ── compute_hazard_area_score: normalized 0-10 Hazard factor for one area ──
-- Resolves the area's polygon from country_boundaries.geojson (matching
-- name_property to admin_boundary_code — the one real spatial join this
-- module needs, since raw hazard events only carry lat/lng, not a
-- pre-assigned area code; data-model.md §3). Score = min(10, event_count / 2)
-- over the lookback window — a simple, documented, auditable frequency
-- scale (not a fitted/ML curve); NULL when zero qualifying events exist so
-- callers never confuse "no data" with "zero risk" (FR-007).
CREATE OR REPLACE FUNCTION compute_hazard_area_score(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_hazard_type TEXT,
  p_lookback_years INTEGER DEFAULT 20
)
RETURNS DOUBLE PRECISION
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
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_event_count
  FROM hazard_event_history_view h
  WHERE h.hazard_type = p_hazard_type
    AND h.country_code = p_country_code
    AND h.time >= NOW() - (p_lookback_years || ' years')::INTERVAL
    AND ST_Within(ST_SetSRID(ST_MakePoint(h.lng, h.lat), 4326), v_area_geom);

  IF v_event_count = 0 THEN
    RETURN NULL;
  END IF;

  RETURN LEAST(10, v_event_count / 2.0);
END;
$$;

-- ── get_hazard_area_event_magnitudes: raw sample for exceedance curves ─────
-- Reuses compute_hazard_area_score's exact polygon-lookup logic (same
-- admin_boundary_code -> country_boundaries.geojson feature match) but
-- returns the raw per-event magnitude values instead of a single 0-10
-- score, since compute-risk-exceedance-curve (Edge Function) needs the
-- actual historical sample to bootstrap-resample from (research.md §6),
-- not a pre-aggregated number.
CREATE OR REPLACE FUNCTION get_hazard_area_event_magnitudes(
  p_country_code VARCHAR(2),
  p_admin_boundary_code TEXT,
  p_hazard_type TEXT,
  p_lookback_years INTEGER DEFAULT 20
)
RETURNS SETOF DOUBLE PRECISION
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_area_geom geometry;
BEGIN
  SELECT ST_SetSRID(ST_GeomFromGeoJSON(feature -> 'geometry'), 4326) INTO v_area_geom
  FROM country_boundaries,
       jsonb_array_elements(geojson -> 'features') AS feature
  WHERE country_boundaries.country_code = p_country_code
    AND (feature -> 'properties' ->> (SELECT name_property FROM country_boundaries cb WHERE cb.country_code = p_country_code)) = p_admin_boundary_code
  LIMIT 1;

  IF v_area_geom IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT COALESCE(h.magnitude, 0)
  FROM hazard_event_history_view h
  WHERE h.hazard_type = p_hazard_type
    AND h.country_code = p_country_code
    AND h.time >= NOW() - (p_lookback_years || ' years')::INTERVAL
    AND ST_Within(ST_SetSRID(ST_MakePoint(h.lng, h.lat), 4326), v_area_geom);
END;
$$;

-- ── compute_risk_area_score: combine all four factors, write a snapshot ────
-- Exposure/Vulnerability/Coping Capacity factors are each the weighted,
-- normalized-to-0-10 sum of that category's risk_indicators, evaluated over
-- exposure_features tagged with this admin_boundary_code (spec 034
-- convention). Composite = product of all four normalized-to-0-1 factors,
-- scaled back to 0-10 — the standard Hazard x Exposure x Vulnerability x
-- (Lack of) Coping Capacity form (spec Assumptions). NULL composite whenever
-- any factor is NULL (FR-007) — never silently substitute zero.
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

  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL ELSE
      LEAST(10, GREATEST(0, SUM(
        ri.weight * 10 * (AVG(ef.metric_value) - ri.normalize_min) / NULLIF(ri.normalize_max - ri.normalize_min, 0)
      )))
    END
  INTO v_exposure_score
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
    END
  INTO v_vulnerability_score
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
    END
  INTO v_coping_capacity_score
  FROM risk_indicators ri
  JOIN exposure_features ef ON ef.dataset_id = ri.exposure_dataset_id AND ef.admin_boundary_code = p_admin_boundary_code
  WHERE ri.country_code = p_country_code AND ri.category = 'coping_capacity'
  GROUP BY ri.category;
  IF v_coping_capacity_score IS NULL THEN v_missing := array_append(v_missing, 'coping_capacity'); END IF;

  IF array_length(v_missing, 1) IS NULL THEN
    -- Lack of Coping Capacity = 10 - coping_capacity_score (formula uses the
    -- "lack of" direction, spec Assumptions/US2 acceptance scenario 3: lower
    -- coping capacity => higher risk).
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
