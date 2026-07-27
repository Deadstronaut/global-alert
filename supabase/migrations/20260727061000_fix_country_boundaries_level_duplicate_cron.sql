-- =====================================================
-- Fixes a latent regression introduced by
-- 20260727040000_country_boundaries_level.sql: that migration widened
-- country_boundaries' primary key from (country_code) to
-- (country_code, level) so a country can have separate province/district/
-- village boundary sets. Two pre-existing cron trigger functions
-- (trigger_osm_roads_import, trigger_osm_buildings_import) loop with
-- `FOR country IN SELECT country_code FROM country_boundaries LOOP` —
-- once any country has more than one level uploaded, this would now fire
-- one duplicate import per extra level for that country (harmless today,
-- since every country currently has exactly one row, but silently wrong
-- the moment an admin uploads a second level). Fixed by de-duplicating
-- with DISTINCT, matching the fix already applied in
-- 20260727060000_hydro_exposure_import_cron.sql's own two new triggers.
-- =====================================================

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

  FOR country IN SELECT DISTINCT country_code FROM country_boundaries LOOP
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

  FOR country IN SELECT DISTINCT country_code FROM country_boundaries LOOP
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
