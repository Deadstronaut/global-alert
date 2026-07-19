---

description: "Task list for feature 046: Population Hexagon Labels + Province-Level Population View"
---

# Tasks: Population Hexagon Labels + Province-Level Population View

**Input**: Design documents from `/specs/046-population-hex-labels-provinces/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Scope note**: Frontend-only (`src/components/MapView.vue`, new `src/utils/formatPopulationLabel.js`,
new `src/utils/provincePopulationAggregation.js`). No backend/database changes (FR-009).

**Tests**: New Vitest unit tests for the two new pure utility modules (large-number label
formatting, point-in-polygon province aggregation) — both are plain functions with no DOM/map
dependency, so unit-testable in isolation. No live browser click-through performed during
planning (no browser automation tool in this environment) — flagged per task below, matching
specs 044/045's convention.

**Organization**: Tasks are grouped by user story (US1-US2 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T001 Create `src/utils/formatPopulationLabel.js` — pure function `formatPopulationLabel(value)` returning an abbreviated string (`"482K"`, `"1.2M"`, plain number below 1000), handling `null`/`undefined`/`NaN` by returning an empty string (no label rendered for missing data, per Edge Cases).
- [ ] T002 [P] Create `src/utils/provincePopulationAggregation.js` — exports `aggregatePopulationByProvince(populationFeatures, provinceFeatureCollection, nameProperty)`: for each province feature, sums `properties.__metricValue` of every population feature whose centroid (average-of-ring-vertices, matching `populationCellAggregation.ts`'s server-side convention) falls inside it via a small hand-written ray-casting point-in-polygon check; returns a new `FeatureCollection` with each province's geometry plus an injected `totalPopulation` property.
- [ ] T003 [P] Unit tests for `formatPopulationLabel.js` in `src/utils/formatPopulationLabel.test.js` — covers <1000 (plain number), thousands, millions, zero, and null/undefined/NaN input.
- [ ] T004 [P] Unit tests for `provincePopulationAggregation.js` in `src/utils/provincePopulationAggregation.test.js` — covers a point clearly inside one province, a point outside all provinces (excluded, no error), multiple points summing correctly into the same province, and an empty population-features input returning zero totals for every province (not an error).

**Checkpoint**: Both utilities available, independently tested, ready for `MapView.vue` to consume.

---

## Phase 2: User Story 1 - Hexagon population labels (Priority: P1) 🎯 MVP

**Goal**: Population hexagons show their aggregated value as on-map text once large enough to
read, exclusively for population-sourced exposure layers.

**Independent Test**: Toggle a population exposure layer on, zoom in until hexagons are large,
confirm labels appear; confirm they never appear for the hazard-status hex grid or non-population
exposure layers.

### Implementation for User Story 1

- [ ] T005 [US1] In `addExposureLayer()` (`MapView.vue`), when building the `FeatureCollection`, add `properties.__populationLabel = formatPopulationLabel(row.metric_value)` to every feature of a dataset where `isPopulationSource(dataset.source_name)` is true (existing helper from `exposureLayerColor.js`) — no-op (property omitted) for non-population datasets.
- [ ] T006 [US1] Add a new `symbol` MapLibre layer (`${sourceId}-label`) in `addExposureLayer()`, added only when `isPopulationSource(dataset.source_name)` is true, with `layout: { 'text-field': ['get', '__populationLabel'], 'text-size': ... }` and a `minzoom` (or equivalent zoom-gated visibility) tuned so labels only render once cells are legible — reuse the same zoom/resolution signal `currentHexRes`/`currentZoom` already uses (research.md §2), do not introduce a new independent threshold constant if an existing one fits.
- [ ] T007 [US1] Add the new `-label` suffix to `EXPOSURE_SUB_LAYER_SUFFIXES` cleanup in `removeExposureLayerRendering()` so toggling a population layer off removes its label layer along with fill/line/point (no orphaned layer left behind).
- [ ] T008 [US1] Verify by construction that hazard-status ("durum") hexagons are unaffected — that grid renders through the entirely separate `country-hex-grid` source/layer, never touched by `addExposureLayer()`; confirm no shared layer ID or property name collision was introduced.
- [ ] T009 [US1] Run `eslint`/`npm run build`; run the new Phase 1 unit tests. Live browser verification not performed this session (no browser automation tool available) — document this explicitly here, matching specs 044/045's convention.

**Checkpoint**: Population hexagons show/hide readable labels correctly; everything else unchanged.

---

## Phase 3: User Story 2 - Province-level population view (Priority: P2)

**Goal**: A per-dataset toggle switches a population layer's rendering from hexagons to
province-shaded choropleth, reusing existing province boundary data and the existing population
color ramp; gracefully unavailable for a country with no boundary data.

**Independent Test**: For Turkey, toggle province view on a population layer and confirm
per-province shading + click popup; for Madagascar, confirm the toggle is disabled/hidden with no
error.

### Implementation for User Story 2

- [ ] T010 [US2] Add a `populationViewMode` piece of component-local state in `MapView.vue` (keyed by dataset id — e.g. a `ref({})` map, matching the existing `layerVisibility`/`layerOpacity` pattern), defaulting to `'hexagon'`.
- [ ] T011 [US2] Add a small toggle control (icon button or two-state switch) to the exposure-layer panel row for population datasets only (`isPopulationSource(dataset.source_name)`), calling `loadRegionBoundaries(dataset.country_code)` (from `src/data/boundaries/index.js`) to check availability; if it resolves to `null`, render the toggle disabled (not hidden entirely, so its absence is explainable via a tooltip/title) rather than throwing (FR-007).
- [ ] T012 [US2] When province view is switched on for a dataset: call `loadRegionBoundaries()`, then `aggregatePopulationByProvince()` (T002) against that dataset's already-cached `exposureFeatureCache` entry (no new fetch), then render the resulting `FeatureCollection` as a new MapLibre fill layer using `populationFillExpression()` (existing, from `exposureLayerColor.js`) scaled to this collection's own min/max — hide (do not remove) the dataset's existing hexagon fill/line/label layers while province view is active.
- [ ] T013 [US2] Add click handling on the province fill layer showing a popup with the province's name (`nameProperty` from `loadRegionBoundaries()`) and `totalPopulation`, reusing `buildFeaturePopupHtml`'s pattern or a small dedicated template consistent with it.
- [ ] T014 [US2] When province view is switched off, remove the province layer/source and restore the dataset's hexagon layers to their pre-toggle visibility — verify no lost opacity/toggle state for this or any other layer (FR-008).
- [ ] T015 [US2] Add i18n keys for the province-view toggle label and the disabled/no-data tooltip text across all 7 locales (en/tr/es/fr/ru/ar/zh), per Constitution Principle VI.
- [ ] T016 [US2] Live-test (Node script, mirroring spec 045's methodology) `aggregatePopulationByProvince()` against Turkey's real `tr-provinces.json` and a real (or representative-sized) population `FeatureCollection` to confirm the point-in-polygon pass completes within an interactive budget (research.md §4's complexity bound) — record actual timing in research.md; only add a spatial-index optimization if this live test shows it's actually needed, not preemptively.
- [ ] T017 [US2] Run `eslint`/`npm run build`. Live browser verification not performed this session — document explicitly.

**Checkpoint**: Both user stories functional — hexagon labels (P1) and province view (P2), both scoped to population sources only, both degrading gracefully where data is unavailable.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T018 [P] Confirm no regression to the existing exposure-layer panel's country filtering (spec 044 Phase 8) or the manual hex-resolution slider (spec 045) — neither reads or is read by the new `populationViewMode` state.
- [ ] T019 [P] Confirm removing/re-adding a population dataset (toggle off then on) cleans up correctly regardless of which view mode (`hexagon`/`province`) was last active — no stale layer left on the map.
- [ ] T020 Update this tasks.md with final live-test findings (T016) and any resolution/threshold values tuned during implementation (T006's zoom-gating choice), matching this session's established convention of recording live-run outcomes directly against the task.

---

## Dependencies & Execution Order

- Phase 1 (T001-T004) blocks both user story phases — both stories consume `formatPopulationLabel`/`provincePopulationAggregation`... actually US1 only needs T001/T003 (label formatting); US2 only needs T002/T004 (province aggregation). They may proceed in parallel once Phase 1 completes.
- User Story 1 (P1) is independently shippable as the MVP without User Story 2.
- User Story 2 (P2) depends only on Phase 1's `provincePopulationAggregation.js`, not on User Story 1's label layer — could be built first if reprioritized, but ships second per spec.md's stated priority.

## Parallel Example

```
T001 and T002 can run in parallel (different files, no shared state).
T003 and T004 can run in parallel once their respective source files (T001/T002) exist.
Within Phase 2, T005 → T006 → T007 are sequential (same function/file, building on each other).
Within Phase 3, T010 → T011 → T012 → T013 → T014 are sequential (same state/rendering path);
T015 (i18n) and T016 (live test) can run in parallel with each other once T012 exists.
```
