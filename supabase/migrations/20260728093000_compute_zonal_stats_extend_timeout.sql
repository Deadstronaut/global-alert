-- =====================================================
-- compute_zonal_stats — extend statement_timeout
--
-- Live-testing finding: ImpactPanel.vue's automatic "Etkilenen Kaynaklar"
-- summary (added alongside the cascade map integration) calls
-- compute_zonal_stats for every hazard-relevant dataset IN PARALLEL
-- (Promise.all) as soon as an event is selected — for an earthquake, that's
-- worldpop + osm-buildings + hydrorivers + dem_slope all at once. Each call
-- alone is fine (dem_slope/tr measured ~5.6s in isolation), but this
-- project's Postgres/PostgREST layer has repeatedly shown a real per-
-- statement cost that gets worse under concurrent load (see the cascade
-- rules and get_dataset_features_geojson statement_timeout fixes) — the
-- default timeout this function never had an override for was tight enough
-- that concurrent siblings could push an individual call over it, reported
-- live as the DEM slope layer's summary row showing "Analiz tamamlanamadı"
-- even though the same call succeeds in isolation. Same fix pattern as
-- those two: raise this function's own timeout rather than changing the
-- query shape.
-- =====================================================

ALTER FUNCTION compute_zonal_stats(UUID, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  SET statement_timeout = '45s';
