-- =====================================================
-- pg_cron trigger for fetch-earthquakes (GDACS's earthquake slice).
--
-- fetch-earthquakes previously had NO pg_cron trigger at all — it was
-- (and still is, for now) invoked only from the frontend's client-side
-- polling (src/services/api/disasterService.js -> EDGE_FUNCTIONS.EARTHQUAKES),
-- meaning if no browser has the app open, none of USGS/EMSC/AFAD/Kandilli/
-- GDACS get fetched via this path at all. USGS/EMSC/AFAD/Kandilli are being
-- moved to the always-on server/ aggregator (2026-07-22 architecture
-- decision) specifically to close that gap for the sub-minute-latency
-- sources; GDACS stays here as a secondary/complementary source (its own
-- update cadence is already ~5 minutes, well within pg_cron's 1-minute
-- floor, so there's no latency reason to move it too) — but it needs its
-- OWN real cron trigger now, independent of whether a browser is open,
-- otherwise it inherits the same "silently does nothing unattended" gap.
--
-- fetch-earthquakes/index.ts's filterAgainstLiveEarthquakes() (added
-- alongside this migration) checks GDACS's candidates against the live
-- `earthquake` table (25km/5min/±0.3 magnitude tolerance, matching
-- server/src/processors/deduplicator.js's constants) before insert, so
-- this cron running independently of server/'s own fast pollers doesn't
-- produce duplicate rows for the same physical earthquake.
--
-- Mirrors trigger_ptwc_fetch()/trigger_who_fetch()'s pg_net + Vault pattern
-- (20260720130000_ptwc_who_fetch_cron.sql).
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_gdacs_earthquake_fetch()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_gdacs_earthquake_fetch: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := base_url || '/fetch-earthquakes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || svc_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Every 5 minutes, matching data_sources.poll_interval_seconds=300 for the
-- GDACS/earthquake row.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-gdacs-earthquakes') THEN
    PERFORM cron.unschedule('fetch-gdacs-earthquakes');
  END IF;

  PERFORM cron.schedule(
    'fetch-gdacs-earthquakes',
    '*/5 * * * *',
    $job$SELECT trigger_gdacs_earthquake_fetch()$job$
  );
END;
$$;
