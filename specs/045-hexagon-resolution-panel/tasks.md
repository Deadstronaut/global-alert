---

description: "Task list for feature 045: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control"
---

# Tasks: Sidebar Hazard-View Layout Rework + Manual Hexagon Resolution Control

**Input**: Design documents from `/specs/045-hexagon-resolution-panel/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Scope note**: Frontend-only (`src/components/SidebarPanel.vue`, `src/components/MapView.vue`,
`src/stores/ui.js`). No backend/database changes (FR-008).

**Tests**: No new `deno test` coverage (frontend UI/state change, no backend pure functions) —
verified via `eslint`/`npm run build` plus a live computational test (Node, running the exact
`hexWorker.js` algorithm against Turkey's real boundary geometry) for FR-009's resolution-range
decision.

**Organization**: Tasks are grouped by user story (US1-US2 from spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T001 Added `manualHexResolution` ref (`null` default) + `setManualHexResolution(value)` action to `src/stores/ui.js`, exported alongside existing `mapMode`.
- [X] T002 [P] Added `MIN_HEX_RES` / `MAX_HEX_RES` as module-level exported constants in `src/stores/ui.js` itself (single source of truth for both `SidebarPanel.vue`'s slider `min`/`max` and `MapView.vue`'s automatic-fallback clamp) — final values `3`/`6` after T012's live test (see below).

**Checkpoint**: `uiStore.manualHexResolution` available for both components to read/write.

---

## Phase 2: User Story 1 - Durum/ısı paired toggle, petek gets its own wide panel (Priority: P1) 🎯 MVP

**Goal**: Sidebar visually separates durum/ısı (compact pair) from petek (wide standalone panel
above Afet Ansiklopedisi), with zero change to the existing mutual-exclusion behavior.

**Independent Test**: Open the sidebar, confirm the new layout, confirm selecting any of the three
still hides the other two exactly as before.

### Implementation for User Story 1

- [X] T003 [US1] Reduced `.map-mode-selector` (`SidebarPanel.vue`, expanded sidebar) to 2 buttons (durum, ısı) — removed the petek `mode-btn`.
- [X] T004 [US1] Added a new full-width `.hex-panel` toggle button (styled to match `.sidebar-action-btn`/the "🌋 Afet Ansiklopedisi" nav-link's width), positioned directly above that nav-link, toggling `uiStore.mapMode = 'hexagon'` on click, `active` class bound to `uiStore.mapMode === 'hexagon'`.
- [X] T005 [P] [US1] Left the collapsed-sidebar icon toolbar unchanged — out of scope per research.md §1 (no room for a slider in an icon-only rail).
- [X] T006 [US1] Verified by construction: both the durum/ısı toggle and the new petek panel write the exact same `uiStore.mapMode` value the mutual-exclusion watcher (fixed earlier this session) already reacts to — no new coordination code, so no regression risk. `eslint`/`npm run build` both pass.

**Checkpoint**: Layout rework complete, behavior unchanged.

---

## Phase 3: User Story 2 - Manual hexagon resolution control (Priority: P1) 🎯 MVP

**Goal**: A slider inside the new petek panel lets the user manually pick the H3 resolution for
the selected country's hex grid, overriding the automatic zoom-based default until changed again.

**Independent Test**: Select a country, open petek, move the slider, confirm the grid re-renders
at the new resolution and stays there across zoom changes and durum/ısı ↔ petek toggles.

### Implementation for User Story 2

- [X] T007 [US2] Added the resolution `<input type="range">` inside the new `.hex-panel` (T004), `min`/`max` bound to `MIN_HEX_RES`/`MAX_HEX_RES` imported from `ui.js`, `@input` calling `uiStore.setManualHexResolution(Number($event.target.value))`, styled with a new `.hex-resolution-slider` class (same `width: 100%` + `accent-color` pattern as `MapView.vue`'s existing `.map-layer-opacity` sliders).
- [X] T008 [US2] Added `sidebar.hexResolution.label` i18n key (all 7 locales: en/tr/es/fr/ru/ar/zh) shown above the slider. Pre-existing hardcoded durum/petek/ısı button labels explicitly NOT retrofitted (plan.md's Constitution Check note — out of this feature's scope).
- [X] T009 [US2] `refreshCountryHexGridFromSelection()` now computes `uiStore.manualHexResolution ?? Math.min(currentHexRes.value, MAX_HEX_RES)`.
- [X] T010 [US2] `watch(currentHexRes, ...)`'s country-grid regeneration sub-block now guarded with `uiStore.manualHexResolution == null &&` — a zoom-bucket crossing no longer overrides a manually-set resolution (FR-005); the world/viewport mesh refresh (`updateHexbins()`) still runs unconditionally.
- [X] T011 [US2] Added `watch(() => uiStore.manualHexResolution, (value) => { if (value != null && uiStore.mapMode === 'hexagon') refreshCountryHexGridFromSelection() })` in `MapView.vue` for live slider-driven regeneration.
- [X] T012 [US2] **Live test performed** (Node, not a browser session — running `hexWorker.js`'s exact `polygonToCells(polyCoords, resolution + 1, 2)` call against Turkey's real `world-atlas` boundary geometry, the same source `_allCountryFeatures` uses):

  | Slider value | Actual H3 res (`+1`) | Cells | Compute time |
  |---|---|---|---|
  | 3 | 4 | 409 | 46ms |
  | 4 | 5 | 2,859 | 79ms |
  | 5 | 6 | 19,990 | 307ms |
  | 6 | 7 | 139,884 | 1,787ms |
  | 7 | 8 | 979,005 | 12,575ms |
  | 8 | 9 | 6,853,085 | 87,494ms |

  Slider values 7-8 are unusably slow/dense (12.5s-87s compute, ~1M-6.85M cells). Slider value 6
  (actual res 7, ~140K cells, ~1.8s) matches today's existing automatic maximum already live in
  production for Turkey — confirmed safe. **Decision: narrowed `MAX_HEX_RES` from 8 to 6** (the
  explicit fallback spec.md's FR-009 authorized), `MIN_HEX_RES` stays 3. research.md §4 updated
  with the full table.
- [X] T013 [US2] Verified by construction against quickstart.md §2: (a) default-matches-automatic — `manualHexResolution` stays `null` until the slider is touched, so `refreshCountryHexGridFromSelection()`'s `??` fallback is unchanged from before this feature; (b) persists across zoom — T010's guard prevents the zoom watcher from overriding a set value; (c) persists across durum/ısı ↔ petek toggles — `manualHexResolution` lives in `uiStore`, untouched by mode switches, and is re-applied via the existing mapMode watcher's `refreshCountryHexGridFromSelection()` call on re-entering `'hexagon'`; (d) inert with no country selected — `refreshCountryHexGridFromSelection()` no-ops when `selectedFeatureId == null`, so moving the slider has no visible effect, matching FR-007's edge case exactly. Live browser click-through not performed this session (same caveat as spec 044's T012/T016/T021).

**Checkpoint**: Both user stories functional — reworked layout, working manual resolution control with a live-tested range (H3-H6).

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T014 [P] Ran `eslint` on all modified files (`SidebarPanel.vue`, `MapView.vue`, `ui.js`) — clean.
- [X] T015 [P] Ran `npm run build` — succeeds.
- [X] T016 Confirmed no regression to the exposure-layer panel or the world/viewport background hex mesh — neither reads `uiStore.manualHexResolution` (grep-confirmed: only `MapView.vue`'s country-grid paths and `SidebarPanel.vue`'s slider reference it).
- [X] T017 Final live-test findings recorded directly against T012 above (table + decision), matching this session's established convention of keeping live-run outcomes with the task itself.
