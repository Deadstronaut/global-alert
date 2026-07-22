-- Probe-only migration: checks whether postgis_raster is available on this
-- Supabase Postgres instance. If GHSL/GDO SPI's GeoTIFF parsing could move
-- from the Edge Function (hitting WORKER_RESOURCE_LIMIT) into the database
-- itself via postgis_raster's ST_FromGDALRaster / raster-to-vector
-- functions, that sidesteps the Edge Function memory ceiling entirely
-- instead of hunting for a lighter GeoTIFF library or standing up a
-- separate Python service. This migration only attempts to enable the
-- extension — it does not use it yet.
CREATE EXTENSION IF NOT EXISTS postgis_raster;
