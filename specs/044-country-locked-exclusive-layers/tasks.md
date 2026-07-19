---

description: "Task list for feature 044: Country-Locked Map View with Mutually Exclusive Hexagon Layers"
---

# Tasks: Country-Locked Map View with Mutually Exclusive Hexagon Layers

**Input**: Design documents from `/specs/044-country-locked-exclusive-layers/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Scope note**: Frontend map-interaction coordination only (`src/components/MapView.vue`,
`src/stores/auth.js`) plus one nullable DB column. No backend fetch/aggregation pipeline changes
(specs 038/040/041/043 unaffected, FR-011).

**Tests**: No new `deno test` unit coverage — this feature is Vue component interaction logic with
no existing frontend test harness to extend (plan.md's Testing section, Constitution Principle
VIII); verification is manual/live per quickstart.md, mirroring how MapView.vue's other
interaction features (spec 042's layer panel) were verified.

**Organization**: Tasks are grouped by user story (US1-US3 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Created migration `supabase/migrations/20260719160000_country_boundaries_default_zoom.sql` — nullable `default_zoom numeric` column on `country_boundaries` per data-model.md, applied via `supabase db push`.

**Checkpoint**: Migration applies cleanly; column ready for admin configuration and frontend reads.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 Added `isCountryLocked` computed to `src/stores/auth.js` (`countryCode.value != null && !isSuperAdmin.value`, research.md §1) — exported alongside the existing `countryCode`/`isSuperAdmin` getters.

**Checkpoint**: `authStore.isCountryLocked` available for MapView.vue to consume.

---

## Phase 3: User Story 1 - Country-locked camera on open (Priority: P1) 🎯 MVP

**Goal**: A country-locked user's map opens already framed on their own country at a sensible
default zoom, with no manual navigation required.

**Independent Test**: Log in as a country-locked test account, open the map, confirm the initial
camera is already fitted to that country's bounds at its configured (or fallback) zoom.

### Implementation for User Story 1

- [X] T003 [US1] Implemented `applyCountryLockedCamera()` in `src/components/MapView.vue` (called from `map.on('load', ...)` right after `setupMapInteractions()`): if `auth.isCountryLocked`, finds the matching `_allCountryFeatures` entry for `auth.countryCode` via `numericToAlpha2`, computes its bounds, and either `map.flyTo({ center, zoom: default_zoom })` or falls back to a `cameraForBounds` fit — no-op otherwise (FR-001/FR-003/FR-006).
- [X] T004 [P] [US1] Implemented as a small dedicated `supabase.from('country_boundaries').select('default_zoom')` query inside `applyCountryLockedCamera()` itself, rather than piggybacking on `_allCountryFeatures`'s world-atlas topojson data (which is unrelated to the `country_boundaries` DB table — different data source entirely, discovered during implementation). One extra lightweight query per country-locked session mount is negligible; simpler than threading `default_zoom` through the topojson pipeline.
- [X] T005 [US1] Confirmed: `applyCountryLockedCamera()` returns early when `auth.isCountryLocked` is false — anon/global sessions keep the existing `center: [30, 20]` world-view mount behavior untouched (FR-006).

**Checkpoint**: Country-locked sessions open framed on their own country; anon sessions unchanged.

---

## Phase 4: User Story 2 - No cross-country navigation for a locked user (Priority: P1) 🎯 MVP

**Goal**: A country-locked user cannot double-click-navigate to another country's data; normal
zoom/pan still works.

**Independent Test**: As a country-locked user, double-click a different country; confirm no
camera navigation or data selection occurs, and confirm normal zoom/pan still functions.

### Implementation for User Story 2

- [X] T006 [US2] Wrapped the cross-country `map.on('dblclick', interactionLayers, ...)` registration in `setupMapInteractions()` with `if (!auth.isCountryLocked) { ... }` (research.md §5's "conditional registration, not a runtime guard" decision) — the fallback empty-area double-click-to-zoom-in handler remains registered unconditionally (not cross-country navigation).
- [X] T007 [US2] Confirmed: normal zoom in/out and pan (mouse wheel, drag, `NavigationControl`) are untouched by T006 — they are not part of the `interactionLayers` dblclick handler and required no code change (FR-005).

**Checkpoint**: Both P1 user stories functional — locked users see only their own country, with no way to navigate elsewhere, while retaining normal zoom/pan.

---

## Phase 5: User Story 3 - Hazard hex vs. exposure layer mutual exclusion (Priority: P1) 🎯 MVP

**Goal**: Only one of {hazard-event hexagon grid, exposure-layer panel} is ever visible at once;
switching between them takes exactly one user action.

**Independent Test**: Select a country (hazard hex visible), toggle on an exposure layer, confirm
the hazard hex disappears; toggle on a second exposure layer, confirm both remain visible
together; re-select the country, confirm all exposure layers hide and the hazard hex reappears.

### Implementation for User Story 3

- [X] T008 [US3] Added `hideAllExposureLayers()` helper (iterates `exposureLayersStore.datasets`, removes rendering + clears `layerVisibility` for any currently-visible one) and call it from `selectCountry()` immediately before `uiStore.mapMode = 'hexagon'` is set (FR-009).
- [X] T009 [US3] Added `hideHazardHexGrid()` helper (sets `uiStore.mapMode = 'normal'` and clears the `'country-hex-grid'` source data, without calling the full `clearCountrySelection()` — country context/badge/bounds preserved) and call it from `toggleExposureLayer()` when a dataset is being turned ON (FR-008). Also guarded the hex-worker's `FILL_GRID` response handler on `uiStore.mapMode === 'hexagon'` to prevent an in-flight hazard-grid request from resurrecting the grid after a race-condition switch to an exposure layer.
- [X] T010 [P] [US3] Confirmed by construction: `hideAllExposureLayers()` is only called from `selectCountry()`, never from `toggleExposureLayer()` — toggling a second exposure dataset on does not touch the first (FR-010 preserved).

**Checkpoint**: All three P1 user stories functional — country-locked camera, no cross-country navigation, and mutually-exclusive hexagon layers all working together.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T011 N/A — no new user-facing UI text was added; this feature is behavior-only (camera framing, interaction gating, layer-visibility coordination), no new strings requiring i18n (Constitution Principle VI).
- [~] T012 **Not performed this session** — quickstart.md's full walkthrough requires a live browser session with a real country-locked test account (Turkey/Madagascar) and an anon session for regression comparison, which was not run. `npm run build` and `eslint` both pass clean (verified), confirming the code compiles and lints correctly, but this does **not** substitute for live UI verification — flagged explicitly per this session's own standing practice of not claiming UI success without actually testing it in a browser. Recommended as the next concrete step before considering this feature fully done.
- [X] T013 Confirmed via `git diff --stat supabase/functions/` — zero files changed under `supabase/functions/` by this feature; all changes are confined to `src/components/MapView.vue`, `src/stores/auth.js`, and one additive migration (FR-011).
