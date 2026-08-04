# Contract: Flow Snapshot (wind / ocean current)

Two consumers share this contract: the scheduled importer (research.md §4/§5, producer) and `MapView.vue`'s new custom MapLibre layer (consumer).

## Producer → Storage

The importer, on each 6-hourly run per `layer_type`:

1. Fetches the latest GFS GRIB2 U/V field (wind: surface/10m; current: NOAA ocean-current product — pinned during `/speckit-tasks`).
2. Converts it to an RG-channel PNG texture (equirectangular projection, red=U, green=V, normalized to the field's own min/max).
3. Uploads the PNG to Supabase Storage (path convention: `flow-snapshots/{layer_type}/{issued_at-ISO8601}.png`).
4. Inserts one `flow_snapshots` row (data-model.md) referencing that path, with the decode ranges and `issued_at` taken from the source GRIB2's own metadata (never the wall-clock import time).

Failure handling: mirrors this app's existing "fail loudly, keep prior data" convention (e.g. `writeExposureDataset.ts`'s supersede-only-after-success rule) — a failed conversion/upload MUST NOT touch the previously-inserted row; the frontend simply keeps serving the last successful snapshot, and its own staleness check (below) is what surfaces the problem to the user, per spec FR-006.

## Frontend → Consumer

`MapView.vue`'s wind/current layer, on enable and on its own refresh timer:

1. Reads the latest `flow_snapshots` row for the relevant `layer_type` (`ORDER BY issued_at DESC LIMIT 1`) — a plain Supabase select, same access pattern as every other read-only map layer in this app (RLS: public SELECT, matching `exposure_datasets`/`exposure_features`'s existing public-read policy — this data has no per-country/tenant sensitivity).
2. Resolves `texture_storage_path` to a fetchable URL via Supabase Storage's public/signed URL API and loads it as the custom layer's WebGL texture.
3. Uses `u_min/u_max/v_min/v_max` to decode particle velocities from the texture's RG channels, per the vendored particle-layer library's existing expected input shape (research.md §2).
4. Compares `issued_at` against "now"; if older than ~2x the expected 6-hour cadence, renders the "data may be stale" state required by spec FR-006/User Story 3 acceptance scenario 2, instead of silently presenting it as current.

## Explicitly not part of this contract

- No live third-party API call happens from the browser (spec Assumptions) — the frontend only ever talks to Supabase.
- No per-country scoping — unlike every existing exposure layer, `flow_snapshots` rows are global; the layer_type + issued_at pair is the only lookup key.
