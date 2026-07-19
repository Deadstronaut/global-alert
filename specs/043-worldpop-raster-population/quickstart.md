# Quickstart: WorldPop Raster Population Exposure Source

## Prerequisites

- Migration `<timestamp>_worldpop_population_raster_exposure_source.sql` applied.
- Network access to `hub.worldpop.org` and `data.worldpop.org` (GeoTIFF downloads — a
  country-scale 100m raster can be tens to low-hundreds of MB; run from a local machine or
  wherever Overpass/Kontur/HydroSHEDS downloads were already successfully run this session, not
  necessarily the deployed Edge Function given spec 040 T018's unresolved reachability issue for
  similarly-shaped outbound fetches).

## 1. WorldPop import (Turkey)

1. Run the WorldPop import for `tr` (via Edge Function if reachable, or the local-script fallback
   already proven for roads/rivers/basins this session).
2. Confirm an `exposure_datasets` row appears: `source_name: 'worldpop'`, `country_code: 'tr'`,
   with a real `feature_count` > 0.
3. Confirm it appears in the map's exposure-layer panel (spec 042) with zero code changes needed
   there — label will show the raw `dataset.name` until `exposureLayerLabel.js` is optionally
   extended with a friendly `worldpop` entry (tasks.md, not required for Done).

## 2. Cross-check against Kontur (US1/SC-002)

1. With both `kontur` and `worldpop` datasets present for `tr`, toggle each on in turn on the map.
2. Confirm both are independently selectable population layers for the same country, each with
   its own hexagon grid and popup-visible value — no merged or averaged display, per spec.md's
   Assumptions (the two sources are shown separately, not reconciled into one number).

## 3. Repeat for Madagascar

1. Run the import for `mg`.
2. Confirm the `exposure_datasets` row appears with a real feature count, using the *same* code
   path as Turkey (FR-010) — no Madagascar-specific behavior anywhere.

## 4. Re-import / supersession check (US1 acceptance scenario 3)

1. Re-run the import for `tr` a second time.
2. Confirm exactly one `worldpop`/`tr` `exposure_datasets` row exists afterward (the prior run's
   row was superseded, not left as a duplicate) — same convention as every other exposure source.

## 5. Malformed/edge-case handling (US3)

1. Confirm (via the new unit tests) that a no-data/invalid pixel is excluded from aggregation
   rather than treated as zero, and that a hexagon receiving zero valid pixels never becomes a
   record (FR-008, research.md §5).
2. Confirm a country-level failure (e.g. no WorldPop coverage) is skipped and logged without
   blocking the other served country's import (FR-009).

## 6. Regression check

1. Confirm specs 038 (Kontur population), 040 (roads), and 041 (rivers/basins) datasets/imports
   are unaffected — this feature adds new modules only, touches no shared write/validation code
   paths those sources use.
