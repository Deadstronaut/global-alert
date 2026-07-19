# Data Model: Exposure Layer Map Visualization

This feature reads existing tables only (`exposure_datasets`, `exposure_features` — spec 038/040
schema, unmodified). No new tables. One new read-only SQL function.

## Existing tables consumed (unmodified)

### `exposure_datasets` (read)

| Column | Type | Used for |
|---|---|---|
| `id` | uuid | Layer identity, RPC parameter, palette hashing (research.md §4) |
| `name` | text | Layer panel label |
| `description` | text | Optional popup/panel subtitle |
| `metric_property_name` | text | Popup's metric label (e.g. "population", "length_m") |
| `feature_count` | integer | Panel display (e.g. "37,407 features") — informs UI whether to warn about a large layer |
| `country_code` | text | Grouping/filtering the layer list by served country |
| `source_name` | text \| null | Layer panel subtitle (e.g. "(osm)"), already used identically by `ImpactPanel.vue`'s existing dropdown |
| `created_at` | timestamptz | Tie-breaking when a country has multiple datasets from different sources |

### `exposure_features` (read, via new RPC only — never selected directly by the frontend)

| Column | Type | Used for |
|---|---|---|
| `id` | uuid | Feature identity for popup targeting |
| `geom` | geometry(Geometry, 4326) | Rendered geometry, converted to GeoJSON text by the RPC (`ST_AsGeoJSON`) |
| `metric_value` | double precision | Popup's headline value, labeled by the parent dataset's `metric_property_name` |
| `properties` | jsonb | Generic, source-specific attribute bag rendered verbatim in the popup (research.md §3) |

## New database object

### Function: `get_dataset_features_geojson(dataset_id UUID, simplify_tolerance DOUBLE PRECISION DEFAULT NULL)`

```sql
RETURNS JSONB  -- jsonb_agg(...) of { id, geom_geojson, metric_value, properties } objects
LANGUAGE sql STABLE
```

**Revised from an initial `RETURNS TABLE(...)` design** after a live finding
(research.md §2 addendum) that PostgREST's default 1000-row cap silently truncated the original
`TABLE`-returning version against the real 5,233-feature OSM roads dataset. A single JSONB array
response is not subject to that per-row limit. The logical shape (array of 4-field objects) is
unchanged.

- Mirrors `get_intersecting_features`'s existing shape and `SECURITY` characteristics exactly (no
  `SECURITY DEFINER` — runs as the calling role, so the existing `exposure_features_visible_with_
  dataset` RLS policy, spec 008, continues to gate visibility with zero new access-control code).
- `simplify_tolerance IS NULL` (the default) returns full-precision geometry via
  `ST_AsGeoJSON(geom)`; a non-null value returns
  `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, simplify_tolerance))` instead — an optional,
  purely query-time detail-reduction path for large datasets (research.md §2). Wiring the frontend
  to pass a non-null value is optional for this feature's MVP.
- No new indexes required — `idx_exposure_features_dataset` (existing, on `dataset_id`) already
  covers this function's `WHERE dataset_id = ...` filter.

## Frontend state shapes (no persistence — session-only, mirrors `mapLayers.js`'s existing conventions)

### `exposureLayers.js` store

```js
{
  datasets: [],        // raw exposure_datasets rows, RLS-scoped
  loaded: false,
  loading: false,
  error: null,
}
```

### `MapView.vue` local layer-runtime state (co-located with the existing `layerVisibility`/
`layerOpacity` refs already used by the spec-012 WMS/WFS panel — same refs, keyed by
`exposure-dataset-<id>` instead of the WMS/WFS layer id, so both layer families share one toggle
mechanism without a parallel one being built)

```js
layerVisibility: { [datasetId]: boolean }
layerOpacity: { [datasetId]: number }        // reused as-is, same default/range as WFS layers
exposureFeatureCache: Map<datasetId, GeoJSON.FeatureCollection>  // populated on first toggle-on,
                                                                   // kept for the session so
                                                                   // re-toggling doesn't refetch
```

## Key relationships

```
exposure_datasets (1) ──< exposure_features (many)
        │
        └─ rendered as: one toggleable map layer, colored deterministically by dataset.id
                          (research.md §4), containing one MapLibre GeoJSON source + up to 3
                          geometry-type-filtered sub-layers (fill/line/point), exactly mirroring
                          the existing WFS layer rendering shape.
```
