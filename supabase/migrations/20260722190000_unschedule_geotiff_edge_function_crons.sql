-- =====================================================
-- Unschedules pg_cron jobs for geotiff.js dependent Edge Functions:
--   - import-ghsl-population-monthly
--   - import-gdo-soil-moisture-monthly
--   - import-gdo-fapar-monthly
--
-- Date: 2026-07-22
-- Reason: Supabase Edge Function deployment is currently failing platform-wide
-- for any function importing geotiff.js (via esm.sh / npm:geotiff) due to:
-- "failed to load 'node:vm': Unknown built-in 'node:' module: vm"
-- both locally and via --use-api bundling.
--
-- Functionality has been migrated to standalone Deno CLI container importers
-- under raster-importer/ (ghsl-importer, meta-ghsl-importer, glofas-importer)
-- scheduled via Deno.cron.
--
-- Note: trigger_* SQL functions and Edge Function source directories are kept intact
-- per repository convention (see NEW_GAME_PLAN.md §5) to allow easy re-enabling
-- once the platform bundler bug is resolved.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-ghsl-population-monthly') THEN
    PERFORM cron.unschedule('import-ghsl-population-monthly');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-soil-moisture-monthly') THEN
    PERFORM cron.unschedule('import-gdo-soil-moisture-monthly');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-fapar-monthly') THEN
    PERFORM cron.unschedule('import-gdo-fapar-monthly');
  END IF;
END;
$$;
