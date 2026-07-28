-- =====================================================
-- get_dataset_features_geojson — extend statement_timeout
--
-- Live-testing finding: toggling the Meta/HDX (126,118 features) or
-- WorldPop (138,932 features) Turkey population layers on the map
-- consistently failed with HTTP 500 / code 57014 ("canceling statement due
-- to statement timeout") both individually and together — confirmed via a
-- direct REST call to the RPC, same failure either way, so this is not
-- related to the exposure-layer-load-token race fixed alongside this in
-- MapView.vue. This function jsonb_aggs every row of a dataset (with
-- ST_SimplifyPreserveTopology per geometry) in one statement, no
-- pagination — fine at the row counts every other served dataset has
-- (roads/rivers/basins/critical-infra, all under ~65k), too slow at
-- 125k-140k fine-grained population hexagons under this project's default
-- PostgREST statement_timeout. Same fix pattern as
-- 20260727083000_cascading_hazard_risk_extend_statement_timeout_2.sql —
-- raise this function's own timeout rather than rewriting the query, since
-- the underlying per-statement cost on this project has repeatedly proven
-- not to be about query shape (see that migration's own history).
-- =====================================================

ALTER FUNCTION get_dataset_features_geojson(UUID, DOUBLE PRECISION)
  SET statement_timeout = '60s';
