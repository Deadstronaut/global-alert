# Quickstart: Validating the Wind/Current Flow Layer

## Prerequisites

- Local Supabase stack running (`supabase start`) with the `flow_snapshots` table migrated (see data-model.md) and a Storage bucket for wind/current textures created.
- The new scheduled importer container built (`docker compose build wind-importer`, name TBD in tasks) with network access to NOAA NOMADS.
- Frontend dev server running (`npm run dev`), logged in with any role that can view the map (this is a global, non-country-scoped layer — no special role should be required per data-model.md's relationships note).

## 1. Produce a snapshot manually

```
docker compose run --rm wind-importer --layer-type=wind --once
```

Expected: one new row in `flow_snapshots` (`layer_type='wind'`), one new PNG object in Supabase Storage, console output showing the source `issued_at` timestamp it picked up from NOMADS.

## 2. Confirm the frontend picks it up

1. Open the app, go to the 2D map (world view, no country selected).
2. Enable the wind layer from the map's layer controls (spec FR-001).
3. **Expected**: animated particles appear within a couple of seconds, moving in directions that plausibly match real current wind patterns (spot-check against a known reference like windy.com for the same day).
4. Check the layer's legend: confirms a speed scale with units (spec FR-003) and an "as of [timestamp]" matching the `issued_at` from step 1 (spec FR-004).

## 3. Confirm graceful degradation

1. Stop the local Supabase Storage service (or otherwise make the texture URL unreachable).
2. Reload the map, enable the wind layer.
3. **Expected**: the layer shows a clear "unavailable" state (spec FR-006) — the rest of the map (markers, other layers) continues working normally.

## 4. Confirm staleness detection

1. Manually set the latest `flow_snapshots` row's `issued_at` to more than 12 hours in the past (2x the 6h cadence).
2. Reload the map, enable the wind layer.
3. **Expected**: the layer renders (using the stale data) but visibly flags it as potentially outdated rather than presenting it as current (spec FR-006/User Story 3 acceptance scenario 2).

## 5. Confirm currents work independently of wind

1. With wind disabled, enable only the ocean-currents layer (produced the same way as step 1 with `--layer-type=ocean_current`).
2. **Expected**: animated particles appear only over ocean areas, none over land (spec User Story 4 acceptance scenario 1).
3. Enable both layers at once over a coastal area; confirm both animations are visually distinguishable and the map stays responsive (spec User Story 4 acceptance scenario 2, SC-003/SC-004).

## 6. Performance check

With both layers enabled, pan/zoom the world view continuously for ~30 seconds. **Expected**: no dropped-frame stutter perceptible to the eye, and clicking an existing hex/marker on the map still responds immediately (SC-003/SC-004) — see `research.md` §2 for why this depends on the vendored WebGL particle layer, not a DOM/SVG approach.
