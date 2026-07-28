-- =====================================================
-- Building footprints exposure source (spec 050 US3)
--
-- Adds 'building_footprints' as a new exposure_datasets source, populated
-- by raster-importer/import-building-footprints.ts from Microsoft's Global
-- ML Building Footprints dataset (verified live-reachable, all three served
-- countries covered — see spec 050's research.md). Aggregated to
-- per-hexagon building COUNT, not one row per building (a served country
-- can have tens of millions of individual buildings).
--
-- Unlike dem_slope, this reuses the EXISTING 'buildings' hazard_type
-- (already present for OpenStreetMap Buildings/critical-infrastructure) —
-- no CHECK-constraint widen needed, this is just a second, different named
-- data source under the same loose category.
-- automation_kind='manual': like Meta/HDX and dem_slope, no scheduled
-- cron trigger exists for this — someone runs it by hand per country.
-- =====================================================

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code, automation_kind)
SELECT 'Microsoft Global ML Building Footprints', 'buildings',
  'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv',
  '{}', 2592000, 31536000, 3, true, 'healthy', NULL, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'Microsoft Global ML Building Footprints');
