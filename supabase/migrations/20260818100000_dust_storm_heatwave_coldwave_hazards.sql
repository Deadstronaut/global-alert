-- =====================================================
-- Dust Storm / Heatwave / Coldwave — new alertable hazard types
--
-- Both underlying data sources were already fetched live by wind-importer
-- (Copernicus ADS CAMS dust_aerosol_optical_depth_550nm via
-- fetch_overlay_cams.py, and NOAA GFS 2m temperature via fetch_gfs.py) but
-- only ever reached the app as a visual "Overlay" texture layer in the
-- Wind & Currents panel — never wired into the hazard/alert pipeline.
--
-- No new table/view is needed — any hazard_type with no dedicated table
-- falls into the existing generic `disaster` bucket table/view (see
-- supabaseService.js's TABLE_MAP comment: "Yeni bir hazard type
-- eklendiğinde BU LİSTEYE satır eklenmez"). The new detector
-- (wind-importer/hazard_detector.py) writes rows with type='dust_storm' |
-- 'heatwave' | 'coldwave' straight into `disaster`, and the map/marker-icon
-- pipeline is already fully data-driven off hazard_types (icon/color) — no
-- frontend code change required for these to appear correctly.
--
-- data_sources_hazard_type_check DOES still need widening here, even
-- though 20260727000000_hazard_types_icon_color_and_generic_fk.sql already
-- replaced it with an FK against hazard_types: 20260728090000
-- (dem_slope_landslide_exposure_source.sql), which ran AFTER that
-- migration, re-added a fixed-list CHECK constraint of the same name —
-- apparently not realizing the FK already made it redundant. Live-verified
-- 2026-08-18 (this migration's own first `supabase db push` attempt 23514'd
-- against this exact constraint) — so until that redundant CHECK is
-- cleaned up for real, every new hazard_type still needs one more allow-list
-- widening, same as every pre-20260727 hazard-type migration did.
--
-- Severity metrics:
--   dust_storm: 'aod550' (dust aerosol optical depth @ 550nm, dimensionless
--     0-2 domain per overlay_texture.py's DUST_AOD_DOMAIN, live-verified
--     2026-08-06 real-world max ~1.28).
--   heatwave:   'temp_c' (GFS 2m air temperature, already Celsius).
--   coldwave:   'cold_index_c' = -1 * temp_c, so severity still increases
--     with an ASCENDING metric value (colder = higher cold_index) — the
--     hazard_thresholds table's own trigger (validate_hazard_breakpoints)
--     requires strictly-ascending min_value, so a "worse as it gets more
--     negative" metric can't be expressed directly.
--
-- These are starter/example thresholds (same framing as the DEM-slope
-- cascade rule's own seed data) — tune via the existing Hazard Taksonomisi
-- admin panel (HazardThresholdEditor.vue), no code change needed to adjust.
-- =====================================================

ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly',
    'rainfall', 'shelters',
    'landslide_susceptibility',
    'dust_storm', 'heatwave', 'coldwave'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly',
    'rainfall', 'shelters',
    'landslide_susceptibility',
    'dust_storm', 'heatwave', 'coldwave'
  ));

INSERT INTO hazard_types (code, display_name, category, description, icon, color) VALUES
  ('dust_storm', 'Dust Storm', 'meteo',
   'Dust aerosol optical depth detected via Copernicus CAMS (Atmosphere Data Store) — threshold-crossing regions synthesized into discrete events by wind-importer/hazard_detector.py',
   '🌪️', '#c2a878'),
  ('heatwave', 'Heatwave', 'meteo',
   '2m air temperature (NOAA GFS) — threshold-crossing regions synthesized into discrete events by wind-importer/hazard_detector.py',
   '🌡️', '#ef4444'),
  ('coldwave', 'Coldwave', 'meteo',
   '2m air temperature (NOAA GFS), cold extreme — threshold-crossing regions synthesized into discrete events by wind-importer/hazard_detector.py',
   '🥶', '#38bdf8')
ON CONFLICT (code) DO NOTHING;

INSERT INTO hazard_thresholds (hazard_type_code, metric_name, unit, breakpoints) VALUES
  ('dust_storm', 'aod550', NULL, '[
    {"min_value": 0.0, "severity": "minimal"},
    {"min_value": 0.3, "severity": "low"},
    {"min_value": 0.6, "severity": "moderate"},
    {"min_value": 1.0, "severity": "high"},
    {"min_value": 1.5, "severity": "critical"}
  ]'::jsonb),
  ('heatwave', 'temp_c', '°C', '[
    {"min_value": 27, "severity": "minimal"},
    {"min_value": 32, "severity": "low"},
    {"min_value": 39, "severity": "moderate"},
    {"min_value": 46, "severity": "high"},
    {"min_value": 52, "severity": "critical"}
  ]'::jsonb),
  ('coldwave', 'cold_index_c', '°C below 0', '[
    {"min_value": 0,  "severity": "minimal"},
    {"min_value": 10, "severity": "low"},
    {"min_value": 18, "severity": "moderate"},
    {"min_value": 30, "severity": "high"},
    {"min_value": 40, "severity": "critical"}
  ]'::jsonb)
ON CONFLICT (hazard_type_code) DO NOTHING;

-- Catalog entries (admin "Kaynaklar" panel visibility) — automation_kind
-- 'scheduled' matches wind-importer's own 6-hourly loop (main.py's
-- REFRESH_INTERVAL_S), not an admin-managed polled endpoint (no single
-- endpoint_url really represents a synthesized detector, so this is
-- documentation/status-tracking only, same spirit as the DEM-slope
-- 'manual' row).
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code, automation_kind)
SELECT 'Copernicus CAMS Dust AOD (wind-importer)', 'dust_storm',
  'https://ads.atmosphere.copernicus.eu/api', '{}', 21600, 86400, 3,
  true, 'healthy', NULL, 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'Copernicus CAMS Dust AOD (wind-importer)');

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code, automation_kind)
SELECT 'NOAA GFS 2m Temperature — Heatwave (wind-importer)', 'heatwave',
  'https://nomads.ncep.noaa.gov', '{}', 21600, 86400, 3,
  true, 'healthy', NULL, 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'NOAA GFS 2m Temperature — Heatwave (wind-importer)');

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code, automation_kind)
SELECT 'NOAA GFS 2m Temperature — Coldwave (wind-importer)', 'coldwave',
  'https://nomads.ncep.noaa.gov', '{}', 21600, 86400, 3,
  true, 'healthy', NULL, 'scheduled'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'NOAA GFS 2m Temperature — Coldwave (wind-importer)');
