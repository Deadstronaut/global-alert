# Quickstart: Validating Waves & the Air-Quality Overlay

## Prerequisites

- Everything from spec 053's own quickstart already working (Wind/Currents layers functional) — this feature builds on that pipeline, not a fresh setup.
- `flow_snapshots.layer_type` CHECK constraint migrated to allow `'wave'`; `overlay_snapshots` table + `overlay-snapshots` Storage bucket migrated (data-model.md).
- `wind-importer` container extended with `fetch_waves.py` and rebuilt.
- A new (or extended) importer container for the air-quality Overlay, with CAMS/Copernicus ADS credentials configured in `server/.env`, following the exact same pattern as `COPERNICUS_MARINE_USERNAME`/`PASSWORD` (spec 053).

## 1. Produce a wave snapshot manually

```
docker compose run --rm wind-importer --layer-type=wave --once
```

Expected: one new row in `flow_snapshots` (`layer_type='wave'`, `source_name='wavewatch3'`), a new PNG in the `flow-snapshots` bucket, console output showing WAVEWATCH III's own `issued_at`.

## 2. Confirm Waves renders on the map

1. Open the flow control panel, select Ocean mode, enable Waves.
2. **Expected**: animated particles appear over ocean areas only (no wave data over land), with a legend now describing wave height rather than wind speed (contracts/wave-snapshot-contract.md).
3. Enable Currents at the same time; confirm both Ocean-mode animations coexist without one hiding the other (spec FR-005/Edge Cases).

## 3. Produce an air-quality overlay snapshot manually

```
docker compose run --rm <overlay-importer-name> --overlay-type=air_quality_pm25 --once
```

Expected: one new row in `overlay_snapshots`, one new pre-colored PNG in the `overlay-snapshots` bucket.

## 4. Confirm the Overlay renders with a legend

1. Open the flow control panel, select Chem/Particulates mode, enable the PM2.5 overlay.
2. **Expected**: a color-graded layer appears on the map with a legend describing what each color means (spec FR-004), matching this app's existing gridded-metric legend style.
3. With Wind also enabled, confirm both layers render together — animated flow visible over/alongside the color overlay, neither hiding the other (spec FR-005/User Story 2 acceptance scenario 2).

## 5. Confirm the not-yet-available modes are honest, not broken

1. Open the flow control panel's Mode list.
2. **Expected**: Space and Bio are visibly disabled with a short explanatory note, not silently missing and not clickable-but-nonfunctional (spec FR-007/User Story 3).
3. Attempt to interact with a disabled mode. **Expected**: no console error, no partial/broken layer appears.

## 6. Confirm graceful degradation matches the existing pattern

1. Make the Waves or Overlay texture URL unreachable (same technique as spec 053 quickstart step 3).
2. **Expected**: the same "unavailable" state already used for Wind/Currents appears — no new/different error handling to verify (spec FR-008).

## 7. Performance check with everything on

With Wind, Currents, Waves, and the air-quality Overlay all enabled simultaneously over a coastal area, pan/zoom continuously for ~30 seconds. **Expected**: no perceptible stutter, consistent with spec 053's SC-003/SC-004 and this spec's SC-003.
