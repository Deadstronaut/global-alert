# Quickstart: OGC WMS/WFS Map Layers

## Prerequisites

- Migration `20260707150000_map_layers.sql` applied to the target Supabase project.
- Logged in as `super_admin` (for layer registration) and separately as any other role (to verify
  toggle-only access).
- A real, publicly reachable WMS endpoint (e.g. a public GeoServer demo WMS) and a real WFS
  endpoint with `outputFormat=application/json` support, for end-to-end rendering verification.

## Scenario 1 — Register a layer (FR-001, FR-002, FR-003, SC-001, SC-004)

1. As `super_admin`, open the new "🗺️ Map Layers" tab in `AdminView.vue`.
2. Register a WMS layer: display name, endpoint URL (HTTPS, public), layer name. **Expected**:
   saved, appears in the registry list, inactive by default.
3. Attempt to register a layer with an `http://` (non-HTTPS) endpoint. **Expected**: rejected
   client-side before any Supabase call, with a clear reason.
4. Attempt to register a layer with an endpoint resolving to `127.0.0.1` or a private IP range.
   **Expected**: rejected the same way.
5. As `country_admin` (not `super_admin`), attempt to register a layer. **Expected**: rejected.
6. Activate the WMS layer registered in step 2 (toggle `is_active`).

## Scenario 2 — Toggle and adjust a WMS layer on the map (FR-004, FR-005, FR-006, SC-002)

1. As any authenticated user, open the map view. **Expected**: the active WMS layer appears in
   the map's layer panel, off by default.
2. Toggle it on. **Expected**: the raster overlay renders on the map within the same page load.
3. Drag its opacity slider. **Expected**: the rendered overlay's transparency updates immediately,
   no re-toggle or reload needed.
4. Toggle it off. **Expected**: the overlay disappears.

## Scenario 3 — Toggle a WFS layer (FR-004, FR-005, FR-006)

1. As `super_admin`, register and activate a WFS layer (endpoint + feature type name supporting
   `outputFormat=application/json`).
2. As any user, open the map, toggle the WFS layer on. **Expected**: vector features render
   (points/lines/polygons depending on the feature type's geometry).
3. Adjust opacity. **Expected**: rendered feature transparency updates immediately.

## Scenario 4 — Deactivate / edit a layer (FR-007, SC-003)

1. As `super_admin`, deactivate the WMS layer from Scenario 1.
2. As any user, reload the map. **Expected**: the layer no longer appears anywhere in the layer
   panel (not greyed out — absent).
3. Reactivate it; edit its display name. **Expected**: the new name appears in the layer panel on
   next load.

## Scenario 5 — Unreachable endpoint (Edge Case)

1. Register and activate a layer pointing at a syntactically valid but unreachable HTTPS endpoint.
2. Toggle it on. **Expected**: no error dialog blocks the map; the layer simply renders nothing
   (WMS: no tiles appear; WFS: no features appear), consistent with spec.md's Edge Cases.

## Scenario 6 — i18n coverage (Principle VI)

Switch the UI language across all 7 locales (tr/en/es/fr/ru/ar/zh) and confirm the Map Layers
admin tab, its registration form, and the map's layer panel all render translated text with no
missing-key fallbacks, and Arabic renders with correct RTL layout.
