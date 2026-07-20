-- =====================================================
-- Automated pg_cron triggers for fetch-tsunamis (PTWC) and fetch-epidemics
-- (WHO) — both data_sources rows were seeded (20260709000000) but never had
-- a fetch function wired to them at all, in either architecture: the fetch
-- logic existed only in the old always-on Node aggregator (server/), which
-- was never ported to this repo's Edge Function + pg_cron pattern like the
-- other 10 hazard sources were (5 of which still rely on client-side
-- browser polling per src/services/api/config.js's POLLING_INTERVALS, not
-- pg_cron). For these two, pg_cron is used directly rather than replicating
-- the older client-polling approach — this project's newer automation (spec
-- 019/026/032/036/037/038/040) has consistently moved that direction, and a
-- tsunami warning in particular should not depend on someone having a
-- browser tab open. Mirrors trigger_kontur_population_import()'s pg_net +
-- Vault pattern (spec 038 T037).
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_ptwc_fetch()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_ptwc_fetch: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/fetch-tsunamis',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION trigger_who_fetch()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_who_fetch: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/fetch-epidemics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Every 3 minutes, matching data_sources.poll_interval_seconds=180 for the
-- PTWC row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-ptwc-tsunamis') THEN
    PERFORM cron.unschedule('fetch-ptwc-tsunamis');
  END IF;

  PERFORM cron.schedule(
    'fetch-ptwc-tsunamis',
    '*/3 * * * *',
    $job$SELECT trigger_ptwc_fetch()$job$
  );
END;
$$;

-- Every 30 minutes, matching data_sources.poll_interval_seconds=1800 for the
-- WHO row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-who-epidemics') THEN
    PERFORM cron.unschedule('fetch-who-epidemics');
  END IF;

  PERFORM cron.schedule(
    'fetch-who-epidemics',
    '*/30 * * * *',
    $job$SELECT trigger_who_fetch()$job$
  );
END;
$$;
