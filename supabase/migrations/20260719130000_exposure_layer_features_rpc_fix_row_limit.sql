-- Spec 042 follow-up: get_dataset_features_geojson (20260719120000) returned a
-- SETOF/TABLE, which PostgREST truncates at its default max-rows (1000) —
-- live-verified against the real 5,233-feature OSM roads (Turkey) dataset,
-- which came back as exactly 1000 rows via the REST/rpc endpoint. Fixed by
-- returning a single JSONB array (jsonb_agg) instead of a row set — PostgREST
-- only row-limits SETOF-returning functions, not scalar/JSON-returning ones.
-- Response shape is unchanged from the caller's perspective (still an array
-- of { id, geom_geojson, metric_value, properties } objects), so no frontend
-- change is needed.

DROP FUNCTION IF EXISTS get_dataset_features_geojson(UUID, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION get_dataset_features_geojson(
  dataset_id UUID,
  simplify_tolerance DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', exposure_features.id,
    'geom_geojson', CASE
      WHEN simplify_tolerance IS NULL THEN ST_AsGeoJSON(geom)
      ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, simplify_tolerance))
    END,
    'metric_value', exposure_features.metric_value,
    'properties', exposure_features.properties
  )), '[]'::jsonb)
  FROM exposure_features
  WHERE exposure_features.dataset_id = get_dataset_features_geojson.dataset_id;
$$;
