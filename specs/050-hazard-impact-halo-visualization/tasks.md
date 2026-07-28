---
description: "Task list for Hazard Impact Halo Visualization (spec 050)"
---

# Tasks: Hazard Impact Halo Visualization

**Input**: Design documents from `specs/050-hazard-impact-halo-visualization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Tests**: Playwright live-testing (this project's established convention) for US1/US2; no automated contract tests needed (no new backend endpoints for US1/US2).

## Phase 1: Setup

No new project/dependency setup needed — single existing Vue app, no new npm packages (see research.md §1 on why `@turf/turf` was rejected).

- [X] T001 Confirm `defaultBufferRadiusKm` export shape in `src/lib/hazardBuffer.js` is reusable as-is (read-only check, no change expected)

## Phase 2: Foundational

- [X] T002 Add `circlePolygon(lat, lng, radiusKm, points=64)` helper to `src/utils/exposureLayerColor.js` (or a new small `src/utils/circleGeometry.js` if that file starts feeling overloaded) — pure function, degrees-per-km approximation matching `demSlopeAggregate.ts`'s existing latitude-corrected longitude conversion
- [X] T003 [P] Add a `dem_slope`-style ramp entry for the halo/severity gradient to `exposureLayerColor.js` (or reuse the existing `dem_slope` ramp if visually appropriate — confirm during implementation)

**Checkpoint**: Foundation ready — US1 and US2 can now proceed (US2 depends on US1's halo radius/center being available, see below)

---

## Phase 3: User Story 1 - Impact halo ring (Priority: P1) 🎯 MVP

**Goal**: Selecting any hazard event shows a translucent circle at its estimated impact radius, with a vertical opacity slider in the info card.

**Independent Test**: Select an event, see the halo at the right radius; drag the vertical slider to 0 and back; deselect and confirm it disappears (quickstart.md steps 1-8).

### Implementation for User Story 1

- [X] T004 [US1] Add `haloOpacity` ref + halo source/fill/line layers to `src/components/MapView.vue`, built from `circlePolygon(selectedEvent.lat, selectedEvent.lng, defaultBufferRadiusKm(selectedEvent))`
- [X] T005 [US1] Add/remove the halo layer reactively on event selection change (watch `selectedEvent`) and on deselection
- [X] T006 [US1] Add the vertical opacity slider UI to the event info card in `MapView.vue`, visually distinct from the existing horizontal layer-opacity sliders (own CSS class, `writing-mode`/`appearance` vertical range input)
- [X] T007 [US1] Wire the slider to `haloOpacity`, updating the halo layer's `fill-opacity`/`line-opacity` paint properties live
- [X] T008 [P] [US1] Add i18n strings (slider label, any halo legend text) to `en.json`/`tr.json`
- [X] T009 [US1] Live-test via Playwright: select a real Kahramanmaraş/Gaziantep-area earthquake, verify halo radius/slider behavior per quickstart.md steps 1-8

**Checkpoint**: US1 fully functional and independently demoable.

---

## Phase 4: User Story 2 - Distance-graded critical facility coloring (Priority: P2)

**Goal**: Critical-infrastructure points inside the halo are colored red (near center) to yellow (near edge); points outside are untouched.

**Independent Test**: Select an event with several nearby critical-infrastructure points; confirm color varies by distance (quickstart.md steps 9-11).

### Implementation for User Story 2

- [X] T010 [US2] Compute per-point `severity = 1 - clamp(distance_km / haloRadiusKm, 0, 1)` client-side in `MapView.vue` for the `osm-buildings` layer's already-loaded features whenever the halo is active (depends on T004's halo center/radius)
- [X] T011 [US2] Feed `severity` into a MapLibre `interpolate` expression against the new ramp (T003) for the critical-infrastructure `circle` layer's `circle-color`, only for points within the halo radius — points outside keep their existing fixed violet color
- [X] T012 [US2] Add the FR-005 disclaimer ("distance-based estimate, not a damage assessment") to the critical-infrastructure point popup, i18n'd
- [X] T013 [US2] Live-test via Playwright: verify near-center vs. near-edge color difference and popup disclaimer text (quickstart.md steps 9-11)

**Checkpoint**: US1 + US2 both independently functional and demoable together.

---

## Phase 5: User Story 3 - Individual building-level affected estimate (Priority: P3, BLOCKED)

**Not implemented in this pass.** Requires a new country-scale data import (Microsoft Global ML Building Footprints — see research.md §3) that is large enough to warrant its own `/speckit-plan` cycle when picked up. No tasks defined here beyond the research already captured in spec.md/research.md/data-model.md, so a future planning pass has a documented starting point instead of rediscovering it.

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → Phase 3 (US1) → Phase 4 (US2). US2 depends on US1's halo center/radius state existing, so it is not independently buildable before US1 despite being a separate user story (documented deviation from the template's usual "independent" framing — the spec's own US2 description already frames it as "within the halo's radius").
- Phase 5 (US3) is not started; blocked on a separate data-acquisition effort.

## Notes

- No automated backend/contract tests: US1/US2 add zero new RPCs/endpoints, so there is nothing to contract-test — Playwright live-testing (this project's established convention) covers the actual behavior.
- Run `npm run test` (230/230 baseline) and `npm run build` after each phase to confirm no regression, matching this project's established workflow throughout specs 048/049.
