-- =====================================================
-- HydroRIVERS/HydroBASINS River & Watershed Exposure Sources (feature 041)
--
-- Adds 'rivers' and 'basins' as new data_sources/rejected_payloads
-- hazard_type values, following the exact precedent set by feature 040's
-- 'roads' addition. Neither is a live-queryable-per-country API like
-- Overpass — both are continent-scale static file downloads, clipped to
-- each served country's boundary at import time (research.md §4) — but the
-- storage/health-tracking shape is identical to every other exposure source.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs (data-model.md) ─────────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins'
  ));

-- ── 2. hazard_types rows ─────────────────────────────────────────────────────
-- category = 'exposure' already CHECK-allowed since feature 038 — no
-- constraint change needed. Automatically excluded from the alertable
-- hazard picker (src/stores/hazardTypes.js's alertableHazardTypes), same as
-- 'population'/'roads'.
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('rivers', 'River Network', 'exposure', 'HydroRIVERS global river-network line features — used by Impact Analysis'),
  ('basins', 'Watershed Boundaries', 'exposure', 'HydroBASINS level-6 sub-basin polygon features — used by Impact Analysis')
ON CONFLICT (code) DO NOTHING;

-- ── 3. Seed data_sources rows ─────────────────────────────────────────────────
-- endpoint_url points at HydroSHEDS' distribution directory; the actual
-- per-country continent file + level selection is resolved at import time
-- (hydroshedsContinent.ts), not stored here. poll_interval_seconds = 30d,
-- staleness_threshold_seconds = 90d — river/basin geometry changes on the
-- order of years, far slower than roads' weekly cadence.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('HydroRIVERS', 'rivers', 'https://data.hydrosheds.org/file/HydroRIVERS/', '{}', 2592000, 7776000, 3, true, 'healthy', NULL),
  ('HydroBASINS', 'basins', 'https://data.hydrosheds.org/file/hydrobasins/standard/', '{}', 2592000, 7776000, 3, true, 'healthy', NULL);
