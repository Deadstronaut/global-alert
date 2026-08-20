-- Add optional pagination to get_dataset_features_geojson (spec-less
-- follow-up, 2026-08-20). backfill-exposure-h3-cells.ts fetches an entire
-- dataset's geometry in one call — fine for most sources, but a
-- ~58k-feature dataset (osm-buildings/tr) consistently hit "canceling
-- statement due to statement timeout" reading it all at once (live-verified
-- during the TR/MG h3-cells backfill trial). New p_limit/p_offset params
-- default to NULL/0 (LIMIT NULL = no limit), so every EXISTING caller
-- (MapView.vue's map rendering) is completely unaffected — this is
-- additive-only, not a signature change for existing 2-arg callers.
CREATE OR REPLACE FUNCTION get_dataset_features_geojson(
  dataset_id UUID,
  simplify_tolerance DOUBLE PRECISION DEFAULT NULL,
  p_limit INTEGER DEFAULT NULL,
  p_offset INTEGER DEFAULT 0
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
  WHERE exposure_features.dataset_id = get_dataset_features_geojson.dataset_id
  ORDER BY exposure_features.id
  LIMIT p_limit
  OFFSET p_offset;
$$;
