-- =====================================================
-- WorldPop Raster Population Exposure Source (feature 043)
--
-- Adds 'population_raster' as a new data_sources/rejected_payloads
-- hazard_type value, kept distinct from Kontur's existing 'population'
-- hazard type so the two sources' health/config rows never collide — they
-- are independently toggleable population layers (spec.md US1/US2), not
-- variants of one source. Follows the exact precedent set by features
-- 040/041's hazard_type additions.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs (data-model.md) ─────────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster'
  ));

-- ── 2. hazard_types row ──────────────────────────────────────────────────────
-- category = 'exposure' already CHECK-allowed since feature 038 — no
-- constraint change needed. Automatically excluded from the alertable
-- hazard picker (src/stores/hazardTypes.js's alertableHazardTypes), same as
-- 'population'/'roads'/'rivers'/'basins'.
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('population_raster', 'Population (Raster-Derived)', 'exposure',
   'Population exposure aggregated from raster/GeoTIFF sources (WorldPop) into H3 hexagons — a second, independently-sourced estimate distinct from Kontur''s pre-aggregated population')
ON CONFLICT (code) DO NOTHING;

-- ── 3. Seed data_sources row ─────────────────────────────────────────────────
-- endpoint_url points at WorldPop's per-country API; the actual raster
-- download URL is resolved at import time (worldPopFetch.ts), not stored
-- here. poll_interval_seconds = 30d, staleness_threshold_seconds = 90d —
-- WorldPop republishes rasters roughly annually, matching rivers/basins'
-- slow-changing cadence, not roads' weekly one.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('WorldPop', 'population_raster', 'https://hub.worldpop.org/rest/data/pop/wpgp', '{}', 2592000, 7776000, 3, true, 'healthy', NULL);
