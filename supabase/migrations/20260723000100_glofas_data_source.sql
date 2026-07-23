-- =====================================================
-- Seeds the missing data_sources row for GloFAS/Copernicus.
--
-- Found auditing the admin Sources tab (2026-07-23): GloFAS had NO
-- data_sources row at all, despite raster-importer/import-glofas.ts
-- writing real exposure_datasets rows (verified end-to-end 2026-07-22 with
-- a real EWDS token, all 3 served countries succeeded) — the script never
-- called resolveSourceId/recordFetchOutcome, so it was invisible in the
-- admin Sources tab. That gap is fixed in import-glofas.ts itself
-- (this migration only adds the row it now resolves against).
--
-- poll_interval_seconds=86400 (daily) matches GloFAS's actual forecast
-- publication cadence and cron.ts's "glofas" job schedule (04:00 UTC
-- daily). hazard_type='flood', matching how NEW_GAME_PLAN.md §2.2 already
-- categorized GloFAS before this row existed.
-- =====================================================

-- No unique constraint on (name, hazard_type) to target with ON CONFLICT
-- (matches every other data_sources seed migration in this repo, e.g.
-- 20260722180000 — migrations are assumed to run exactly once). Guarded
-- with a WHERE NOT EXISTS instead, harmless if this migration is ever
-- accidentally re-applied.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
SELECT
  'GloFAS/Copernicus', 'flood',
  'https://ewds.climate.copernicus.eu/api/retrieve/v1/processes/cems-glofas-forecast',
  '{}', 86400, 172800, 3, true, 'healthy', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM data_sources WHERE name = 'GloFAS/Copernicus' AND hazard_type = 'flood'
);
