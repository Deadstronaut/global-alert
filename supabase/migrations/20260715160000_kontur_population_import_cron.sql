-- =====================================================
-- Automated weekly trigger for import-kontur-population (spec 038 T037).
-- Live-code audit found neither pg_cron nor client-driven polling actually
-- invoked this Edge Function — the data_sources row's poll_interval_seconds
-- (604800s = weekly) was configured but nothing was scheduled to honor it,
-- leaving population data import as manual-only. Mirrors
-- trigger_compliance_report_generation()'s pg_net + Vault pattern (spec 019)
-- rather than client-side polling (src/services/api/config.js's
-- POLLING_INTERVALS): population data changes far too slowly to warrant a
-- browser-tab-driven refresh, and this project's newer automation (spec
-- 019/026/032/036/037) has consistently moved to server-side pg_cron.
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_kontur_population_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_kontur_population_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/import-kontur-population',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Weekly, matching data_sources.poll_interval_seconds=604800 for the Kontur
-- row (Sunday 03:00 UTC — off-peak, distinct from compliance's Monday 00:00).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-kontur-population-weekly') THEN
    PERFORM cron.unschedule('import-kontur-population-weekly');
  END IF;

  PERFORM cron.schedule(
    'import-kontur-population-weekly',
    '0 3 * * 0',
    $job$SELECT trigger_kontur_population_import()$job$
  );
END;
$$;
