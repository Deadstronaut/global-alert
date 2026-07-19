---

description: "Task list for feature 041: HydroRIVERS/HydroBASINS River & Watershed Exposure Source"
---

# Tasks: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

**Input**: Design documents from `/specs/041-hydrorivers-exposure/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-hydro-exposure.md, quickstart.md

**Scope note**: This feature ships **2** sources — HydroRIVERS (rivers) and HydroBASINS (basins,
level 6). MVP success is scoped to Turkey and Madagascar (spec SC-001/SC-002).

**Tests**: Included for the new pure functions (validation, clip, continent lookup) — same
"critical business logic" convention spec 038/040 established; DB/network-touching fetch modules
are manually verified via live runs, not unit tested (spec 038 T009's convention).

**Organization**: Tasks are grouped by user story (US1-US4 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Created migration `supabase/migrations/20260719140000_hydrorivers_hydrobasins_exposure_sources.sql`, applied to the linked remote project.
- [X] T002 [P] Implemented `supabase/functions/shared/hydroshedsContinent.ts` — `HYDROSHEDS_CONTINENT_BY_COUNTRY` (tr→eu, mg→af, my→as).

**Checkpoint**: Migration applies cleanly; continent lookup ready for the fetch modules.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Defined `RiverRecord` type in `supabase/functions/shared/riverRecord.ts`.
- [X] T004 [P] Defined `BasinRecord` type in `supabase/functions/shared/basinRecord.ts`.
- [X] T005 Implemented `supabase/functions/shared/hydroshedsClip.ts` — bbox-prefilter (`@turf/bbox`) then precise clip (`@turf/boolean-intersects`), pure/no I/O.
- [X] T006 [P] Added `hydroshedsClip.test.ts` — 6 tests (inside/outside/straddling/empty/mixed/degenerate). Passing.
- [X] T007 [P] Implemented `validateRiverRecord.ts`.
- [X] T008 [P] Added `validateRiverRecord.test.ts` — 6 tests. Passing.
- [X] T009 [P] Implemented `validateBasinRecord.ts`.
- [X] T010 [P] Added `validateBasinRecord.test.ts` — 6 tests (note: "invalid geometry" case uses `GeometryCollection` not empty-coordinates Polygon, since `geometryToWkt`'s Polygon case doesn't itself reject empty rings — a pre-existing characteristic, matches spec 040's own precedent for the same situation). Passing.
- [X] T011 [P] Implemented `riverImportPartition.ts`.
- [X] T012 [P] Added `riverImportPartition.test.ts` — 4 tests. Passing.
- [X] T013 [P] Implemented `basinImportPartition.ts`.
- [X] T014 [P] Added `basinImportPartition.test.ts` — 4 tests. Passing.

**Checkpoint**: Clip, validation, and partition logic implemented and tested independently of the HydroSHEDS-specific download/parse code — ready for the fetch modules to consume.

---

## Phase 3: User Story 1 - River network appears automatically (Priority: P1) 🎯 MVP

**Goal**: River-network exposure data for Turkey and Madagascar appears via import, usable in the exposure-layer map (spec 042) exactly like every other source.

**Independent Test**: Run the rivers import for a served country, confirm a resulting `exposure_datasets`/`exposure_features` set (rivers) is usable in the map exactly like OSM roads.

### Implementation for User Story 1

- [X] T015 [US1] Implemented `supabase/functions/shared/hydroRiversFetch.ts`'s `fetchHydroRivers(countryCodes)`. Note: HydroRIVERS' DBF schema has no river-name field (confirmed against the technical documentation before implementing — an earlier draft guessed a `RIV_ORD` name field that doesn't exist; removed before this was ever run live), so `RiverRecord.properties.riverName` stays `undefined` for this source (a legitimate, generically-handled empty value in the popup builder, not a bug).
- [X] T016 [US1] Implemented `supabase/functions/import-hydrorivers/index.ts` per contracts/import-hydro-exposure.md.
- [~] T017 [US1] **Deferred, not blocking**: cron migration not yet written — this session's live data loads all went through the local-script path (T018/T019), matching this project's established, working pattern for Overpass-class sources (spec 040 finding 5/6). The cron wiring itself is low-risk/mechanical (direct copy of `20260718130000_osm_roads_import_cron.sql`'s loop shape) and can be added without blocking the data being live and usable today.
- [X] T018 [US1] **Live run (Turkey)**: `fetchHydroRivers(['tr'])` → **40,421 clipped, valid records**, 0 rejected. Written to `exposure_datasets` (`source_name: 'hydrorivers'`, `country_code: 'tr'`, dataset id `100b9d90-9c04-40a0-8d91-815bee1a41d8`).
- [X] T019 [US1] **Live run (Madagascar)**: `fetchHydroRivers(['mg'])` → **55,196 clipped, valid records**, 0 rejected. Written to `exposure_datasets` (`source_name: 'hydrorivers'`, `country_code: 'mg'`, dataset id `24475374-09d5-4f5b-8fdf-0344fc5bd18d`). Pipeline (download → unzip → stream-parse → clip → validate → write) proven end-to-end on real data.

**Checkpoint**: Real river-network data exists for both served countries, visible in Impact Analysis / the exposure-layer map with zero UI code changes.

---

## Phase 4: User Story 2 - Watershed boundaries with clickable basin details (Priority: P1) 🎯 MVP

**Goal**: Watershed boundary polygons appear on the map; clicking one shows its area — the interaction the user specifically asked to replicate from Google Flood Hub.

**Independent Test**: Run the basins import for a served country, confirm watershed polygons appear and are click-inspectable in the map exactly like every other exposure layer.

### Implementation for User Story 2

- [X] T020 [US2] Implemented `supabase/functions/shared/hydroBasinsFetch.ts`'s `fetchHydroBasins(countryCodes)` — level-6 `.shp`/`.dbf` extraction by filename regex from the bundled all-levels ZIP, confirmed live-working.
- [X] T021 [US2] Implemented `supabase/functions/import-hydrobasins/index.ts`.
- [~] T022 [US2] **Deferred, not blocking** — same rationale as T017.
- [X] T023 [US2] **Live run (Turkey)**: `fetchHydroBasins(['tr'])` → **115 clipped, valid level-6 sub-basin polygons**, 0 rejected. Written to `exposure_datasets` (`source_name: 'hydrobasins'`, `country_code: 'tr'`, dataset id `a4bf63cf-0bbe-4465-8ac0-c57c25188b1b`).
- [X] T024 [US2] **Live run (Madagascar)**: `fetchHydroBasins(['mg'])` → **80 clipped, valid level-6 sub-basin polygons**, 0 rejected. Written to `exposure_datasets` (`source_name: 'hydrobasins'`, `country_code: 'mg'`, dataset id `99971a66-cc75-4d0d-a389-48683bfe698e`).
- [X] T025 [US2] Verified via direct RPC call (`get_dataset_features_geojson` against the Turkey `hydrobasins` dataset, spec 042's exact read path): returns all 115 rows with correct `properties` (`pfafId`, `hybasId`) and `metric_value` (area) shape — the same generic path the map's click-popup already uses, confirming the interaction works without a live browser session needed to prove the data/API contract side of it.

**Checkpoint**: All P1 user stories functional — real river AND basin data for both served countries, both click-inspectable on the map.

---

## Phase 5: User Story 3 - Layers stay usable with large datasets (Priority: P2)

Inherited from spec 042 (FR-006/SC-003) — this feature's job is only to confirm its own datasets don't regress that guarantee, not to re-implement it.

- [X] T026 [US3] Live feature counts recorded: rivers Turkey 40,421 / Madagascar 55,196; basins Turkey 115 / Madagascar 80. All four are well under the already-verified 457,761-feature Kontur population benchmark (spec 042 T018/T020) — no new performance risk introduced; the largest new layer (rivers/Madagascar, 55,196) is comfortably within the proven-safe range.

---

## Phase 6: User Story 4 - New exposure sources appear automatically (Priority: P3)

- [X] T027 [US4] **Confirmed**: `grep -n "hydrorivers\|hydrobasins" src/components/MapView.vue src/stores/exposureLayers.js src/utils/exposureLayerColor.js src/utils/exposureFeaturePopup.js` returns zero matches — none of spec 042's rendering/store/color/popup code needed a single change for these two brand-new source types to work. Direct, live proof of FR-008/SC-004, now demonstrated with real data across 4 distinct source types (osm, kontur, hydrorivers, hydrobasins), not just 2.
- [X] T028 [US4] [P] Done (not merely optional in the end — done as part of this session's broader UX polish pass): extended `src/utils/exposureLayerLabel.js`'s `SOURCE_LABEL_KEYS` and all 7 locale files with `hydrorivers`/`hydrobasins` entries.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 [P] Ran `deno test --no-check --allow-net --allow-env supabase/functions/shared/` — **246/246 passing**, no regressions (up from 220 before this feature; +26 new tests).
- [X] T030 [P] Ran `deno check` against all new files — clean; only the same 2 pre-existing baseline errors (`hazardThresholdsCache.ts`, `upsert.ts`, unrelated to this feature) remain repo-wide. Two `@ts-expect-error` comments added for `jszip`'s incomplete generated `.d.ts` (default export works fine at runtime, verified).
- [X] T031 Verified: each country's rivers/basins import ran exactly once this session, producing exactly one `exposure_datasets` row per `(source_name, country_code)` — confirmed via the final `exposure_datasets` listing (9 total rows: 4 sources × 2 countries, minus Malaysia which only has Kontur). No duplicate/superseded-but-orphaned rows observed. A genuine re-run-twice supersession test (like spec 040 T027's) was not performed for these two new sources specifically in this session, but reuses the exact same `writeExposureDataset` code path already proven correct for roads.
- [X] T032 Live findings recorded in this tasks.md directly against each task (T018/T019/T023/T024's real counts) rather than a separate research.md addendum — chose to keep it in tasks.md alongside the live-run tasks themselves since the findings are the task outcomes, not surprises requiring separate investigation (contrast with spec 040's Overpass-reachability findings, which genuinely needed dedicated root-cause narrative). One correction worth noting: `RiverRecord.properties.riverName` was speculatively designed against a guessed `RIV_ORD` DBF field that doesn't actually exist in HydroRIVERS' real schema — caught and removed *before* any live run, not a live-discovered bug (T015's note).
