# Research: Exposure Layer Map Visualization

## §1. Rendering approach: extend the existing spec-012 WMS/WFS layer pattern, don't build a parallel one

**Decision**: Reuse and generalize `MapView.vue`'s existing `addWfsLayer()` /
`removeMapLayerRendering()` / `toggleMapLayer()` functions (built for spec 012's admin-managed
OGC WMS/WFS layers), rather than writing a separate rendering pipeline for exposure layers.

**Why**: That existing code is *already* a generic, geometry-type-driven GeoJSON renderer:

```js
map.addSource(sourceId, { type: 'geojson', data: geojson })
map.addLayer({ id: `${sourceId}-fill`, type: 'fill', source: sourceId, filter: ['==', ['geometry-type'], 'Polygon'], ... })
map.addLayer({ id: `${sourceId}-line`, type: 'line', source: sourceId, filter: ['in', ['geometry-type'], ['literal', ['LineString', 'Polygon']]], ... })
map.addLayer({ id: `${sourceId}-point`, type: 'circle', source: sourceId, filter: ['==', ['geometry-type'], 'Point'], ... })
```

This is exactly what spec 042's FR-002 requires (style driven by geometry type, not hardcoded
per-source knowledge). The toggle lifecycle (`layerVisibility` ref, fetch-on-toggle-on,
remove-on-toggle-off) and the existing `.map-layers-panel` checkbox-list UI markup (`MapView.vue`
~L1978-1994) are also directly reusable patterns for FR-001/FR-003/FR-007.

**Alternatives considered**: A wholly separate exposure-layer rendering module. Rejected — would
duplicate logic already proven in production for the same underlying problem (toggle a GeoJSON
overlay on/off, generically, on this exact map instance), violating Constitution Principle VIII
(avoid unnecessary new complexity).

**What's different from the WFS case**: exposure layers do NOT fetch a live external endpoint —
they call one new local Postgres RPC against already-imported data (§2), and popups need to be
added (the WFS layers today have no click-to-inspect popup at all — new for this feature, see §3).

## §2. Fetching feature geometry: one new read-only RPC, mirroring an existing pattern exactly

**Decision**: Add `get_dataset_features_geojson(dataset_id UUID)`, a `STABLE SQL` function
returning `TABLE(id UUID, geom_geojson TEXT, metric_value DOUBLE PRECISION, properties JSONB)`.

**Why**: `supabase/migrations/20260706170000_impact_analysis.sql` already defines
`get_intersecting_features(dataset_id, center_lat, center_lng, radius_km)` with this exact return
shape (`ST_AsGeoJSON(geom) AS geom_geojson`, `metric_value`, `properties`) for the Impact Analysis
radius-query use case. The new function is the same query with the `ST_DWithin` radius filter
removed — i.e. "give me every feature in this dataset," which does not exist yet because nothing
previously needed a whole-dataset fetch. This is additive (a new function, `CREATE OR REPLACE
FUNCTION`), not a change to any existing function, table, or RLS policy — consistent with FR-009
("read-only... does not alter import, validation, or storage").

