# Phase 0 Research: OGC WMS/WFS Map Layers

No `[NEEDS CLARIFICATION]` markers remained in the spec. This phase confirms the technical
approach against MapLibre GL's actual capabilities (the project's established map engine,
MHEWS-SD-MAP-01) and existing repo conventions.

## Decision: WMS rendered as a MapLibre `raster` source using a WMS `GetMap` tile-URL template

- **Decision**: For a `wms`-type map layer, build a tile URL template of the form
  `{endpoint}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS={layer_name}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
  and register it via `map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 })` +
  `map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': ... } })`.
- **Rationale**: MapLibre GL JS natively supports `raster` sources with a `{bbox-epsg-3857}`
  placeholder specifically designed for WMS `GetMap` tile requests — this is MapLibre's
  documented, first-class mechanism for consuming WMS servers, requiring no custom tiling
  server or proxy. `raster-opacity` is a built-in paint property, directly satisfying FR-006
  (opacity control) with no custom rendering code.
- **Alternatives considered**: Proxying WMS through a Supabase Edge Function to reproject/cache
  tiles — rejected as unnecessary complexity (Principle VIII); MapLibre's native WMS tile-URL
  support already satisfies every requirement in this spec without a server-side component.

## Decision: WFS rendered as a MapLibre `geojson` source fetched live via `GetFeature`

- **Decision**: For a `wfs`-type map layer, on toggle-on the client fetches
  `{endpoint}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES={feature_type_name}&OUTPUTFORMAT=application/json`
  directly from the browser, and registers the returned FeatureCollection via
  `map.addSource(id, { type: 'geojson', data: featureCollection })` + `map.addLayer(...)` (circle
  paint for points, line/fill paint for lines/polygons — inferred from geometry type at render
  time). Toggle-off removes the source/layer.
- **Rationale**: `outputFormat=application/json` (or `application/json; subtype=geojson`) is a
  standard WFS 2.0 capability supported by virtually all modern OGC-compliant WFS servers
  (GeoServer, MapServer, etc.), letting the browser consume the response directly as GeoJSON with
  no server-side transformation — consistent with FR-008's "consume only, render live, never
  store" requirement.
- **Alternatives considered**: Routing WFS requests through a Supabase Edge Function to avoid
  CORS issues — deferred; most public OGC WFS services already support CORS or JSONP-free CORS
  headers for GetFeature, and adding a proxy purely for CORS is exactly the kind of complexity
  Principle VIII asks to avoid until proven insufficient. If a specific customer's WFS endpoint
  lacks CORS support, that becomes a documented per-deployment limitation, not a reason to
  introduce a proxy for every deployment.

## Decision: `map_layers` as its own table, not an extension of `data_sources`

- **Decision**: New `map_layers` table, independent of `data_sources`.
- **Rationale**: `data_sources.hazard_type` has a `CHECK` constraint limited to the 5
  hazard-event types and every existing consumer of that table (health dashboard, state machine,
  `fetch-*` functions) assumes a row produces ingested, deduplicated `DisasterEvent` records. A
  map layer produces neither a hazard type nor a stored event (FR-008) — reusing `data_sources`
  would require loosening that CHECK constraint and teaching every existing consumer to treat
  some rows as "not really a hazard-event source," which is more invasive than a small,
  independent table.
- **Alternatives considered**: Adding a `source_kind` discriminator column to `data_sources` to
  cover both cases in one table — rejected: the health-state machine, staleness thresholds, and
  consecutive-failure tracking on `data_sources` are all meaningless for a client-side-rendered
  overlay with no ingestion attempt/failure concept, so a shared table would carry many
  always-null columns for map layers, violating YAGNI more than a second small table does.

## Decision: URL safety check (FR-002) as a pure JS validator, checked before insert

- **Decision**: `src/utils/mapLayerUrlSafety.js` exports `isSafeLayerEndpointUrl(url)`: returns
  `false` if the URL is not `https://`, or if its hostname is `localhost`, an RFC 1918 private IP
  range, a loopback address, or a link-local address; `true` otherwise. Checked client-side before
  insert; the `map_layers` RLS/insert path relies on this application-layer check (no DB-level
  regex/CHECK constraint attempting full hostname/IP classification, which Postgres cannot do
  robustly without a DNS-resolution step it does not have).
- **Rationale**: MHEWS-FC-INV-09 (SRS) calls for exactly this check ("HTTPS, reachability, SSRF
  protection") but it does not exist anywhere in the codebase yet, not even for the original
  `data_sources` table — since this spec introduces a fresh external-URL-accepting admin surface,
  it is the right place to add the underlying validator function once (reusable later if
  `data_sources` is retrofitted with the same check in a separate, future change), without
  expanding this spec's scope to also retrofit `data_sources`.
- **Alternatives considered**: A live reachability probe (actually attempting to connect to the
  URL before allowing registration) — rejected: real SSRF protection is about rejecting
  *addresses that should never be reached from the server*, not confirming reachability (which a
  temporarily-down but otherwise legitimate endpoint would fail); a static hostname/IP-shape check
  is the correct, simpler tool for this job and matches the SRS wording ("HTTPS, reachability,
  SSRF protection" is one compound requirement whose SSRF-protection clause is the actual security
  concern; "reachability" in the sense of a live probe is not required by any acceptance scenario
  in this spec).

## Decision: layer toggle/opacity state lives in component state, not persisted (FR-009)

- **Decision**: On/off and opacity values are plain reactive Vue state in `MapView.vue`
  (or a small composable), reset on reload; only the `map_layers` registry itself (name, type,
  endpoint, active flag) is persisted server-side.
- **Rationale**: FR-009 explicitly scopes per-user layer preference persistence out of this
  iteration; keeping it in local component state is the simplest implementation satisfying the
  spec exactly, with no unused persistence plumbing.
- **Alternatives considered**: Persisting per-user layer visibility/opacity to `profiles` or a new
  preferences table — explicitly rejected by spec.md's Assumptions as out of scope for this
  iteration.

All decisions above resolve directly from spec.md requirements, MapLibre GL's documented
capabilities, and existing repo patterns — no outstanding unknowns remain for Phase 1.
