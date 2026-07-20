-- =====================================================
-- OSM/Overpass Critical-Facility Buildings Exposure Source (spec 044)
-- "OpenBuildingMap" line item, Data Sources Inventory §8 (moved from
-- "evaluated but not integrated" to live, following import-osm-roads'
-- (feature 040) exact precedent).
--
-- Scope is critical facilities (hospitals/clinics, schools/universities,
-- fire/police/government), not every OSM building — see
-- osmBuildingsFetch.ts's header comment. asset_category values match the
-- taxonomy get_critical_infrastructure_features() already filters on
-- (20260707195000_impact_analysis_gaps.sql), not a new one.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs ──────────────────────────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings'
  ));

-- ── 2. hazard_types row ───────────────────────────────────────────────────────
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('buildings', 'Critical Facilities', 'exposure', 'Hospitals, schools, and emergency-service buildings from OpenStreetMap (not an alertable hazard) — used by Impact Analysis')
ON CONFLICT (code) DO NOTHING;

-- ── 3. Seed data_sources row ──────────────────────────────────────────────────
-- poll_interval_seconds = 604800 (7d), matching OpenStreetMap Roads' cadence
-- — critical-facility locations change far less often than real-time hazard
-- feeds.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('OpenStreetMap Buildings', 'buildings', 'https://overpass-api.de/api/interpreter', '{}', 604800, 2592000, 3, true, 'healthy', NULL);