**Payload size / performance**: The existing OSM roads (Turkey) dataset is 37,407 LineString
features. A full-dataset GeoJSON fetch of that size is expected to be several MB of JSON — larger
than the radius-scoped queries this table has served before, but this is a client **browser**
fetching from Postgres over PostgREST/RPC, not the constrained Supabase **Edge Function** compute
that failed on a similar order of magnitude in spec 040 (that failure was `WORKER_RESOURCE_LIMIT`
in a memory-capped serverless function parsing raw Overpass JSON — a materially different
execution environment with a much lower ceiling than a user's browser tab). Mitigation built into
the RPC from the start rather than added reactively: an optional `simplify_tolerance` parameter
using `ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, simplify_tolerance))` when non-null, so a
future caller can request reduced-detail geometry for large/low-zoom cases without any schema or
storage change — purely a query-time transform. Default `NULL` (no simplification) is fine for
the current 37K-feature scale; wiring the frontend to actually pass a non-null tolerance is
optional in this feature (see quickstart.md) and can be deferred without blocking MVP.

**Alternatives considered**:
- *Vector tiles (pg_tileserv/Martin/MapLibre native vector tile server)*: the "correct" long-term
  answer for arbitrarily large datasets, but a new backend service — rejected for now per
  Constitution Principle VIII/Complexity Tracking; revisit if a future dataset proves too large
  for single-fetch-and-render.
- *PostgREST direct `select` on `exposure_features`*: would require exposing raw PostGIS `geom`
  (not JSON-serializable via PostgREST without a cast/function) and would return per-row overhead
  (JSON envelope per feature) instead of one efficient set-returning function call — an RPC is
  strictly better here, matching the existing `get_intersecting_features` precedent exactly.

**Live finding (2026-07-19, addendum)**: the initial `TABLE`-returning version of this function
was truncated to exactly 1000 rows when called via `supabase.rpc()` — live-verified against the
real 5,233-feature OSM roads (Turkey) dataset (only 1000 of 5,233 rows came back). Root cause:
PostgREST applies its `db-max-rows` setting (default 1000, unconfigured in this project) to any
`SETOF`/`TABLE`-returning function, treating each row as a REST "row." **Fixed** (migration
`20260719130000_exposure_layer_features_rpc_fix_row_limit.sql`) by changing the function to
`RETURNS JSONB` and building the result with `jsonb_agg(...)` instead — PostgREST only row-limits
set-returning functions, not scalar/JSON-returning ones, so a single JSONB array response is
never truncated regardless of dataset size. The response shape returned to the caller is
unchanged (still an array of `{ id, geom_geojson, metric_value, properties }` objects), so no
frontend code needed to change. This is exactly the kind of "proven wrong by live data" finding
this project's other specs (038/040) have documented in their own research.md addenda — recorded
here for the same reason: the original design read as correct until tested against a dataset
actually large enough to hit the real limit.

## §3. Click-to-inspect popups: generic assembly from `properties` + `metric_value`

**Decision**: A pure, testable JS function `buildFeaturePopupHtml(datasetLabel, metricLabel,
metricValue, properties)` assembles popup HTML from whatever is present — no source-specific
branches (no `if (sourceName === 'osm')`). `properties` is already a free-form JSONB bag per
source (e.g. roads: `{ highway, name, osmId }`; population: whatever Kontur's writer stores) —
the function iterates its own keys generically, title-casing/localizing only the *labels* it
already knows are common (dataset name, metric name from `exposure_datasets.metric_property_name`)
and falling back to raw key display for anything else.

**Why**: Matches FR-004's explicit requirement ("sourced generically... rather than
per-source-specific display code") and mirrors how `writeExposureDataset.ts` (spec 040) already
treats `properties` as an opaque per-record bag on the write side — this is the same principle
applied symmetrically on the read/display side.

**Alternatives considered**: A per-source-type popup template registry (e.g. a `roadPopup.vue`,
`populationPopup.vue`). Rejected — directly contradicts FR-004/FR-008 (new source types must need
zero new code) and Constitution Principle I (hazard/source-type-agnostic design).

## §4. Layer color assignment: deterministic per-dataset palette, colorblind-safe

**Decision**: A small fixed palette (6-8 colorblind-safe categorical colors, e.g. an Okabe-Ito-style
set already distinguishable in the most common color-vision-deficiency types) is assigned to
datasets deterministically by hashing `dataset.id` to a palette index — so a given dataset always
gets the same color within a session, and multiple simultaneously-visible layers stay visually
distinct without manual configuration.

**Why**: Constitution Principle VI requires a colorblind-safe palette as a first-class concern, not
an afterthought; deterministic hashing (vs. random or insertion-order assignment) means a layer's
color doesn't shift when unrelated datasets are added/removed, which would otherwise be confusing
across sessions/screenshots (relevant for a demo context).

**Alternatives considered**: Reusing the WFS layers' single hardcoded `#4da3ff` blue for
everything. Rejected — with 2+ simultaneous exposure layers (the whole point of this feature),
indistinguishable colors would defeat the purpose; also the specific gap the user flagged when
referencing Google Flood Hub's color-coded layers.

## §5. Served-country scoping: rely on existing RLS, add no new access-control logic

**Decision**: The new `exposureLayers.js` store does a plain `select('*')` against
`exposure_datasets` (like `ImpactPanel.vue` already does) and relies entirely on that table's
existing RLS policies (`super_admin_exposure_datasets_all`,
`country_admin_exposure_datasets_own`, `org_admin_exposure_datasets_own` —
`20260706170000_impact_analysis.sql`) to scope results. No anon/viewer read policy exists for
`exposure_datasets` today, and this feature does not add one.

**Why**: `exposure_datasets` access is already deliberately restricted to admin/analyst roles
(country_admin, org_admin, super_admin) — distinct from this project's documented "anon sees all"
pattern for public hazard alerting, which applies to a different data domain (CAP alerts/hazard
events, not internal exposure/impact-analysis data). This feature is additive UI on top of
Impact Analysis, which is already an admin/analyst-facing surface — matching that existing,
intentional scoping is correct, not a gap to fix.

## §6. i18n

**Decision**: New strings (layer panel title, per-layer checkbox label pattern, popup field
labels, empty-state message) go into all 7 existing locale files
(`src/i18n/locales/{tr,en,es,fr,ru,ar,zh}.json`) under a new `exposureLayers.*` key namespace,
following the same structure as the existing `mapLayers.*` namespace used by the spec-012 panel.

**Why**: Constitution Principle VI — no hardcoded UI strings, all 7 locales must remain functional.
