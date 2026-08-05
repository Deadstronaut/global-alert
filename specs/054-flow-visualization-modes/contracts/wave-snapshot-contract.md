# Contract: Wave Snapshot (extends the existing Flow Snapshot contract)

This is an addendum to spec 053's `contracts/flow-snapshot-contract.md`, not a replacement — everything there (Storage path convention, Supabase row shape, staleness check, public-read RLS) applies unchanged. This file only calls out what's different for `layer_type = 'wave'`.

## Producer → Storage (delta from the existing contract)

1. Fetches the latest WAVEWATCH III GRIB2 fields from NOMADS (`HTSGW` significant wave height, `DIRPW` primary wave direction) — same fetch/retry-previous-cycle shape as `fetch_gfs.py`, new sibling module `fetch_waves.py`.
2. **Before** the existing RG-texture encoding step: converts height+direction into a synthetic vector, `u = height × sin(direction)`, `v = height × cos(direction)` (research.md §2) — from this point on, the pipeline is identical to wind/currents (same `grib_to_texture.py`-family conversion, same PNG shape, same `flow_snapshots` row shape).
3. Inserts the row with `layer_type = 'wave'`, `source_name = 'wavewatch3'`.

## Frontend → Consumer (delta from the existing contract)

No changes — `SimpleWindLayer` and the panel's staleness/status logic operate on `layer_type` generically already (spec 053 `MapView.vue`'s `FLOW_LAYER_IDS`/`flowLayerInstances` are keyed by layer type, not hardcoded to two values). The one UI-visible difference is that the decoded "speed" a particle carries represents wave height (meters), not wind speed (m/s) — the control panel's speed-legend labels must reflect this per layer type rather than always saying "wind speed."

## Explicitly not part of this contract

- No new rendering technique — reuses `SimpleWindLayer` exactly as-is (research.md §2's rejected alternative was a dedicated wave-arrow shader).
