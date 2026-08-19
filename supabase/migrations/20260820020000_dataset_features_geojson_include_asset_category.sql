-- Bug fix (2026-08-20, user-reported: kritik tesis kategori filtresini
-- açınca/kapatınca haritada HİÇBİR bina görünmüyordu, önceden hepsi
-- görünüyordu). Root cause: exposure_features.asset_category is its own
-- column (populated for osm-buildings via writeExposureDataset.ts), never
-- merged into exposure_features.properties — but get_dataset_features_geojson
-- (the RPC that feeds MapView.vue's addExposureLayer/GeoJSON source) only
-- ever returned `properties`, never `asset_category`. So every rendered
-- building feature's MapLibre `['get', 'asset_category']` evaluated to
-- null, and MapView.vue's category filter (['in', ['get','asset_category'],
-- ['literal', activeCategories]]) — which used to be a silent no-op on the
-- wrong dataset (fixed separately) — now correctly filters, but against a
-- property that was never there, hiding every single building regardless
-- of which categories are toggled on.
--
-- Adds `asset_category` as a sibling key alongside the existing
-- geom_geojson/metric_value/properties, additive and backward-compatible
-- with any other caller of this function that only reads `properties`.
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
    'asset_category', exposure_features.asset_category,
    'properties', exposure_features.properties
  )), '[]'::jsonb)
  FROM exposure_features
  WHERE exposure_features.dataset_id = get_dataset_features_geojson.dataset_id;
$$;
