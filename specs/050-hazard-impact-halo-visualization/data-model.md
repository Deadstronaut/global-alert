# Phase 1 Data Model: Hazard Impact Halo Visualization

## US1 (Impact halo) — no schema

Entirely client-side and ephemeral. No new table, no new column.

- **Halo state** (component-local `ref`s in `MapView.vue`, not persisted): `haloCenter { lat, lng }`, `haloRadiusKm` (from `defaultBufferRadiusKm(selectedEvent)`, unchanged), `haloOpacity` (0-1, driven by the new vertical slider).

## US2 (Distance-graded critical-infrastructure coloring) — no schema

Reads existing `exposure_features` rows for the country's `osm-buildings` dataset (already fetched for map rendering — no new query). Adds one **derived, non-persisted** value per point at render time:

- **severity** (0-1 float, computed client-side as `1 - clamp(distance_km / haloRadiusKm, 0, 1)`) → fed into a MapLibre `interpolate` paint expression against the new `dem_slope`-style ramp in `exposureLayerColor.js`. Never written back to the database — recomputed every time the halo's center/radius changes.

## US3 (Building-footprint-level coloring) — future schema, NOT implemented in this pass

Documented here only so a future `/speckit-plan` pass for US3 doesn't have to rediscover this shape from scratch.

- **New `exposure_datasets` row per country**: `source_name = 'building_footprints'`, `metric_property_name = 'building_count'` (or similar — one row per building, `metric_value = 1`, matching the existing `osm-buildings` convention of one row per facility rather than an aggregated count).
- **`exposure_features` rows**: geometry = building polygon (from Microsoft's dataset) or its centroid (TBD in US3's own plan — a full country's building polygons at Turkey's scale may be too many/too detailed to render as full polygons client-side at country-wide zoom; centroids + a building-count-per-hexagon aggregation, matching this project's existing raster→H3 pattern, is the likely direction but is an open decision for US3's own plan, not decided here).
- **No new column needed anywhere** — `exposure_features` is already fully generic (dataset_id, geom, metric_value, properties, asset_category). US3 does not need `asset_category` populated (that column is specifically for the critical-infrastructure taxonomy `get_critical_infrastructure_features()` filters on — ordinary buildings are not "critical infrastructure" and should stay NULL there, same as every other non-critical-infra source today).
