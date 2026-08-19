-- Bug fix (2026-08-20): the previous migration
-- (20260820020000_dataset_features_geojson_include_asset_category.sql) did a
-- bare CREATE OR REPLACE FUNCTION to add asset_category to the output —
-- which silently dropped this function's earlier
-- 20260728091000_dataset_features_geojson_extend_timeout.sql SET
-- statement_timeout = '60s' (CREATE OR REPLACE FUNCTION does not carry
-- forward a function's configuration parameters unless the new CREATE
-- statement re-specifies them). Live-verified: proconfig was NULL right
-- after, and this coincided with Turkey's osm-buildings dataset growing
-- from ~27k to 58k rows (health/education now come through as full
-- polygon geometries, not just points) — the RPC started failing with
-- HTTP 500 / statement timeout again, same failure mode
-- 20260728091000 originally fixed.
--
-- Re-applying the same 60s timeout that migration set.
ALTER FUNCTION get_dataset_features_geojson(UUID, DOUBLE PRECISION)
  SET statement_timeout = '60s';
