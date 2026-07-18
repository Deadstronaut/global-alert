-- =====================================================
-- Automated weekly trigger for import-osm-roads (spec 040 T016).
-- Mirrors trigger_kontur_population_import()'s pg_net + Vault pattern
-- exactly (spec 038 T037) — road networks change far too slowly to warrant
-- a browser-tab-driven refresh, and this project's automation convention
-- (spec 019/026/032/036/037/038) has consistently moved to server-side
-- pg_cron rather than client-side polling.
-- =====================================================

-- One net.http_post call PER served country, not one call for all countries.
-- Live-verified during implementation (spec 040 research.md §8 addendum): a
-- single Overpass country query takes 60-90s+, and Supabase Edge Functions
-- enforce a 150s idle timeout — the original one-call-for-everyone design
-- reliably exceeded that limit once more than one country was served. Each
-- call is independent (net.http_post is fire-and-forget), so one country's
-- slow/failed request cannot block another's, consistent with FR-009's
-- per-country isolation requirement — now enforced at the invocation level,
-- not just inside the function.
CREATE OR REPLACE FUNCTION trigger_osm_roads_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
  country  RECORD;
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_osm_roads_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  FOR country IN SELECT country_code FROM country_boundaries LOOP
    PERFORM net.http_post(
      url := base_url || '/import-osm-roads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || svc_key
      ),
      body := jsonb_build_object('countryCode', country.country_code)
    );
  END LOOP;
END;
$$;

-- Weekly, matching data_sources.poll_interval_seconds=604800 for the
-- OpenStreetMap Roads row (Sunday 04:00 UTC — off-peak, staggered an hour
-- after Kontur's 03:00 slot to avoid both scheduled imports overlapping).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-osm-roads-weekly') THEN
    PERFORM cron.unschedule('import-osm-roads-weekly');
  END IF;

  PERFORM cron.schedule(
    'import-osm-roads-weekly',
    '0 4 * * 0',
    $job$SELECT trigger_osm_roads_import()$job$
  );
END;
$$;
