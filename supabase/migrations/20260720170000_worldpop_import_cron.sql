-- =====================================================
-- Automated monthly trigger for import-worldpop.
-- Found while investigating a Meta/HDX Population integration attempt
-- (spec 044, ultimately not completed — see Data Sources Inventory §8):
-- WorldPop has the SAME gap 20260715160000 already fixed for Kontur.
-- Its data_sources row (20260719150000) set poll_interval_seconds=2592000
-- but no pg_cron job was ever created for import-worldpop — the real TR/MG
-- WorldPop data currently in exposure_datasets was written by a manual
-- invocation, not a schedule. Fixed here rather than left for a future
-- audit to rediscover.
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_worldpop_population_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_worldpop_population_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-worldpop',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Monthly (1st of month, 07:00 UTC), matching WorldPop's own
-- poll_interval_seconds=2592000.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-worldpop-monthly') THEN
    PERFORM cron.unschedule('import-worldpop-monthly');
  END IF;

  PERFORM cron.schedule(
    'import-worldpop-monthly',
    '0 7 1 * *',
    $job$SELECT trigger_worldpop_population_import()$job$
  );
END;
$$;
