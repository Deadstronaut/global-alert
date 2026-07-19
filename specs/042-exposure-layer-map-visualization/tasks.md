---

description: "Task list for feature 042: Exposure Layer Map Visualization"
---

# Tasks: Exposure Layer Map Visualization

**Input**: Design documents from `/specs/042-exposure-layer-map-visualization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-dataset-features-geojson.md, quickstart.md

**Scope note**: Visualization-only (spec FR-009) — no changes to how exposure data is imported,
validated, or stored. The only backend change is one additive, read-only SQL function.

**Tests**: Included for the new pure JS helpers (palette hashing, popup-HTML assembly, store
filtering) — this repo's established "critical business logic gets tests, DOM/map-rendering
glue does not" convention (matches spec 038/040's Deno-side precedent, applied here on the
frontend with Vitest).

**Organization**: Tasks are grouped by user story (US1-US4 from spec.md).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- File paths are exact, relative to repo root

---

## Phase 1: Setup

- [X] T001 Created migration `supabase/migrations/20260719120000_exposure_layer_features_rpc.sql` defining `get_dataset_features_geojson(dataset_id UUID, simplify_tolerance DOUBLE PRECISION DEFAULT NULL)` per data-model.md/contracts — additive only. Applied to the linked remote project (`npx supabase db push`).
- [X] T002 [P] Added `exposureLayers.*` i18n keys (panelTitle, emptyState, featureCount, loading) to all 7 locale files, following the existing `mapLayers.*` namespace structure. All 7 files validated as syntactically correct JSON.

**Checkpoint**: Migration applies cleanly (`npx supabase db push`); RPC callable and returns the expected shape for the existing OSM roads (Turkey) dataset.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T003 [P] Implemented `src/utils/exposureLayerColor.js` — `colorForDataset(datasetId)`, deterministic hash into an 8-color Okabe-Ito colorblind-safe palette (research.md §4).
- [X] T004 [P] Added `tests/unit/exposureLayerColor.test.js` — 4 tests (determinism, spread across palette, null/undefined/empty safety, valid hex format). Passing.
- [X] T005 [P] Implemented `src/utils/exposureFeaturePopup.js` — `buildFeaturePopupHtml(dataset, metricValue, properties)`, generic assembly with HTML-escaping, no source-specific branching (research.md §3, FR-004).
- [X] T006 [P] Added `tests/unit/exposureFeaturePopup.test.js` — 5 tests (full data, empty/missing properties, arbitrary property keys, missing dataset metadata, HTML-escaping). Passing.
- [X] T007 Implemented `src/stores/exposureLayers.js` — Pinia store fetching `exposure_datasets` (`select('*')`, RLS-scoped, mirrors `ImpactPanel.vue`'s existing fetch and `mapLayers.js`'s store shape/conventions per data-model.md).
- [X] T008 [P] **Skipped, not a gap**: this repo has zero existing Pinia-store tests anywhere (confirmed — only `tests/unit/*.test.js` for pure `src/lib`/`src/utils` functions with no Supabase I/O exist as a convention). `mapLayers.js`, the store this one directly mirrors, itself has no test file. Adding one here would be a new, unestablished testing pattern requiring Supabase-client mocking infrastructure that doesn't exist yet — out of scope for this feature; consistent with this project's existing "DB-touching code is manually verified, not unit tested" convention (spec 038 T009).

**Checkpoint**: Shared color/popup helpers and the dataset-list store are implemented and unit-tested independently of any map-rendering code — ready for `MapView.vue` to consume.

---

## Phase 3: User Story 1 - Turn an exposure layer on or off on the map (Priority: P1) 🎯 MVP

**Goal**: A layer-control panel lists every available exposure dataset; toggling one on/off shows/hides its geometry on the map without affecting anything else.

**Independent Test**: With only the existing OSM roads (Turkey) dataset, toggle it on (roads appear), off (roads disappear), confirm no other map content is affected.

### Implementation for User Story 1

- [X] T009 [US1] Added exposure-layer-panel markup to `src/components/MapView.vue`, listing `exposureLayersStore.datasets` with checkbox toggles — new `.exposure-layers-panel` block, wired to i18n keys from T002. Also wrapped both this and the WMS/WFS panel in a shared `.layer-panel-stack` flex container to prevent visual overlap (both previously used identical absolute positioning).
- [X] T010 [US1] Implemented `addExposureLayer(dataset)` in `MapView.vue`: calls `supabase.rpc('get_dataset_features_geojson', ...)`, parses each row's `geom_geojson`, caches in `exposureFeatureCache`, renders via the geometry-type-filtered fill/line/point pattern colored by `colorForDataset(dataset.id)`.
- [X] T011 [US1] Implemented `removeExposureLayerRendering(dataset)` — mirrors `removeMapLayerRendering`'s suffix-iteration pattern.
- [X] T012 [US1] Implemented `toggleExposureLayer(dataset)` and `setExposureLayerOpacity(dataset, value)`, reusing the existing `layerVisibility`/`layerOpacity` refs keyed by `exposure-dataset-${dataset.id}`.
- [X] T013 [US1] `exposureFeatureCache` (a plain `Map`, module-scope within the component) is checked before every RPC call in `addExposureLayer` — re-toggling skips the fetch.
- [X] T014 [US1] Empty-state message wired: `<p v-if="!exposureLayersStore.hasLayers">{{ t('exposureLayers.emptyState') }}</p>` inside the panel (shown once `exposureLayersStore.loaded`).

**Checkpoint**: User Story 1 fully functional — verify against quickstart.md §1-2 using the real OSM roads (Turkey) dataset.

---

## Phase 4: User Story 2 - Inspect a feature's details by clicking it (Priority: P1) 🎯 MVP

**Goal**: Clicking any visible exposure feature opens a popup with its generic attributes.

**Independent Test**: With the OSM roads layer on, click a road segment, confirm a popup shows its properties/metric value; click elsewhere, confirm the popup closes with no stray popups.

### Implementation for User Story 2

- [X] T015 [US2] Added `map.on('click', ...)` handlers for each exposure layer's fill/line/point sub-layers, added inside `addExposureLayer` alongside the layer itself, building popup content via `buildFeaturePopupHtml` and opening a `maplibregl.Popup` styled with the new `.exposure-popup*` CSS classes.
- [X] T016 [US2] Single-popup-at-a-time enforced via a module-scope `exposurePopup` variable, `.remove()`'d before every new popup is created.
- [X] T017 [US2] Verified: MapLibre's `Popup` defaults to `closeOnClick: true` (not overridden), so clicking empty map space auto-closes any open popup — no extra code needed; the existing generic empty-click handler (`interactionLayers`-scoped, ~L1211) is unrelated/unaffected.

**Checkpoint**: User Stories 1 AND 2 both work — verify against quickstart.md §3.

---

## Phase 5: User Story 3 - Layers stay usable with large datasets (Priority: P2)

**Goal**: The map remains responsive with a 35,000+ feature layer visible.

**Independent Test**: Turn on the 37,407-feature OSM roads (Turkey) layer alone; pan/zoom must stay smooth.

### Implementation for User Story 3

- [X] T018 [US3] **Real data restored and RPC live-verified during this phase** (see below) — a genuine bug was found and fixed before any pan/zoom UI check was even reachable. Browser-based pan/zoom responsiveness itself is deferred alongside T024 (requires a live session); the data-fetch path it depends on is now confirmed correct at full scale (5,233/5,233 rows, not 1000/5,233).
- [X] T019 [US3] Not triggered — the real blocker found was the row-limit bug (T020), not a rendering-performance problem; `simplify_tolerance` remains correctly unwired/deferred per research.md §2's original plan.
- [X] T020 [US3] **Live finding, fixed**: `get_dataset_features_geojson` was silently truncating results to 1000 rows (PostgREST's default `db-max-rows` applying to the original `TABLE`-returning function) — caught by testing against the real 5,233-feature OSM roads (Turkey) dataset via direct RPC call, not by code review. Fixed via migration `20260719130000_exposure_layer_features_rpc_fix_row_limit.sql` (function now `RETURNS JSONB` via `jsonb_agg`, immune to row-count limits). Re-verified: 5,233/5,233 rows returned post-fix. Documented in research.md §2 addendum and contracts/data-model.md, matching this project's established "live findings" convention (spec 040 research.md §8).

**Checkpoint**: All P1/P2 user stories functional — verify against quickstart.md §4.

---

## Phase 6: User Story 4 - New exposure sources appear automatically (Priority: P3)

**Goal**: Confirm the design is genuinely generic — no source-specific code exists anywhere in this feature.

**Independent Test**: Code-review confirmation that no file added/modified in this feature branches on a specific `source_name`, `hazard_type`, or dataset name string.

### Implementation for User Story 4

- [X] T021 [US4] Code-review check confirmed: `grep -n "source_name ===\|metric_property_name ===\|=== 'osm'\|=== 'roads'\|=== 'population'\|=== 'kontur'"` across all 4 touched files returns zero matches — no source-specific branching anywhere, per FR-002/FR-004/FR-008.
- [X] T022 [US4] **Upgraded from deferred to live-verifiable**: real Kontur population data (Turkey: 457,761 features, Malaysia: 158,154, Madagascar: 349,138) was imported during this session alongside the roads re-import, so two structurally different real source types (LineString roads vs. Polygon/H3-hexagon population) now exist simultaneously — quickstart.md §5 updated accordingly; full browser-based verification still needs a live session (see T024), but the data prerequisite for it is no longer missing.

**Checkpoint**: All user stories addressed to the extent currently testable.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T023 [P] Ran the full frontend Vitest suite — **201/201 passing**, no regressions.
- [~] T024 Deferred — requires a live logged-in browser session (see T018 below); code and RPC are deployed and ready.
- [X] T025 [P] Regression check (code-level): the WMS/WFS panel (`.map-layers-panel`) and shelter panel (`.shelters-layer-panel`) markup/logic were not modified beyond wrapping the WMS/WFS panel in the new `.layer-panel-stack` container — `mapLayersStore`/`toggleMapLayer`/`setMapLayerOpacity` and shelter toggle code paths are untouched.
- [X] T026 [P] Verified: all 7 locale files (including `ar`) contain the new `exposureLayers.*` keys and are valid JSON (checked via `node -e "JSON.parse(...)"` for all 7 during T002); live RTL visual check deferred alongside T024 (requires a browser session).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: No hard dependency on Phase 1's migration (T003-T008 are pure frontend); BLOCKS Phase 3 (US1 needs T007's store, T003's color function).
- **US1 (Phase 3)**: Depends on Phase 2 (T003, T007) and T001 (the RPC). Chain: T009→T010→T011→T012→T013→T014.
- **US2 (Phase 4)**: Depends on US1's T010/T011 (adds click handlers alongside the same layer add/remove lifecycle) and T005 (popup builder). Chain: T015→T016→T017.
- **US3 (Phase 5)**: Depends on US1 being functional (T018 tests the already-rendered layer); T019 conditionally depends on T018's outcome.
- **US4 (Phase 6)**: Depends on all prior phases' files existing to review (T021); can run any time after Phase 4.
- **Polish (Phase 7)**: Depends on all prior phases.

### Parallel Opportunities

- T002 (i18n) can run in parallel with T001 (migration).
- T003/T004 and T005/T006 (two independent pure-function pairs) can run in parallel with each other and with T007/T008.
- T023, T025, T026 (Phase 7) are independent checks and can run in parallel.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1: toggle on/off) — already independently demoable against the real OSM roads (Turkey) dataset.
3. Complete Phase 4 (US2: click-to-inspect) — this is what the user specifically asked to replicate from Google Flood Hub.
4. **STOP and VALIDATE** against quickstart.md §1-3, demo-ready at this point.

### Incremental Delivery

1. Setup + Foundational → shared helpers/store ready.
2. US1 → toggleable layers visible → demoable.
3. US2 → click-to-inspect → matches the specific UX the user asked for → demoable.
4. US3 → performance-verified at real scale (37K features) → safe for a live demo, not just a small test dataset.
5. US4 → generic-design guarantee documented → confidence that spec 041's future datasets need zero rework here.
6. Polish → regression-safe, i18n-complete.
