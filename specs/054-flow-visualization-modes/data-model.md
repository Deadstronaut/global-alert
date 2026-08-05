# Data Model: Flow Visualization Modes & Overlays

## Entities

### FlowSnapshot (extends existing table: `flow_snapshots`)

No schema change — `layer_type`'s CHECK constraint gains a third value.

| Field | Type | Notes |
|---|---|---|
| `layer_type` | TEXT | `'wind'` \| `'ocean_current'` \| `'wave'` — the `CHECK (layer_type IN (...))` constraint from `20260805090000_flow_snapshots.sql` needs a migration adding `'wave'` |
| `u_min` / `u_max` / `v_min` / `v_max` | DOUBLE PRECISION | For `wave` rows, these decode the *synthetic* vector (`u = height × sin(direction)`, `v = height × cos(direction)`, research.md §2) — not a literal wind/current velocity. `source_name` (below) is what tells a reader which interpretation applies. |
| `source_name` | TEXT | `'gfs'` (wind) \| `'cmems'` (currents) \| `'wavewatch3'` (wave, new) |

All other columns and invariants are unchanged from spec 053's data-model.md.

### OverlaySnapshot (new table: `overlay_snapshots`)

One row per imported color-graded scalar field (e.g. air quality), at a point in time. Parallel in shape to `flow_snapshots` but scalar (one value per pixel) instead of vector (research.md §4) — deliberately a sibling table, not a reused/overloaded `flow_snapshots` row, so `flow_snapshots`' vector-specific columns (`u_min`/`u_max`/`v_min`/`v_max`) don't have to grow a scalar special case.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `overlay_type` | TEXT | `'air_quality_pm25'` — the one Overlay this spec ships (FR-003); a CHECK constraint here, same pattern as `flow_snapshots.layer_type`, so adding a future overlay type is a migration, not a schema redesign |
| `issued_at` | TIMESTAMPTZ | Source model's own publish time — same "data as of" / staleness role as `flow_snapshots.issued_at` |
| `imported_at` | TIMESTAMPTZ, default now() | Ingest time, distinct from `issued_at`, matching `flow_snapshots`' own convention |
| `texture_storage_path` | TEXT | Path into a new `overlay-snapshots` Storage bucket for a **pre-colored** PNG (see below — unlike `flow_snapshots`' raw-value RG texture, this PNG is already RGBA-colored server-side) |
| `value_min` / `value_max` | DOUBLE PRECISION | The concentration range the color ramp spans, needed to render the on-screen legend (FR-004) |
| `bounds` | DOUBLE PRECISION[4] | `[west, south, east, north]`, same convention as `flow_snapshots.bounds` |
| `source_name` | TEXT | `'cams'` |

**Why pre-colored, unlike `flow_snapshots`' raw RG texture**: `SimpleWindLayer` decodes the RG texture into raw U/V *because it needs the real vector to advect particles*. The Overlay has no particle to advect — it's drawn once as a static (until refreshed) MapLibre `raster` layer, so coloring it once at import time (server-side, using `exposureLayerColor.js`'s existing quantile-ramp technique — research.md §4) is simpler than teaching the browser to decode-then-color a raw value texture on every frame for a layer that never animates.

**Validation / invariants**: same shape as `flow_snapshots` — `value_min <= value_max`; insert-only; "current" = latest `issued_at` per `overlay_type`; covered by the same retention migration pattern as `flow_snapshots` (`20260805100000_flow_snapshot_retention.sql`), extended to also sweep `overlay_snapshots`.

### (Frontend, not persisted) FlowLayerState (extends existing Pinia `ui` store state)

- `wavesEnabled: boolean` (default `false`) — same pattern as `windEnabled`/`currentsEnabled` (spec 053 data-model.md)
- `airQualityOverlayEnabled: boolean` (default `false`)
- `selectedMode: 'air' | 'ocean' | 'chem'` (default `'air'`) — drives which Animate/Overlay options the panel surfaces, per FR-007's Mode grouping; `'particulates' | 'space' | 'bio'` are valid *values* for display (disabled entries) but never resolve to an enabled layer

## Relationships

`OverlaySnapshot`, like `FlowSnapshot`, has no foreign keys — a standalone global periodic snapshot, not country-scoped (same reasoning as spec 053 data-model.md's "Relationships" section: air quality is a global atmospheric field, not a per-country upload).
