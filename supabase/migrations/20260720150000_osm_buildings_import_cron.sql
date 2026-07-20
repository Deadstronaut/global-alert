-- =====================================================
-- Automated weekly trigger for import-osm-buildings (spec 044).
-- Mirrors trigger_osm_roads_import()'s per-country pg_net + Vault pattern
-- exactly (spec 040 T016) — one net.http_post call PER served country, for
-- the same reason: a single Overpass country query can take 60-90s+, and
-- Supabase Edge Functions enforce a 150s idle timeout.
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_osm_buildings_import()
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url');
  svc_key  TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
  country  RECORD;
BEGIN
  IF base_url IS NULL OR svc_key IS NULL THEN
    RAISE NOTICE 'trigger_osm_buildings_import: app.settings.edge_function_base_url / service_role_key not configured, skipping';
    RETURN;
  END IF;

  FOR country IN SELECT country_code FROM country_boundaries LOOP
    PERFORM net.http_post(
      url := base_url || '/import-osm-buildings',
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
-- OpenStreetMap Buildings row (Sunday 05:00 UTC — off-peak, staggered an
-- hour after OSM Roads' 04:00 slot to avoid both imports overlapping).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'import-osm-buildings-weekly') THEN
    PERFORM cron.unschedule('import-osm-buildings-weekly');
  END IF;

  PERFORM cron.schedule(
    'import-osm-buildings-weekly',
    '0 5 * * 0',
    $job$SELECT trigger_osm_buildings_import()$job$
  );
END;
$$;
