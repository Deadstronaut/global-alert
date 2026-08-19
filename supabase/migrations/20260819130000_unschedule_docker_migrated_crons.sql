-- =====================================================
-- Unschedules pg_cron jobs for 8 sources moved to raster-importer's own
-- Deno.cron 2026-08-19 (see raster-importer/cron.ts's "gdo-spi" /
-- "kontur-population" / "wfp-hungermap" jobs, and its header comment for
-- the full reasoning): live audit found these had been running on BOTH
-- Supabase pg_cron (this Edge Function path) AND a Docker
-- raster-importer-scheduled container, independently and unknowingly of
-- each other, for WorldPop/HydroRIVERS/HydroBASINS/OSM Roads/OSM
-- Buildings — Docker already fully owned these, Supabase's own schedule
-- was pure redundant duplicate work. Kontur Population and GDO SPI had no
-- Docker equivalent before this migration's companion raster-importer
-- scripts; WFP HungerMap likewise moves from its hourly Edge Function
-- trigger to raster-importer/import-wfp-hungermap.ts.
--
-- Mirrors 20260722130000_unschedule_server_migrated_crons.sql's own
-- comment-not-delete rollback convention — trigger_* functions stay
-- defined (cheap, harmless), only the schedules are removed, so this is
-- reversible by re-CREATE-ing a cron.schedule entry if ever needed.
--
-- This app is designed to run self-hosted per country (see
-- FEDERATION_SETUP_PLAN.md) — Docker owning ALL periodic ingestion,
-- rather than a mix of Docker + Supabase pg_cron for the same sources,
-- keeps exactly one place to monitor (the admin Sources health panel,
-- which already tracks data_sources regardless of which engine writes to
-- it) and one place to restart when something breaks.
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-worldpop-monthly') THEN
    PERFORM cron.unschedule('import-worldpop-monthly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-hydrorivers-monthly') THEN
    PERFORM cron.unschedule('import-hydrorivers-monthly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-hydrobasins-monthly') THEN
    PERFORM cron.unschedule('import-hydrobasins-monthly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-osm-roads-weekly') THEN
    PERFORM cron.unschedule('import-osm-roads-weekly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-osm-buildings-weekly') THEN
    PERFORM cron.unschedule('import-osm-buildings-weekly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-kontur-population-weekly') THEN
    PERFORM cron.unschedule('import-kontur-population-weekly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-gdo-spi-monthly') THEN
    PERFORM cron.unschedule('import-gdo-spi-monthly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-wfp-hungermap') THEN
    PERFORM cron.unschedule('fetch-wfp-hungermap');
  END IF;
END;
$$;
