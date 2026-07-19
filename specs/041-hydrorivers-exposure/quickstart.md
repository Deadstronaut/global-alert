# Quickstart: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

## Prerequisites

- Migration `<timestamp>_hydrorivers_hydrobasins_exposure_sources.sql` applied.
- Network access to `data.hydrosheds.org` (large downloads — Africa/Europe continent files are
  tens to hundreds of MB; run from a local machine or wherever Overpass/Kontur's downloads were
  already successfully run this session, not necessarily the deployed Edge Function given T018's
  unresolved reachability issue for similarly-shaped outbound fetches).

## 1. Rivers import (Turkey)

1. Run the rivers import for `tr` (via Edge Function if reachable, or the local-script fallback
   already proven for roads/population this session).
2. Confirm an `exposure_datasets` row appears: `source_name: 'hydrorivers'`, `country_code: 'tr'`,
   with a real `feature_count` > 0.
3. Confirm it appears in the map's exposure-layer panel (spec 042) with zero code changes needed
   there — label will show the raw `dataset.name` until `exposureLayerLabel.js` is optionally
   extended with a friendly `hydrorivers` entry (tasks.md, not required for Done).

## 2. Basins import (Turkey)

1. Run the basins import for `tr`.
2. Confirm an `exposure_datasets` row appears: `source_name: 'hydrobasins'`, `country_code: 'tr'`.
3. On the map, toggle the layer on, click a basin polygon, confirm the popup shows its
   `areaKm2`-derived metric value (spec 042's generic popup builder, unmodified) — this is the
   exact interaction the user originally asked to replicate from Google Flood Hub's basin popup.

## 3. Repeat for Madagascar

1. Run both imports for `mg`.
2. Confirm both `exposure_datasets` rows appear with real feature counts, using the *same* code
   path as Turkey (FR-010) — no Madagascar-specific behavior anywhere.

## 4. Malformed/edge-case handling

1. Confirm (via the new unit tests) that a feature failing the country-clip check or per-record
   validation never reaches `exposure_features`, and doesn't fail the whole import for the rest of
   the batch (FR-007).

## 5. Regression check

1. Confirm spec 040 (roads) and spec 038 (population) datasets/imports are unaffected — this
   feature adds new modules only, touches no shared write/validation code paths those sources use.
