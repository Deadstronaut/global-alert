---

description: "Task list for Forecast Map Display"

---

# Tasks: Forecast Map Display

**Input**: Design documents from `specs/056-forecast-map-display/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/forecast-layer-data-contract.md, quickstart.md

**Tests**: Not a constitution test-first zone (dedup/severity/CAP/proximity only) — this list
follows the existing `windLayerData.test.js` convention: unit tests for pure helpers, manual
`run`-skill/browser verification for MapLibre rendering (no existing precedent tests the
Height/Overlay watchers either).

**Organization**: Single user story (spec.md has only one, P1) — no multi-phase story split needed.

## Format: `[ID] [P?] Description`

## Phase 1: Setup / Foundational

- [X] T001 Add `selectedForecastVariable` (`ref(null)`) and `selectedForecastDayIndex` (`ref(0)`)
      to `src/stores/ui.js`, plus `setSelectedForecastVariable(variable)` (also sets
      `activeOverlayKey.value = null` and resets `selectedForecastDayIndex.value = 0`,
      research.md §1/data-model.md) and `setSelectedForecastDayIndex(index)`, mirroring
      `selectedHeight`/`setSelectedHeight`'s exact convention (ui.js lines ~139-142). Also update
      `toggleOverlay(key)` (ui.js line ~163) to set `selectedForecastVariable.value = null` when a
      nowcast Overlay key is chosen (research.md §1's mutual exclusivity, both directions). Export
      the new refs/setters from the store's return object (matching `selectedHeight`,
      `setSelectedHeight` at ui.js lines ~354-355).
- [X] T002 [P] Create `src/utils/forecastLayerData.js` with `fetchForecastDayList(variable)` and
      `fetchForecastSnapshot(variable, forecastStepHours)`, exactly as specified in
      `contracts/forecast-layer-data-contract.md` (import `boundsToImageCoordinates` from
      `windLayerData.js` rather than duplicating it)
- [X] T003 [P] Add `tests/unit/forecastLayerData.test.js` covering `fetchForecastDayList`'s
      latest-cycle-filtering/sorting logic (mock `@/services/api/config.js`'s `supabase`, same
      mocking pattern as `tests/unit/router.test.js`'s `vi.mock('@/services/api/config.js', ...)`)
      — at minimum: returns `[]` on error/empty, filters to only the latest `issued_at`, sorts
      ascending by `forecast_step_hours`

**Checkpoint**: Store state and data-fetching layer ready; UI and map wiring can now proceed.

---

## Phase 2: Implementation

- [X] T004 Add a "Forecast" row to `src/components/FlowControlPanel.vue`: a flat chip list over
      the 14 forecast variables (same visual/button-chip pattern as the existing Overlay row),
      click calls `uiStore.setSelectedForecastVariable(variable)`. Import
      `fetchForecastDayList`/`fetchForecastSnapshot` from the new `forecastLayerData.js` (not
      `windLayerData.js`, matching plan.md's Project Structure)
- [X] T005 In `FlowControlPanel.vue`, when `uiStore.selectedForecastVariable` is set: fetch its
      day list (T002) into local component state, render a day `Slider`
      (`src/components/ui/slider/Slider.vue`) using the exact index-based pattern
      `SidebarPanel.vue`'s duration slider already uses (`:min="0" :max="dayList.length-1" :step="1"
      :model-value="[uiStore.selectedForecastDayIndex]" @update:model-value="v =>
      uiStore.setSelectedForecastDayIndex(v[0])"`), with a human-readable label per FR-010 (e.g.
      "Day {n} · {date}" derived from the selected entry's `validAt`)
- [X] T006 Add the FR-005 no-data hint to `FlowControlPanel.vue`: if the day list is empty for the
      selected variable, or the specific (variable, day) fetch in MapView.vue signals no data
      (see T008), show a small inline message near the slider — not a map-level toast (research.md
      framing, plan.md's Constitution Check §IV)
- [X] T007 In `src/components/MapView.vue`: define `FORECAST_LAYER_ID = 'forecast-overlay'` /
      `FORECAST_SOURCE_ID = 'forecast-overlay-source'` (single fixed ids, research.md §2 — not a
      per-variable table like `overlayLayerIds`), and a `setForecastLayerEnabled(variable,
      forecastStepHours, enabled)` function mirroring `setOverlayLayerEnabled`'s exact shape (lines
      ~3088-3112) but calling `fetchForecastSnapshot` (T002) instead of
      `fetchLatestOverlaySnapshot`
- [X] T008 In `MapView.vue`, add a request-token guard (research.md §5) around
      `setForecastLayerEnabled`'s async fetch: an incrementing counter checked after the `await`
      resolves, discarding the response if a newer request has since started — prevents a rapid
      slider drag from leaving a stale day rendered
- [X] T009 In `MapView.vue`, add
      `watch(() => [uiStore.selectedForecastVariable, uiStore.selectedForecastDayIndex, forecastDayList.value], ...)`
      (or equivalent) that removes the previous forecast layer and adds the new one when either
      the variable or the day index changes — mirroring the existing `selectedHeight` watcher's
      remove-old/add-new sequencing (lines ~3150-3158). Needs access to the currently selected
      variable's day list (from T005's fetch, lifted to a shared location such as the ui store or
      a small composable) to resolve `selectedForecastDayIndex` into an actual
      `forecast_step_hours` value
- [X] T010 [P] Add `flowPanel.forecast.*` i18n keys (row label, 14 variable labels reusing
      `dashboard.forecast.variable*`'s existing translated strings where the wording already
      fits, day label, no-data message, as-of label) to all 7 locale files under
      `src/i18n/locales/`, per research.md §4's namespace decision
- [ ] T011 Verify mutual exclusivity end-to-end (quickstart.md §4): selecting a forecast variable
      while a nowcast Overlay is active removes the Overlay layer and vice versa, using the
      existing `activeOverlayKey` watcher (already correct after T001, no MapView.vue change
      needed there — confirm, don't reimplement)

**Checkpoint**: Feature complete — run `quickstart.md` end-to-end.

---

## Phase 3: Polish

- [ ] T012 [P] Run `quickstart.md` sections 1-5 via the `run` skill / manual browser check against
      the live deployment's already-populated `forecast_snapshots` data
- [X] T013 [P] Run full `vitest` suite + `vite build` to confirm no regressions
- [ ] T014 Update `specs/056-forecast-map-display/checklists/requirements.md`'s Notes with final
      implementation status

---

## Dependencies & Execution Order

- **Phase 1 (T001-T003)**: T001/T002 have no interdependency (different files) and can run in
  parallel; T003 depends on T002 existing (tests the functions it defines)
- **Phase 2 (T004-T011)**: Depends on Phase 1. T004→T005→T006 are sequential (same file, each
  builds on the last). T007→T008→T009 are sequential (same file/function chain). T010 is
  independent (i18n files) and can run in parallel with T004-T009. T011 is a verification step,
  depends on T001+T009 both being done.
- **Phase 3**: Depends on all of Phase 2.

## Parallel Example

```bash
# Phase 1
Task: "Add selectedForecastVariable/selectedForecastDayIndex to src/stores/ui.js"
Task: "Create src/utils/forecastLayerData.js"

# Phase 2 (once Phase 1 done)
Task: "Add flowPanel.forecast.* i18n keys to all 7 locales"
# ...while T004-T009 proceed sequentially in FlowControlPanel.vue/MapView.vue
```
