-- =====================================================
-- GDO Soil Moisture Anomaly + FAPAR Anomaly Exposure Sources (spec 047 pivot)
--
-- spec 047 assumed these needed a new Python/GDAL NetCDF service. Live-
-- verified 2026-07-22 that's wrong: the same WCS 2.0.0 endpoint
-- gdo_spi_exposure_source.sql already uses also serves both as ready-made
-- GeoTIFF coverages (smand / fpanv) — see gdoAnomalyFetch.ts's header
-- comment for the full finding. No NetCDF parsing needed, closes spec
-- 047's User Story 1 via the existing Deno pipeline instead.
--
-- Two NEW hazard_types (not reusing 'drought_index' from GDO SPI): soil
-- moisture anomaly and fAPAR (vegetation) anomaly are conceptually
-- distinct indicators from SPI, each wants its own admin-UI grouping/
-- toggle, same reasoning as gdo_spi_exposure_source.sql's own choice not
-- to reuse the discrete-event 'drought' hazard_type.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs ──────────────────────────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index', 'soil_moisture_anomaly', 'vegetation_anomaly'
  ));

-- ── 2. hazard_types rows ─────────────────────────────────────────────────────
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('soil_moisture_anomaly', 'Soil Moisture Anomaly', 'exposure',
   'GDO Ensemble Soil Moisture Anomaly grid cells (not an alertable hazard event) — used by Impact Analysis map overlay'),
  ('vegetation_anomaly', 'Vegetation (fAPAR) Anomaly', 'exposure',
   'GDO fAPAR Anomaly (VIIRS) grid cells (not an alertable hazard event) — used by Impact Analysis map overlay')
ON CONFLICT (code) DO NOTHING;

-- ── 3. Seed data_sources rows ──────────────────────────────────────────────────
-- poll_interval_seconds/staleness match GDO SPI's own choice (30d poll,
-- 60d staleness) — same publisher, no reason to assume a different
-- release cadence without evidence.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('GDO Soil Moisture Anomaly', 'soil_moisture_anomaly',
   'https://drought.emergency.copernicus.eu/api/wcs?map=DO_WCS&coverageID=smand',
   '{}', 2592000, 5184000, 3, true, 'healthy', NULL),
  ('GDO fAPAR Anomaly (VIIRS)', 'vegetation_anomaly',
   'https://drought.emergency.copernicus.eu/api/wcs?map=DO_WCS&coverageID=fpanv',
   '{}', 2592000, 5184000, 3, true, 'healthy', NULL);

-- ── 4. Monthly cron triggers ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_gdo_soil_moisture_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_gdo_soil_moisture_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-gdo-soil-moisture',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION trigger_gdo_fapar_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_gdo_fapar_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-gdo-fapar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Monthly (1st of month), staggered after GDO SPI's 09:00 UTC slot.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-soil-moisture-monthly') THEN
    PERFORM cron.unschedule('import-gdo-soil-moisture-monthly');
  END IF;
  PERFORM cron.schedule(
    'import-gdo-soil-moisture-monthly',
    '0 10 1 * *',
    $job$SELECT trigger_gdo_soil_moisture_import()$job$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-fapar-monthly') THEN
    PERFORM cron.unschedule('import-gdo-fapar-monthly');
  END IF;
  PERFORM cron.schedule(
    'import-gdo-fapar-monthly',
    '0 11 1 * *',
    $job$SELECT trigger_gdo_fapar_import()$job$
  );
END;
$$;
