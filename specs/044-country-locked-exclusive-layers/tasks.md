---

description: "Task list for feature 044: Country-Locked Map View"
---

# Tasks: Country-Locked Map View

**Input**: Design documents from `/specs/044-country-locked-exclusive-layers/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Note (2026-07-19)**: Phase 5 (User Story 3, hazard-hex/exposure-layer mutual exclusion) was
implemented, then explicitly reverted at the user's request after live review — see spec.md's
Note. Its tasks are kept below marked `[R]` (reverted) for the historical record rather than
deleted, per this project's general preference for a visible trail over silently rewriting
history.

**Scope note**: Frontend map-interaction change only (`src/components/MapView.vue`,
`src/stores/auth.js`) plus one nullable DB column. No backend fetch/aggregation pipeline changes
(specs 038/040/041/043 unaffected, FR-007). The hazard-event hex grid and exposure-layer panel
are explicitly left uncoordinated — see Phase 5's reversion note.

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

## Phase 5: User Story 3 - Hazard hex vs. exposure layer mutual exclusion — **REVERTED**

**Original goal**: Only one of {hazard-event hexagon grid, exposure-layer panel} would ever be
visible at once. **This entire user story was reverted** after live review — the user clarified
the actual desired behavior is the opposite: both must remain simultaneously visible so an
exposure layer's correlation with the active hazard view can be seen. See spec.md's Note and
plan.md's Complexity Tracking "Reverted" table for full context.

- [R] T008 [US3] ~~Added `hideAllExposureLayers()` helper, called from `selectCountry()`.~~ **Reverted**: helper deleted, call site removed.
- [R] T009 [US3] ~~Added `hideHazardHexGrid()` helper, called from `toggleExposureLayer()`; guarded the hex-worker's `FILL_GRID` response handler on `mapMode === 'hexagon'`.~~ **Reverted**: helper deleted, call site removed, `FILL_GRID` handler restored to its original unconditional form (the guard existed only to protect the now-removed coordination logic).
- [R] T010 [US3] ~~Confirmed multi-select amongst exposure datasets was preserved under the mutual-exclusion design.~~ **Moot**: with the mutual-exclusion logic removed entirely, exposure datasets and the hazard hex grid are both simply independent again, exactly as before this feature.

**Checkpoint**: `src/components/MapView.vue` verified (via `grep`) to contain no remaining references to `hideAllExposureLayers`/`hideHazardHexGrid` — only the surviving US1/US2 code (`applyCountryLockedCamera`, conditional dblclick registration) remains tagged "spec 044".

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T011 N/A — no new user-facing UI text was added; this feature is behavior-only (camera framing, interaction gating, layer-visibility coordination), no new strings requiring i18n (Constitution Principle VI).
- [~] T012 **Not performed this session** — quickstart.md's full walkthrough requires a live browser session with a real country-locked test account (Turkey/Madagascar) and an anon session for regression comparison, which was not run. `npm run build` and `eslint` both pass clean (verified), confirming the code compiles and lints correctly, but this does **not** substitute for live UI verification — flagged explicitly per this session's own standing practice of not claiming UI success without actually testing it in a browser. Recommended as the next concrete step before considering this feature fully done.
- [X] T013 Confirmed via `git diff --stat supabase/functions/` — zero files changed under `supabase/functions/` by this feature; all changes are confined to `src/components/MapView.vue`, `src/stores/auth.js`, and one additive migration (FR-011).

---

## Phase 7: Live-review bug fix — durum/petek/ısı left-menu switching didn't hide the selected country's hex grid

**Found**: 2026-07-19, via a screenshot from the user showing a selected country with "ısı"
(heatmap) mode active on the left-side menu (`SidebarPanel.vue`'s durum/petek/ısı buttons,
`uiStore.mapMode = 'normal'|'hexagon'|'heatmap'`) — the previously-populated `country-hex-grid`
layer was still fully visible underneath the heatmap and the exposure-layer panel's watershed
layer, instead of being hidden. Root cause: `selectCountry()` populates `country-hex-grid` via the
hex worker, but only `clearCountrySelection()` ever cleared it — switching `uiStore.mapMode` via
the left-side menu (independent of country selection/deselection) never touched that source, so
once populated it persisted regardless of mode.

- [X] T014 Added `refreshCountryHexGridFromSelection()` (extracted from `selectCountry()`'s
  inline hex-worker `FILL_GRID` trigger) so the same regeneration logic can be reused.
- [X] T015 Updated the `watch(() => uiStore.mapMode, ...)` handler: when the mode becomes
  `'hexagon'`, regenerate the selected country's hex grid; otherwise (durum/`'normal'` or
  ısı/`'heatmap'`), clear the `country-hex-grid` source data. This makes durum/petek/ısı properly
  mutually exclusive for the per-country hex grid, matching the user's clarified scenario: select
  a country → petek opens by default (fit-to-country camera, existing behavior unchanged) → switch
  to durum or ısı → petek disappears, replaced by that mode's own view → the exposure-layer panel
  (right side) remains completely independent throughout, exactly as confirmed in this spec's
  earlier revision.
- [X] T016 Verified `eslint` clean and `npm run build` succeeds after the fix. Live browser
  verification not performed this session (same caveat as T012).
