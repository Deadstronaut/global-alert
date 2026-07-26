-- =====================================================
-- CHIRPS (Climate Hazards Center InfraRed Precipitation with Station data)
-- monthly rainfall exposure source. Previously listed as "never attempted"
-- in the data source inventory — live-verified 2026-07-26 that UCSB's
-- Climate Hazards Center publishes a no-auth, predictable-URL global
-- monthly GeoTIFF (chirpsFetch.ts) — same "small, directly-downloadable
-- GeoTIFF, no NetCDF/Python needed" shape as GHSL.
--
-- hazard_type is now a foreign key into hazard_types (20260727000000
-- migration), not a hardcoded CHECK list — this INSERT is the only schema
-- change needed to make 'rainfall' a legal data_sources.hazard_type value.
-- =====================================================

INSERT INTO hazard_types (code, display_name, category, description, icon, supports_custom_source)
VALUES (
  'rainfall',
  'Rainfall (CHIRPS)',
  'exposure',
  'Monthly rainfall estimate (mm) from CHIRPS (Climate Hazards Center InfraRed Precipitation with Station data) — a drought/flood-context exposure layer, not a live hazard event.',
  '🌧️',
  false
)
ON CONFLICT (code) DO NOTHING;

-- poll_interval_seconds = 2592000 (30d) — CHIRPS publishes one new monthly
-- file per month, same "keep checking monthly" cadence as GHSL/WorldPop.
-- staleness_threshold_seconds = 5184000 (60d) — allows for CHIRPS occasionally
-- lagging a few days into a new month before publishing (chirpsFetch.ts's
-- resolveLatestChirpsUrl() already falls back up to 2 months back for this
-- same reason) without flagging the source unhealthy prematurely.
INSERT INTO data_sources
  (name, hazard_type, endpoint_url, endpoint_config, poll_interval_seconds,
   staleness_threshold_seconds, down_after_consecutive_failures, is_active,
   health_state, country_code)
VALUES
  ('CHIRPS', 'rainfall', 'https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/', '{}', 2592000, 5184000, 3, true, 'healthy', NULL);
