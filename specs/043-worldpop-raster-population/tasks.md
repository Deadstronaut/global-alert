---

description: "Task list for feature 043: WorldPop Raster Population Exposure Source"
---

# Tasks: WorldPop Raster Population Exposure Source

**Input**: Design documents from `/specs/043-worldpop-raster-population/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-worldpop-exposure.md, quickstart.md

**Scope note**: This feature ships **1** source — WorldPop, built on a generic
`RasterSourceConfig`/`rasterToHexagon.ts` mechanism (FR-011) so future raster sources (Meta/HDX
Population, GHSL) are a config addition later, not new processing code now. MVP success is scoped
to Turkey and Madagascar (spec SC-001).

**Tests**: Included for the new pure functions (aggregation, validation, partition) — same
"critical business logic" convention specs 038/040/041 established; DB/network/raster-download-
touching fetch modules are manually verified via live runs, not unit tested.

**Organization**: Tasks are grouped by user story (US1-US3 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Created migration `supabase/migrations/20260719150000_worldpop_population_raster_exposure_source.sql`, applied to the linked remote project (`supabase db push`).
- [X] T002 [P] Implemented `supabase/functions/shared/rasterSourceConfig.ts` — `RasterSourceConfig` interface + `WORLDPOP_SOURCE_CONFIG` entry (h3Resolution 7, pixelValueMeaning 'count').

**Checkpoint**: Migration applies cleanly; the generic config mechanism exists for the fetch module to plug into.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Defined `PopulationRasterRecord` type in `supabase/functions/shared/populationRasterRecord.ts`.
- [X] T004 Implemented `supabase/functions/shared/rasterToHexagon.ts` — `aggregateRasterToHexagons(rasterBuffer, config, countryBoundary, countryCode)`: windowed `geotiff.js` read (512-row blocks), no-data-aware pixel skip, `h3-js` `latLngToCell` accumulation into `Map<h3CellId, sum>`, `cellToBoundary` + country-boundary center-point filter (research.md §4-§6).
- [X] T005 [P] Added `rasterToHexagon.test.ts` — 5 tests (sum aggregation, no-data exclusion, boundary exclusion, zero-valid-pixels-never-a-record, valid Polygon geometry shape). Passing. Note: geotiff.js's `writeArrayBuffer` test helper always anchors synthetic rasters at the north pole/antimeridian corner regardless of a supplied `ModelTiepoint` — H3's pole distortion (a pixel near -180,90 produced a cell centered near lng 174.6) required a full-globe test boundary rather than a tight one; documented in the test file, not a bug in the module under test.
- [X] T006 [P] Implemented `validatePopulationRasterRecord.ts` per data-model.md.
- [X] T007 [P] Added `validatePopulationRasterRecord.test.ts` — 6 tests. Passing.
- [X] T008 [P] Implemented `populationRasterImportPartition.ts` (mirrors `riverImportPartition.ts`/`basinImportPartition.ts`).
- [X] T009 [P] Added `populationRasterImportPartition.test.ts` — 4 tests. Passing.

**Checkpoint**: Aggregation, validation, and partition logic implemented and tested independently of WorldPop-specific download code — ready for the fetch module to consume.

---

## Phase 3: User Story 1 - A second, independent population estimate appears automatically (Priority: P1) 🎯 MVP

**Goal**: WorldPop population exposure data for Turkey and Madagascar appears via import, usable in the exposure-layer map (spec 042) exactly like every other source.

**Independent Test**: Run the WorldPop import for a served country, confirm a resulting `exposure_datasets`/`exposure_features` set (worldpop) is usable in the map exactly like Kontur.

### Implementation for User Story 1

- [X] T010 [US1] Implemented `supabase/functions/shared/worldPopFetch.ts` — `resolveWorldPopDownloadUrl(iso3)` (calls `hub.worldpop.org/rest/data/pop/wpgp?iso3=<ISO3>`, picks the latest-popyear `.tif` resource — live-confirmed against Turkey's real API response, 21 years available, 2000-2020) and `fetchWorldPopPopulation(countryCodes)`.
- [X] T011 [P] [US1] Added `worldPopFetch.test.ts` — 3 tests against a mocked `fetch` (latest-year selection, no-coverage returns null, non-ok HTTP throws). Passing.
- [X] T012 [US1] Implemented `supabase/functions/import-worldpop/index.ts` per contracts/import-worldpop-exposure.md.
- [X] T013 [US1] Added `[functions.import-worldpop]` block (`verify_jwt = true`) to `supabase/config.toml`.
- [X] T014 [US1] **Live run (Turkey)**: `fetchWorldPopPopulation(['tr'])` (2020 raster, tur_ppp_2020.tif) → **138,932 valid hexagons, 0 rejected**. Written to `exposure_datasets` (`source_name: 'worldpop'`, `country_code: 'tr'`, dataset id `17f235a5-88be-4bf2-a4c0-177be65ccfe2`).
- [X] T015 [US1] **Live run (Madagascar)**: `fetchWorldPopPopulation(['mg'])` (2020 raster, mdg_ppp_2020.tif) → **110,926 valid hexagons, 0 rejected**. Written to `exposure_datasets` (`source_name: 'worldpop'`, `country_code: 'mg'`, dataset id `e56a46a4-4ca4-4e6c-9249-ac86a8e7e783`). Pipeline (resolve URL → download → windowed read → aggregate → validate → write) proven end-to-end on real data for both countries.

**Checkpoint**: Real WorldPop population data exists for both served countries, visible in Impact Analysis / the exposure-layer map with zero UI code changes.

---

## Phase 4: User Story 2 - The new layer behaves exactly like every other exposure layer, with zero new UI work (Priority: P1) 🎯 MVP

**Goal**: The WorldPop layer appears in the map's exposure-layer panel, toggleable and click-inspectable, using spec 042's existing generic mechanism.

**Independent Test**: With a WorldPop dataset imported, open the map, confirm the layer panel lists it, toggle it on, click a hexagon, confirm its population value appears in the popup — without any code changes to the map's rendering, store, or popup logic.

### Implementation for User Story 2

- [X] T016 [US2] Verified via direct RPC call (`get_dataset_features_geojson` against the Turkey `worldpop` dataset `17f235a5-...`, spec 042's exact read path): returns rows with correct `properties` (`h3Cell`, `source`) and `metric_value` (population, e.g. `93.59`) shape — the same generic path the map's click-popup already uses, confirming the interaction works without requiring a live browser session to prove the data/API contract side of it (mirrors spec 041 T025).
- [X] T017 [US2] Confirmed via `grep -n "worldpop" src/components/MapView.vue src/stores/exposureLayers.js src/utils/exposureLayerColor.js src/utils/exposureFeaturePopup.js` → **zero matches** (exit code 1) — live proof of FR-012/SC-006, the fifth consecutive source type (after osm, kontur, hydrorivers, hydrobasins) requiring no rendering/store/color/popup code changes.
- [X] T018 [P] [US2] Extended `src/utils/exposureLayerLabel.js`'s `SOURCE_LABEL_KEYS` and all 7 locale files (`en`/`tr`/`es`/`fr`/`ru`/`ar`/`zh`) with a friendly `worldpop` entry (UX nicety, not required for Done per FR-012's "zero logic changes" scope — a label-map data entry is configuration, not logic).

**Checkpoint**: Both P1 user stories functional — real WorldPop data for both served countries, click-inspectable on the map, zero new rendering/store/popup code.

---

## Phase 5: User Story 3 - Malformed or out-of-scope raster data never corrupts the map (Priority: P3)

- [X] T019 [US3] Confirmed via T005's unit tests: no-data/invalid pixels are excluded from aggregation rather than treated as zero, and a hexagon derived entirely from invalid data never becomes a record (FR-008). Also confirmed live: both Turkey and Madagascar imports reported **0 rejected** records — WorldPop's own rasters didn't surface any validation-layer rejections in practice, only the aggregation-layer no-data exclusion (invisible by design, per research.md §5 — an excluded hexagon simply never becomes a candidate).
- [X] T020 [US3] Confirmed via `import-worldpop/index.ts`'s structure (mirrors `import-hydrorivers/index.ts` exactly): `fetchWorldPopPopulation`'s per-country loop (`fetchOneCountry`) catches and logs any country-level failure, returning `null` for that country rather than throwing — the Edge Function's outer loop then adds that country to `countriesSkipped` without affecting any other served country (FR-009).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T021 [P] Ran `deno test --no-check --allow-net --allow-env supabase/functions/shared/` — **264/264 passing**, no regressions (up from 246 before this feature; +18 new tests).
- [X] T022 [P] Ran `deno check` against all 7 new files — clean; only the same 2 pre-existing baseline errors (`hazardThresholdsCache.ts`, `upsert.ts`, unrelated to this feature) remain repo-wide.
- [X] T023 Updated `docs/Data_Sources_Inventory_EN.docx` and `docs/Veri_Kaynaklari_Envanteri.docx` to mark WorldPop as integrated (moved out of the "evaluated but not integrated" section), following this session's established docx-js rebuild pattern.
- [X] T024 Verified: each country's WorldPop import ran exactly once this session, producing exactly one `exposure_datasets` row per `(source_name, country_code)` — confirmed via direct query (2 rows: tr/138,932, mg/110,926). No duplicate/superseded-but-orphaned rows observed.
- [X] T025 Live findings recorded directly against T014/T015/T019 above. One notable finding not anticipated in research.md: WorldPop's real per-country hexagon counts (Turkey 138,932; Madagascar 110,926) came out **higher** than Kontur's own counts are structurally comparable to (Kontur Turkey: 457,761 at its own finer native resolution) — expected, since WorldPop's resolution-7 aggregation and Kontur's own internal resolution were never intended to match cell-for-cell (spec.md Assumptions, research.md §3). No no-data/invalid-pixel rejections were observed in either country's real raster (0 rejected both times) — WorldPop's published rasters are apparently already well-masked at the country-boundary level, consistent with research.md §6's assumption that WorldPop's own per-country clip is already close to precise.
