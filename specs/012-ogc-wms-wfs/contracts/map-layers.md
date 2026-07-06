# Contract: Map Layer Registry & Rendering

No REST API layer exists for this project (direct Supabase client calls guarded by RLS, plus
client-side MapLibre GL rendering). This contract documents the enforced behavior.

## Operation: Insert/Update `map_layers`

**RLS**: only `super_admin` may `INSERT`/`UPDATE`/`DELETE`. All authenticated users may `SELECT`
rows where `is_active = true`; `super_admin` may `SELECT` all rows.

**Application-layer validation (before every insert/update, FR-002)**:
`isSafeLayerEndpointUrl(endpoint_url)` must return `true`, else the client MUST reject the
submission with a clear reason before calling Supabase — mirrors the SRS's MHEWS-FC-INV-09 intent
(HTTPS-only, no private/loopback/link-local address).

**Required fields**: `display_name`, `source_type` (`wms`|`wfs`), `endpoint_url`, `layer_name`.

## Operation: Render a `wms` layer on toggle-on

1. Build tile URL:
   `{endpoint_url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS={layer_name}&STYLES=&FORMAT=image/png&TRANSPARENT=true&CRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`
2. `map.addSource(sourceId, { type: 'raster', tiles: [tileUrl], tileSize: 256 })`
3. `map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': currentOpacity } })`

## Operation: Render a `wfs` layer on toggle-on

1. Fetch: `GET {endpoint_url}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES={layer_name}&OUTPUTFORMAT=application/json`
2. On success: `map.addSource(sourceId, { type: 'geojson', data: featureCollection })`, then add
   one or more paint layers appropriate to the returned geometry types (circle for points,
   line for lines, fill+outline for polygons), each with an `-opacity` paint property bound to
   `currentOpacity`.
3. On fetch failure (network error, non-200, invalid JSON): the layer's toggle remains available
   and reflects "on" in the UI, but no source/layer is added to the map — this is the "fails to
   render silently" edge case from spec.md, not surfaced as a blocking error.

## Operation: Toggle off / opacity change

- Toggle off: `map.removeLayer(layerId)` (and any additional geometry-specific layers for WFS)
  then `map.removeSource(sourceId)`.
- Opacity change on an already-visible layer: `map.setPaintProperty(layerId, 'raster-opacity', v)`
  for WMS, or the equivalent `*-opacity` property for each WFS geometry-specific layer — no
  source/layer removal or re-fetch required (FR-006, SC-002: "no page reload required").

## Operation: Admin deactivates a layer

- Standard `UPDATE map_layers SET is_active = false WHERE id = ...` (RLS-gated to `super_admin`).
- Any currently-open map session showing that layer keeps rendering it until the user's next
  fetch of the active-layers list (e.g. next page load) — no requirement for live push-based
  removal from an already-open session, since FR-007's guarantee is about the layer panel's
  contents, which is refreshed from the registry on load.
