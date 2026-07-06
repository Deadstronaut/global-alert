# Phase 1 Data Model: OGC WMS/WFS Map Layers

## Entity: `map_layers` (new)

| Field | Type | Constraints |
|---|---|---|
| `id` | UUID PK | `DEFAULT gen_random_uuid()` |
| `display_name` | TEXT NOT NULL | shown in the map's layer panel |
| `source_type` | TEXT NOT NULL | `CHECK (source_type IN ('wms', 'wfs'))` |
| `endpoint_url` | TEXT NOT NULL | must pass `isSafeLayerEndpointUrl()` before insert/update (FR-002) — application-enforced, not a DB CHECK (see research.md) |
| `layer_name` | TEXT NOT NULL | WMS `LAYERS` param value, or WFS `TYPENAMES` value depending on `source_type` |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | inactive layers excluded from every user's layer panel (FR-007) |
| `created_by` | UUID FK → `auth.users(id)` ON DELETE SET NULL | |
| `created_at` / `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | `updated_at` maintained by existing `set_updated_at()` trigger |

**RLS**:
- `super_admin`: `FOR ALL`
- all other authenticated roles: `FOR SELECT USING (is_active = true)`

(Same shape as `sop_documents` in spec 011 and `hazard_types` in spec 010 — a small,
super_admin-managed global reference registry with public-active-only read access.)

**Audit**: covered by the existing generic `log_table_change()` trigger.

**No relationship to `data_sources`**: deliberately independent (see research.md) — a
`map_layers` row never produces a row in any hazard-event table, and no FK exists between the two.

## Client-side-only state (not persisted, FR-009)

| State | Scope | Notes |
|---|---|---|
| Layer visibility (on/off) | Current map session, per layer | Vue reactive state in `MapView.vue`; defaults to off for every layer on load |
| Layer opacity | Current map session, per layer | Vue reactive state; a sensible default (e.g. 0.7) applied when a layer is first toggled on |
| WFS `FeatureCollection` response | Current map session, per layer, while toggled on | Held only in the MapLibre `geojson` source's in-memory data; discarded when toggled off; never written to any table (FR-008) |
