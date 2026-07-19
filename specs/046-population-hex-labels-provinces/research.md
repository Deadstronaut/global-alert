# Research: Population Hexagon Labels + Province-Level Population View

## §1. Province boundary data: a ready-made loader already exists, unused for this purpose

**Decision**: Use `src/data/boundaries/index.js`'s existing `loadRegionBoundaries(countryCode)`
(and `getRegionNames`/`findRegionGeometry`) as the sole geometry source for province view — do
not read `tr-provinces.json`/`my-provinces.json` directly.

**Why**: This module was built for a different feature ("show only my region" filtering,
`src/stores/disaster.js`) but already does exactly what FR-004/FR-007 need:
- Checks the admin-uploadable `country_boundaries` DB table first, falling back to a bundled
  static file (`tr` → `tr-provinces.json`, 81 ADM1 provinces; `my` → `my-provinces.json`, 16
  ADM1 states) — live-inspected this session, both are GADM-derived `FeatureCollection`s with a
  `shapeName` property holding the province/state name.
- Returns `null` when neither the DB nor a bundled loader has data for a country — live-confirmed
  no `mg-provinces.json` exists and no `BUNDLED_LOADERS.mg` entry exists, so
  `loadRegionBoundaries('mg')` already returns `null` today with zero new code. FR-007's
  graceful-degradation requirement is satisfied by simply checking for this `null`, not by writing
  new fallback logic.
- Already lazy (nothing fetched until a country is requested) and in-memory cached — matches this
  feature's performance goals without extra work.

## §2. Population-per-hexagon labels: MapLibre symbol layer, not a new DOM overlay

**Decision**: Add a second MapLibre layer per population exposure dataset —
`{sourceId}-label`, type `symbol`, `layout: { 'text-field': [formatted population expression],
'text-size': ... }` — sharing the same GeoJSON source already added by `addExposureLayer()`
(`MapView.vue`). Visibility is gated by zoom (`minzoom` on the layer, or a `layout.visibility`
toggle driven by the existing `currentZoom`/`currentHexRes` machinery) rather than a fixed
resolution flag, so labels naturally appear once cells are large enough and disappear when they
shrink again (FR-001).

**Why not per-feature DOM markers**: `MapView.vue`'s existing hexagon/exposure rendering is
already 100% MapLibre-native GeoJSON layers (Constitution Principle VII: canvas/GPU rendering
over per-feature DOM). A `maplibregl.Marker` per hexagon (up to ~140K at the automatic max
resolution, per spec 045 research.md §4) would reintroduce exactly the DOM-per-feature scaling
problem Principle VII exists to avoid; a symbol layer is a single GPU-composited draw call
regardless of feature count.

**Label text formatting**: A round-number abbreviation (e.g. "482K", "1.2M") is computed via a
new small pure function (`formatPopulationLabel.js`) and injected as a precomputed GeoJSON
property (`__populationLabel`) alongside the existing `__metricValue` when `addExposureLayer()`
builds its `FeatureCollection` — cheaper than a MapLibre expression doing the abbreviation
per-render, and easier to unit test in isolation (FR-003).

## §3. Only population sources get labels — reusing `isPopulationSource()`

**Decision**: The label symbol layer is only added when `isPopulationSource(dataset.source_name)`
(the helper added this session in `src/utils/exposureLayerColor.js`) is true. Non-population
exposure datasets (roads, rivers, basins) and the separate hazard-status ("durum") hex grid
(a different MapLibre source entirely — `country-hex-grid`, not `exposure-dataset-*`) are
untouched, satisfying FR-002 by construction rather than by an extra conditional needing new
state.

## §4. Province aggregation: point-in-polygon over already-fetched hex centroids, computed once per toggle

**Decision**: When the user switches to province view for a population dataset already
toggled on, run a client-side aggregation: for each already-fetched population feature (a hex
polygon with `__metricValue`), compute its centroid (reusing the same average-of-ring-vertices
approach used server-side in `populationCellAggregation.ts` this session — consistent, not
area-weighted, acceptable for near-regular H3 hexagons) and test it against each province
polygon from `loadRegionBoundaries()` using a small hand-written ray-casting
point-in-polygon function; sum `__metricValue` per matching province. Runs once when the toggle
is switched on (or when the underlying population data changes), not per map frame/pan.

**Complexity bound**: at most ~140K hex centroids (spec 045's live-tested maximum) × at most 81
provinces (Turkey, the largest bundled set) — a bounded, one-shot computation, not a live query
or a per-frame cost. If this proves too slow in practice for the largest country during
implementation, the fallback is restricting province view to the country's *current* manual/auto
hex resolution's feature set only (already the case, since aggregation only ever reads whatever
is currently loaded) — no separate fallback design needed because the input is already bounded by
the resolution cap.

**Why not a spatial index**: At this bounded scale (hundreds of thousands of points against
dozens of polygons, run once per toggle rather than per frame), a naive nested loop is expected
to complete well within an interactive budget; introducing an R-tree/spatial-index library for
this would be exactly the premature-complexity Constitution Principle VIII warns against. If live
testing during implementation shows otherwise, that testing (mirroring this session's Node-based
live test for spec 045's hex-resolution range) will be the deciding evidence, not a guess.

## §5. Province shading color: reuse the existing population ramp

**Decision**: Province view reuses `populationFillExpression()`/`POPULATION_RAMP` from
`src/utils/exposureLayerColor.js` (added this session for hexagon population choropleth), scaled
to the *province-aggregated* min/max instead of the per-hexagon min/max — same function, different
input data, satisfying FR-005 with no new color logic.
