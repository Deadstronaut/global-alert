-- =====================================================
-- GDO SPI (GPCC) Drought-Intensity Exposure Source (spec 045)
-- "CHIRPS/SPI" line item, Data Sources Inventory §8 — CHIRPS's own WCS
-- coverage (spcST/spcLT) returns HTTP 500 from GDO's backend
-- (live-verified 2026-07-20), so this uses GDO's GPCC-based SPI coverage
-- (spgTS) instead — see gdoSpiFetch.ts's header comment for the full
-- baseline-period/resolution/update-cadence caveats.
--
-- Deliberately a NEW hazard_type ('drought_index'), not the existing
-- 'drought' used by GDACS/FEWS NET (fetch-droughts/index.ts): that pipeline
-- writes discrete point events to hazard_events with a magnitude scale
-- (IPC phase / GDACS alert level) that hazard_thresholds keys by
-- hazard_type globally, not per-source. SPI's signed -3..+3 scale would
-- collide with that mapping if given the same hazard_type. This source
-- instead writes grid-cell polygons to exposure_datasets/exposure_features
-- (like population_raster/buildings), which has no such shared-severity-
-- function constraint.
-- =====================================================

-- ── 1. Widen hazard_type CHECKs ──────────────────────────────────────────────
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads', 'rivers', 'basins', 'population_raster', 'buildings',
    'drought_index'
  ));

-- ── 2. hazard_types row ───────────────────────────────────────────────────────
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('drought_index', 'Drought Intensity (SPI)', 'exposure',
   'Standardized Precipitation Index grid cells (not an alertable hazard event) — used by Impact Analysis map overlay')
ON CONFLICT (code) DO NOTHING;

-- ── 3. exposure_datasets.source_metadata — machine-readable dataset caveats ──
-- Structured (resolution_deg / baseline_period / update_frequency / etc.)
-- so a UI badge or any future consumer can read GDO's own documented
-- caveats without re-deriving them — explicit user requirement, not just a
-- docs/code-comment note. NULL for every pre-existing source/row.
ALTER TABLE exposure_datasets ADD COLUMN IF NOT EXISTS source_metadata JSONB;

-- ── 4. Seed data_sources row ──────────────────────────────────────────────────
-- poll_interval_seconds = 2592000 (30d) — GDO releases GPCC-based SPI
-- monthly (factsheet Table 1: "Monthly" temporal scale, no 10-daily window
-- for GPCC unlike CHIRPS/ERA5/CPC). staleness_threshold_seconds = 5184000
-- (60d) — one full cycle of buffer beyond the 30d poll for GDO's own
-- release-day lag, consistent with this repo's existing "keep checking,
-- don't flag down too eagerly" convention for monthly-cadence sources.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('GDO SPI (GPCC)', 'drought_index',
   'https://drought.emergency.copernicus.eu/api/wcs?map=DO_WCS&coverageID=spgTS',
   '{}', 2592000, 5184000, 3, true, 'healthy', NULL);

-- ── 5. Monthly cron trigger ────────────────────────────────────────────────────
-- Single global invocation (like GHSL's trigger_ghsl_population_import(),
-- not OSM roads/buildings' per-country loop): each GDO WCS request is a
-- server-side-cropped, sub-second, few-KB response (live-verified), so
-- looping all served countries inside one Edge Function invocation carries
-- no risk of the 150s idle timeout that motivated the per-country pattern
-- for slow Overpass queries.
CREATE OR REPLACE FUNCTION trigger_gdo_spi_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_gdo_spi_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-gdo-spi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Monthly (1st of month, 09:00 UTC — staggered after Meta 06:00, WorldPop
-- 07:00, GHSL 08:00 slots).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-spi-monthly') THEN
    PERFORM cron.unschedule('import-gdo-spi-monthly');
  END IF;

  PERFORM cron.schedule(
    'import-gdo-spi-monthly',
    '0 9 1 * *',
    $job$SELECT trigger_gdo_spi_import()$job$
  );
END;
$$;
