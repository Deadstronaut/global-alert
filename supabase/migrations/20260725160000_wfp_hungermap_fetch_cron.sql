-- =====================================================
-- Completes fetch-food-security (WFP HungerMap): the Edge Function itself
-- has existed since the original spec-kit scaffold (2026-07-05) but was
-- never actually deployed, never had a data_sources row, and never had a
-- pg_cron trigger — live-verified 2026-07-25 it 404'd in production and
-- resolveSourceId('food_security', 'WFP HungerMap') had nothing to find.
--
-- This is a SECOND, independent food_security source alongside FEWS NET
-- (server/-polled, source_type='fewsnet') — not a replacement. FEWS NET
-- gives IPC-phase classifications; WFP HungerMap gives FCS-prevalence-based
-- household food-consumption data, a different metric/methodology, so both
-- are kept active rather than treating one as redundant.
--
-- Wired via the Edge Function + pg_cron pattern (source_type stays NULL,
-- same as GDO SPI/soil-moisture/fAPAR), not server/ — mirrors
-- 20260720130000_ptwc_who_fetch_cron.sql's now-superseded-for-WHO/PTWC
-- approach, which is still the right pattern for any source that isn't
-- part of the always-on server/ aggregator.
-- =====================================================

INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
SELECT
  'WFP HungerMap', 'food_security',
  'https://api.hungermapdata.org/v2/info/country',
  '{}', 3600, 10800, 3, true, 'healthy', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM data_sources WHERE name = 'WFP HungerMap' AND hazard_type = 'food_security'
);

CREATE OR REPLACE FUNCTION trigger_wfp_hungermap_fetch()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_wfp_hungermap_fetch: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/fetch-food-security',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Hourly, matching data_sources.poll_interval_seconds=3600 above (matches
-- the Edge Function's own header comment: "pg_cron: every 1 hour").
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-wfp-hungermap') THEN
    PERFORM cron.unschedule('fetch-wfp-hungermap');
  END IF;

  PERFORM cron.schedule(
    'fetch-wfp-hungermap',
    '0 * * * *',
    $job$SELECT trigger_wfp_hungermap_fetch()$job$
  );
END;
$$;
