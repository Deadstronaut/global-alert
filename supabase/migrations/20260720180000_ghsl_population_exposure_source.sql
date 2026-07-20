-- =====================================================
-- GHSL (GHS-POP) Population Exposure Source (spec 044)
-- "GHSL" line item, Data Sources Inventory §8, moved from evaluated-but-
-- not-integrated to live. Unlike WorldPop/Meta, GHSL ships one global
-- raster (30-arcsecond product) rather than per-country files — see
-- ghslFetch.ts's header comment. hazard_type 'population_raster' already
-- exists in the CHECK constraint (added by 20260719150000 for WorldPop).
-- =====================================================

-- poll_interval_seconds = 2592000 (30d) — GHSL releases new epochs roughly
-- annually, not continuously; monthly is a "keep checking" cadence like
-- WorldPop/Meta's rows, not a real refresh cycle.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('GHSL', 'population_raster', 'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/', '{}', 2592000, 31536000, 3, true, 'healthy', NULL);
