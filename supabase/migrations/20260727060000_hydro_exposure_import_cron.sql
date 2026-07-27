-- =====================================================
-- Automated monthly triggers for import-hydrorivers / import-hydrobasins
-- (spec 041 T017/T022 — deferred at the time, closed out here). Mirrors
-- import-osm-roads-weekly's per-country net.http_post loop exactly (spec 040
-- T016): both HydroRIVERS/HydroBASINS downloads are continent-scale
-- shapefiles clipped per country, and the deployed Edge Function is subject
-- to the same 150s idle-timeout risk that motivated per-country invocation
-- for roads (see import-hydrorivers/index.ts's own comment) — one call per
-- served country keeps each invocation's work bounded, and one country's
-- slow/failed request can't block another's.
-- Monthly, matching both sources' poll_interval_seconds=2592000
-- (20260719140000_hydrorivers_hydrobasins_exposure_sources.sql), staggered
-- an hour after WorldPop/GHSL's existing monthly 07:00/08:00 UTC slots.
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_hydrorivers_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
  country  RECORD;
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_hydrorivers_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  FOR country IN SELECT DISTINCT country_code FROM country_boundaries LOOP
    PERFORM net.http_post(
      url := base_url || '/import-hydrorivers',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := jsonb_build_object('countryCode', country.country_code)
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_hydrobasins_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
  country  RECORD;
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_hydrobasins_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  FOR country IN SELECT DISTINCT country_code FROM country_boundaries LOOP
    PERFORM net.http_post(
      url := base_url || '/import-hydrobasins',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := jsonb_build_object('countryCode', country.country_code)
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-hydrorivers-monthly') THEN
    PERFORM cron.unschedule('import-hydrorivers-monthly');
  END IF;
  PERFORM cron.schedule(
    'import-hydrorivers-monthly',
    '0 9 1 * *',
    $job$SELECT trigger_hydrorivers_import()$job$
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-hydrobasins-monthly') THEN
    PERFORM cron.unschedule('import-hydrobasins-monthly');
  END IF;
  PERFORM cron.schedule(
    'import-hydrobasins-monthly',
    '0 10 1 * *',
    $job$SELECT trigger_hydrobasins_import()$job$
  );
END;
$$;
