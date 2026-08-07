# Implementation Plan: Forecast Map Display

**Branch**: `056-forecast-map-display` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/056-forecast-map-display/spec.md`

## Summary

Add a "Forecast" section to the existing map layer control (`FlowControlPanel.vue`), independent
of the existing Mode/Animate/Height/Overlay rows: a flat chip list of the 14 `forecast_snapshots`
variables, and — once one is selected — an index-based day `Slider` (reusing
`SidebarPanel.vue`'s duration-slider pattern) whose range is fetched per-variable from
`forecast_snapshots` (not hardcoded, since UV Index has fewer available days than the rest).
Selecting a variable/day writes to two new flat refs in `src/stores/ui.js`
(`selectedForecastVariable`, `selectedForecastDayIndex`), mirroring `selectedHeight`'s exact
convention. `MapView.vue` gets one new watcher that removes/re-adds a single fixed-id raster
layer (`forecast-overlay`) using a new `fetchForecastSnapshot()` query
(`src/utils/forecastLayerData.js`, mirroring `fetchLatestOverlaySnapshot`'s exact return shape)
— no new backend, no new table, no new Docker service.

## Technical Context

**Language/Version**: Vue 3 `<script setup>`, JavaScript (matches every file this plan touches)

**Primary Dependencies**: Pinia (`src/stores/ui.js`), MapLibre GL (`src/components/MapView.vue`),
`@supabase/supabase-js`, existing `src/components/ui/slider/Slider.vue` — no new dependency.

**Storage**: Reads only, from spec 055's already-existing `forecast_snapshots` table and
`forecast-snapshots` Storage bucket. No schema change.

**Testing**: `vitest`, extending the existing convention (`tests/unit/windLayerData.test.js`-style
pure-function tests) for any new pure helper in `forecastLayerData.js` (e.g. day-index-to-label
mapping). MapLibre rendering itself is not unit-testable in this codebase's existing convention
(no test does so for the Height/Overlay watchers either) — verified instead via the `run`
skill/manual browser check per this project's UI-change convention.

**Target Platform**: Browser (existing SPA), no platform change.

**Project Type**: Web application — frontend-only addition to the existing single-repo layout.

**Performance Goals**: Day-selector moves swap the map overlay within a couple seconds (network
fetch of one small pre-colored PNG + one lightweight day-list query), matching the existing
Height-selector swap's own performance characteristics — no new performance goal introduced.

**Constraints**: Must not alter existing current-conditions (Animate/Overlay) layer behavior when
no forecast is selected (spec FR-007/FR-008) — enforced by keeping `selectedForecastVariable` and
`activeOverlayKey` as separate store fields with mutual-exclusion only at selection time
(research.md §1), never by branching existing Overlay code paths on forecast state.

**Scale/Scope**: Single admin-facing control; one map raster layer at a time (forecast and nowcast
Overlay are mutually exclusive in the same visual slot, research.md §1) — no scale concern beyond
what the existing Overlay layer already handles.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: PASS. Forecast variable/day is data-driven (a list
  fetched from `forecast_snapshots`, not a hard-coded UI branch per variable) — adding a 15th
  forecast variable later requires no new code path here, same as Overlay's existing
  `overlayLayerIds`/`OVERLAY_KIND` dict-driven shape.
- **II. Scope Discipline**: PASS. No dissemination, identity, or CAP change.
- **III. CAP v1.2 Compliance**: N/A.
- **IV. Data Quality & Normalization**: PASS. FR-005/FR-010 (explicit no-data state, human-readable
  day label) directly satisfy "every displayed layer MUST expose a data-freshness indicator" —
  the day label plus the existing `issuedAt`-based staleness convention already used by
  `fetchLatestOverlaySnapshot` callers covers this.
- **V. Access Control & Auditability**: PASS. Read-only, map-gated by the same permissions already
  governing the map's other layer controls (spec.md Assumptions) — no new role, no new audited
  mutation (this feature performs no writes).
- **VI. Accessibility & Internationalization**: PASS. New UI text (`Forecast` row label, day
  labels, no-data message) goes through `vue-i18n`, all 7 locales — matches spec 055's own i18n
  discipline.
- **VII. Performance & Resilience by Design**: PASS. Reuses the exact remove-old-layer/add-new-
  layer pattern already proven for the Height selector; no new polling loop, no new offline-cache
  requirement beyond what Overlay layers already have (they're opt-in, not shown by default).
- **VIII. Simplicity & YAGNI**: PASS. Zero new backend surface (table, Edge Function, Docker
  service) — this is presentation-layer reuse of spec 055's already-ingested data, the smallest
  change that satisfies the spec's acceptance criteria.

**Result**: No violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/056-forecast-map-display/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks, not this command)
```

### Source Code (repository root)

```text
src/stores/ui.js                       # extend: selectedForecastVariable, selectedForecastDayIndex, setters
src/utils/forecastLayerData.js         # NEW: fetchForecastDayList(variable), fetchForecastSnapshot(variable, forecastStepHours)
src/components/FlowControlPanel.vue    # extend: new "Forecast" row (chips + conditional day Slider + no-data hint)
src/components/MapView.vue             # extend: forecast-overlay layer id, setForecastLayerEnabled(), new watcher(s)
src/i18n/locales/*.json                # extend: flowPanel.forecast.* keys, all 7 locales
tests/unit/forecastLayerData.test.js   # NEW: unit tests for pure day-index/label helpers
```

**Structure Decision**: Pure extension of the existing single-repo Vue frontend — no new
directory, no backend change. Mirrors spec 054/055's own precedent of adding a dict-driven
variable set to `MapView.vue`'s existing watcher/layer-id pattern rather than inventing a new
rendering mechanism.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

*No violations — table intentionally omitted.*
