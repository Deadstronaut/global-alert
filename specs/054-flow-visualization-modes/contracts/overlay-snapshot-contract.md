# Contract: Overlay Snapshot (air quality)

Two consumers share this contract: the scheduled importer (producer) and `MapView.vue`'s new raster overlay layer (consumer). Structurally parallel to spec 053's `flow-snapshot-contract.md`, but for a scalar, pre-colored raster instead of a vector particle-flow texture (data-model.md's "Why pre-colored" note).

## Producer → Storage

The importer, on each periodic run (cadence matches CAMS's own publish schedule — pinned during `/speckit-tasks`, expected daily or better):

1. Fetches the latest CAMS PM2.5 surface-concentration field via the Copernicus Atmosphere Data Store API (research.md §3), analogous to how `fetch_currents.py` calls `copernicusmarine.subset()`.
2. Resamples to a fixed grid (same technique as `flow_texture_common.py`'s `resample_band_to_grid`).
3. Colors the resampled values server-side using a quantile-ramp matching `exposureLayerColor.js`'s existing gridded-metric convention (research.md §4), producing an RGBA PNG where pixel color directly IS the display color — not an encoded value needing browser-side decoding.
4. Uploads the PNG to a new `overlay-snapshots` Storage bucket (path convention: `overlay-snapshots/{overlay_type}/{issued_at-ISO8601}.png`, mirroring `flow-snapshots`' own convention).
5. Inserts one `overlay_snapshots` row (data-model.md) with `value_min`/`value_max` (the ramp's domain, needed for the legend) and `issued_at` taken from CAMS's own metadata.

Failure handling: identical "fail loudly, keep prior data" convention as the existing Flow Snapshot contract — a failed run never touches the previously-inserted row.

## Frontend → Consumer

`MapView.vue`'s air-quality overlay layer, on enable and its own refresh timer:

1. Reads the latest `overlay_snapshots` row (`ORDER BY issued_at DESC LIMIT 1`) — public SELECT RLS, same as `flow_snapshots`.
2. Adds the PNG as a plain MapLibre `raster` source/layer (no custom WebGL layer needed — this is a standard layer type, unlike the particle-flow layers) at `bounds`.
3. Renders a legend using `value_min`/`value_max` and the same quantile-ramp swatch presentation `exposureLayerColor.js`'s existing gridded-metric legends already use (FR-004).
4. Applies the same staleness comparison (`issued_at` vs. now, vs. expected cadence) and "unavailable" empty-state as the existing Flow Snapshot contract (FR-008).

## Explicitly not part of this contract

- No browser-side value decoding or custom color ramp logic — all coloring happens once, server-side, at import time.
- No per-country scoping — same global-snapshot reasoning as `flow_snapshots` (data-model.md's Relationships section).
