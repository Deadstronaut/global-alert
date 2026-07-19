-- Spec 042: Exposure Layer Map Visualization
-- Read-only RPC for fetching a full exposure dataset's features as GeoJSON, for
-- client-side map rendering. Mirrors get_intersecting_features's existing shape
-- (20260706170000_impact_analysis.sql) with the radius filter removed. No table,
-- schema, or RLS policy changes — SECURITY characteristics unchanged (no
-- SECURITY DEFINER), so exposure_features_visible_with_dataset (spec 008)
-- continues to gate visibility exactly as it already does for every other query.

CREATE OR REPLACE FUNCTION get_dataset_features_geojson(
  dataset_id UUID,
  simplify_tolerance DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE(id UUID, geom_geojson TEXT, metric_value DOUBLE PRECISION, properties JSONB)
LANGUAGE sql STABLE AS $$
  SELECT
    exposure_features.id,
    CASE
      WHEN simplify_tolerance IS NULL THEN ST_AsGeoJSON(geom)
      ELSE ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, simplify_tolerance))
    END AS geom_geojson,
    exposure_features.metric_value,
    exposure_features.properties
  FROM exposure_features
  WHERE exposure_features.dataset_id = get_dataset_features_geojson.dataset_id;
$$;
