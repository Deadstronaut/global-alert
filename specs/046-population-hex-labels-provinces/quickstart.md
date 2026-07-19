# Quickstart: Population Hexagon Labels + Province-Level Population View

## Prerequisites

- Frontend dev server running (`npm run dev`).
- Logged in with a session scoped to (or super-admin over) Turkey — Turkey has both a population
  exposure dataset (Kontur, re-aggregated to H3 res 7 this session — see the Kontur timeout fix
  committed alongside spec 045's follow-up work) and bundled province boundary data
  (`tr-provinces.json`, 81 provinces), so it exercises both User Story 1 and User Story 2.

## Validate User Story 1 — hexagon population labels

1. Select Turkey on the map, open the exposure-layers panel, toggle on the Kontur (or WorldPop)
   population layer.
2. Switch the left sidebar to "Petek" (hexagon) mode.
3. Zoom in until hexagons are visually large (city-block scale or larger).
   - **Expected**: each visible hexagon shows its population number as on-map text (e.g. "482K"),
     without needing to click it.
4. Zoom back out past the legibility threshold.
   - **Expected**: labels disappear; hexagon fills remain exactly as before this feature.
5. Switch the sidebar to "Durum" (hazard status) mode.
   - **Expected**: no population numbers are shown on the hazard-status hex grid — labels are
     exclusive to population-sourced exposure hexagons (FR-002).
6. Toggle the population exposure layer off.
   - **Expected**: its labels disappear along with its hexagons (no orphaned label layer).

## Validate User Story 2 — province-level population view

1. With the Kontur (or WorldPop) population layer active for Turkey, find and use the new
   "province view" toggle in the exposure-layers panel row for that dataset.
   - **Expected**: the hexagon grid for that dataset is replaced by Turkey's 81 provinces, each
     shaded by its total aggregated population using the same graduated color ramp as the
     hexagon view.
2. Click/hover a province (e.g. "İzmir" or "Aydın").
   - **Expected**: a popup/tooltip shows the province name and its total population.
3. Toggle back to hexagon view.
   - **Expected**: the original hexagon grid reappears unchanged; no lost toggle/opacity state
     for this or any other layer.
4. Select Madagascar (no bundled province data) and toggle on its population layer.
   - **Expected**: the province-view option is disabled/hidden for this dataset — no blank map,
     no console error; hexagon view works normally (FR-007).

## Notes

- No backend changes are involved in this feature — if a population layer fails to load at all,
  that's outside this feature's scope (see the separate Kontur-timeout fix already applied this
  session for `exposure_datasets`/`exposure_features`).
- Live browser click-through for this quickstart was not performed as part of planning (no
  browser automation tool available in this environment) — to be run manually, or via whatever
  live-verification step the implementer performs before marking tasks complete, per this
  session's established convention (see specs 044/045's tasks.md caveats).
