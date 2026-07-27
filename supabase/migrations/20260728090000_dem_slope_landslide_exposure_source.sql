-- =====================================================
-- DEM slope (landslide susceptibility) exposure source + cascade rules
--
-- Adds 'dem_slope' as a new exposure_datasets source, populated by
-- raster-importer/import-dem-slope.ts from Copernicus GLO-30 (~30m)
-- elevation tiles (see supabase/functions/shared/demSlopeFetch.ts /
-- demSlopeAggregate.ts). Unlike every other exposure source in this
-- project, the importer only writes hexagons whose mean slope already
-- clears LANDSLIDE_SLOPE_THRESHOLD_DEG (20°, rasterSourceConfig.ts) —
-- "steep-terrain zones", not "slope everywhere" — so this dataset stays
-- sparse and its existing proximity_distance_km cascade condition ("is
-- there a steep-terrain zone within Xkm of the epicenter") is meaningful,
-- reusing evaluate_cascade_rules() completely unchanged.
--
-- Follows the same "widen CHECK, add hazard_types row, add data_sources
-- row" pattern as 20260722180000_gdo_anomaly_exposure_sources.sql.
-- automation_kind='manual': like Meta/HDX Population, terrain does not
-- change on any meaningful cadence, so no scheduled cron trigger exists
-- (see the docker-compose.yml entry for import-dem-slope.ts) —
-- someone runs it by hand once per country, not on a recurring schedule.
-- =====================================================

ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly',
    'rainfall', 'shelters',
    'landslide_susceptibility'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly',
    'rainfall', 'shelters',
    'landslide_susceptibility'
  ));

INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('landslide_susceptibility', 'Landslide Susceptibility (DEM slope)', 'exposure',
   'Copernicus GLO-30-derived steep-terrain zones (mean slope >= 20 deg) — not an alertable hazard event, used by cascade_rules proximity checks and the Impact Analysis map overlay')
ON CONFLICT (code) DO NOTHING;

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code, automation_kind)
SELECT 'Copernicus GLO-30 DEM', 'landslide_susceptibility',
  'https://copernicus-dem-30m.s3.amazonaws.com/', '{}', 2592000, 31536000, 3,
  true, 'healthy', NULL, 'manual'
WHERE NOT EXISTS (SELECT 1 FROM data_sources WHERE name = 'Copernicus GLO-30 DEM');

-- ── Starter landslide cascade rule (TR/MG/MY) ───────────────────────────────
-- Same "starter/example, editable" framing as the earlier flood/epidemic
-- seed migration — literature-grounded (USGS coseismic-landslide
-- susceptibility research), not an authoritative threshold. A tighter
-- proximity_distance_km (5) than the flood rule (10): landslide triggering
-- is a much more localized effect than river-adjacent liquefaction.
INSERT INTO cascade_rules (
  country_code, trigger_hazard_type, min_magnitude,
  proximity_exposure_source_name, proximity_distance_km,
  secondary_risk_category, recommendation_template, is_active
)
SELECT v.country_code, v.trigger_hazard_type, v.min_magnitude,
       v.proximity_exposure_source_name, v.proximity_distance_km,
       v.secondary_risk_category, v.recommendation_template, true
FROM (VALUES
  ('tr', 'earthquake', 6.0, 'dem_slope', 5.0, 'landslide',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki dik/eğimli arazide heyelan veya kaya düşmesi riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('mg', 'earthquake', 6.0, 'dem_slope', 5.0, 'landslide',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki dik/eğimli arazide heyelan veya kaya düşmesi riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.'),
  ('my', 'earthquake', 6.0, 'dem_slope', 5.0, 'landslide',
   '[[area]] bölgesinde M[[magnitude]] deprem, [[distance_km]] km yakınındaki dik/eğimli arazide heyelan veya kaya düşmesi riski oluşturabilir. Etkilenen nüfus tahmini: [[affected_population]]. Bu eşik başlangıç/örnek değeridir, yerel uzman tarafından gözden geçirilmelidir.')
) AS v(country_code, trigger_hazard_type, min_magnitude, proximity_exposure_source_name, proximity_distance_km, secondary_risk_category, recommendation_template)
WHERE NOT EXISTS (
  SELECT 1 FROM cascade_rules cr
  WHERE cr.country_code = v.country_code
    AND cr.trigger_hazard_type = v.trigger_hazard_type
    AND cr.secondary_risk_category = v.secondary_risk_category
);
