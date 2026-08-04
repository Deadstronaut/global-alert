# Data Model: Animated Wind Flow Visualization

## Entities

### FlowSnapshot (new table: `flow_snapshots`)

One row per imported wind-or-current field, at a point in time. Deliberately NOT `exposure_features` — see `research.md` §3 for why the existing scalar-per-hex shape doesn't fit vector flow data.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `layer_type` | TEXT | `'wind'` \| `'ocean_current'` — the two Animate modes from spec FR-009 |
| `issued_at` | TIMESTAMPTZ | When the source model published this field (e.g. GFS's own forecast-cycle timestamp) — drives spec FR-004/SC-005's "data as of" display and staleness detection |
| `imported_at` | TIMESTAMPTZ, default now() | When this app's pipeline produced the row — distinct from `issued_at` the same way every other source in this app separates source-time from ingest-time |
| `texture_storage_path` | TEXT | Path into Supabase Storage for the RG-channel PNG texture (see research.md §2–3) |
| `u_min` / `u_max` / `v_min` / `v_max` | DOUBLE PRECISION | Decode range for the texture's red/green channels, required by the rendering layer to reconstruct real U/V values |
| `bounds` | DOUBLE PRECISION[4] | `[west, south, east, north]` — equirectangular extent the texture covers (global for GFS, but keeps the model source-agnostic) |
| `source_name` | TEXT | e.g. `'gfs'` — mirrors `rasterSourceConfig.ts`'s existing `sourceName` convention on other layers, so this fits the same "which source produced this" story as every other dataset |

**Validation / invariants**:
- `u_min <= u_max`, `v_min <= v_max`.
- Exactly one *current* (non-superseded) row per `layer_type` is considered "active" at a time — old rows are retained per this app's existing retention-policy convention (see `supabase/migrations/20260730130000_enforce_retention_policies_extend_timeout.sql` for the established pattern to extend, not reinvent) rather than deleted outright, so a staleness check (spec User Story 3, acceptance scenario 2) can compare "now" against the latest `issued_at` even if that latest import failed and an older row is still what's being served.

**State/lifecycle**: insert-only from the scheduled importer (research.md §4); no in-place updates. "Current" is simply "latest `issued_at` per `layer_type`" — no separate status column needed, matching the supersede-by-recency pattern already used by other periodic sources in this app.

### (Frontend, not persisted) FlowLayerState

Per-session UI state for each of the two Animate modes — lives in the existing Pinia `ui` store alongside this app's other map-layer toggle state (e.g. `showHeatmap`, `showHexbins`), not a new store:

- `windEnabled: boolean` (default `false`, per spec FR-001)
- `currentsEnabled: boolean` (default `false`)
- Opacity/intensity, if exposed, follows the same per-layer opacity convention already used by exposure layers (`layerOpacity` keyed state in `MapView.vue`) rather than inventing a new control shape.

## Relationships

`FlowSnapshot` has no foreign keys to other entities — it's a standalone periodic snapshot, same as this app's other raster-derived sources (`exposure_datasets` rows also stand alone, keyed only by `source_name` + `country_code`). No relationship to `country_boundaries` or `exposure_datasets` is needed: wind/current fields are global, not country-scoped (unlike every existing exposure layer, which is deliberately per-country — see FR note in spec Assumptions that this is intentionally global-first).
