-- =====================================================
-- Automated monthly trigger for import-ghsl-population (spec 044).
-- Unlike import-osm-roads/import-osm-buildings, this is a SINGLE global
-- call, not one per served country — import-ghsl-population downloads one
-- world raster per invocation and crops out every served country from it
-- itself (see ghslFetch.ts).
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_ghsl_population_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_ghsl_population_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-ghsl-population',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Monthly (1st of month, 08:00 UTC — staggered after Meta's 06:00 and
-- WorldPop's 07:00 slots).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-ghsl-population-monthly') THEN
    PERFORM cron.unschedule('import-ghsl-population-monthly');
  END IF;

  PERFORM cron.schedule(
    'import-ghsl-population-monthly',
    '0 8 1 * *',
    $job$SELECT trigger_ghsl_population_import()$job$
  );
END;
$$;
