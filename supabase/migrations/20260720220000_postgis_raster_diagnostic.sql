-- Diagnostic-only RPC (temporary — see whether this survives or gets
-- removed once the postgis_raster feasibility question is answered).
-- Exposes postgis_raster's version and GDAL driver configuration so it can
-- be checked via a normal PostgREST RPC call (no direct psql access
-- available in this environment).
CREATE OR REPLACE FUNCTION check_postgis_raster_status()
RETURNS TABLE(setting_name TEXT, setting_value TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'postgis_raster_version', postgis_raster_lib_version()
  UNION ALL
  SELECT 'gdal_enabled_drivers', current_setting('postgis.gdal_enabled_drivers', true)
  UNION ALL
  SELECT 'gdal_version', postgis_gdal_version()
  UNION ALL
  SELECT 'enable_outdb_rasters', current_setting('postgis.enable_outdb_rasters', true);
$$;
