---

description: "Task list for Animated Wind Flow Visualization"

---

# Tasks: Animated Wind Flow Visualization

**Input**: Design documents from `/specs/053-wind-flow-visualization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/flow-snapshot-contract.md, quickstart.md

**Tests**: Light unit-test coverage included for pure/testable logic (staleness check), matching this repo's existing convention of testing pure helpers (e.g. `disasterSourceBadges.test.js`) — not full contract/integration suites, since this repo has no such harness for Docker-based importers.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1=P1, US2=P2, US4=P2, US3=P3) so each can be implemented and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Extends this repo's existing shape (see plan.md's Project Structure): `src/` (Vue frontend), `supabase/migrations/` (schema), `wind-importer/` (new sibling to `raster-importer/`), `tests/unit/`.

---

## Phase 1: Setup

**Purpose**: Scaffolding for the new importer and vendored rendering layer — no behavior yet.

- [ ] T001 Create `wind-importer/` directory with `Dockerfile` (based on `netcdf-service`'s existing GDAL base image, per research.md §4), `main.py`, `fetch_gfs.py`, `grib_to_texture.py` as empty/stub files
- [ ] T002 [P] Add a `wind-importer` service block to `docker-compose.yml`, cron-scheduled every 6 hours, mirroring the `*-importer-scheduled` pattern already used for `glofas-importer-scheduled` (`raster-importer/cron.ts`'s `JOBS` map — add a `wind`/`ocean_current` entry there, schedule `0 */6 * * *`)
- [ ] T003 [P] Vendor/adapt the chosen MapLibre wind-particle custom layer (research.md §2 candidates: `maplibre-gl-particle`, `windgl-js`) into `src/lib/flow-particle-layer/` — pin the exact source library and note the choice + license in a short header comment

**Checkpoint**: Scaffolding exists; nothing runs end-to-end yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, storage, and importer core that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 Write migration `supabase/migrations/<timestamp>_flow_snapshots.sql` creating `flow_snapshots` per data-model.md (all fields, `u_min<=u_max`/`v_min<=v_max` check constraints) with a public-SELECT RLS policy matching `exposure_features`' existing policy shape
- [ ] T005 Create the Supabase Storage bucket for wind/current textures, path convention `flow-snapshots/{layer_type}/{issued_at-ISO8601}.png` per contracts/flow-snapshot-contract.md
- [ ] T006 [P] Add `windEnabled`/`currentsEnabled` (both default `false`) to `src/stores/ui.js`, alongside the existing `showHeatmap`/`showHexbins` toggle state, per data-model.md's FlowLayerState
- [ ] T007 Implement `wind-importer/fetch_gfs.py`: fetch latest GFS surface (10m) wind U/V GRIB2 files from NOAA NOMADS (research.md §1) for a given forecast cycle
- [ ] T008 Implement `wind-importer/grib_to_texture.py`: GDAL-based conversion of fetched GRIB2 U/V bands into an RG-channel PNG texture (equirectangular projection) + JSON metadata (u_min/u_max/v_min/v_max), per research.md §2–3
- [ ] T009 Implement `wind-importer/main.py` entrypoint (`--layer-type=wind|ocean_current --once` flags per quickstart.md): orchestrates fetch → convert → upload to Storage (T005) → insert `flow_snapshots` row (T004), never touching a prior successful row on failure (contracts/flow-snapshot-contract.md Producer, fail-loudly-keep-prior-data rule)

**Checkpoint**: Foundation ready — `docker compose run --rm wind-importer --layer-type=wind --once` produces one real `flow_snapshots` row + texture. User story implementation can now begin.

---

## Phase 3: User Story 1 - See global wind flow at a glance (Priority: P1) 🎯 MVP

**Goal**: Animated wind particles render on the 2D map, direction-accurate, when the layer is toggled on.

**Independent Test**: Enable the wind layer at world view; observe continuously animating particles following current wind direction; pan/zoom stays smooth; disabling removes all animation/artifacts cleanly (spec.md US1 acceptance scenarios 1–3).

### Implementation for User Story 1

- [ ] T010 [P] [US1] Wire the vendored flow-particle-layer (T003) into `src/components/MapView.vue` as a MapLibre `type: 'custom'` layer, added on enable / removed (with WebGL resource cleanup) on disable
- [ ] T011 [US1] Create `src/components/FlowControlPanel.vue`: a small square icon button anchored on/beside the existing severity (`ŞİDDET`) legend panel — collapsed by default, click expands (animated, opening toward the top-right, matching the reference GEOS-5/nullschool tool's own compact settings-icon affordance per user request 2026-08-05) into a small panel. This is the ONE shared control surface for the whole feature — later tasks (T017, T021, T025, T026) add their controls INTO this panel rather than each adding separate standalone UI elements. This task: the collapse/expand shell + animation + a wind on/off toggle bound to `ui.windEnabled` (T006) as its first control.
- [ ] T012 [US1] Implement the frontend read path: latest `flow_snapshots` row for `layer_type='wind'` → resolved Storage texture URL → fed into the custom layer (T010), per contracts/flow-snapshot-contract.md Frontend steps 1–3
- [ ] T013 [US1] Verify/tune the custom layer's re-render behavior on `map.on('move'/'zoom')` so animation stays aligned with the viewport with no visible lag or tearing (spec.md US1 acceptance scenario 2)
- [ ] T014 [US1] Verify disabling the layer removes all particles/WebGL state immediately with no residual artifacts (spec.md US1 acceptance scenario 3)
- [ ] T015 [US1] Manual validation: run `docker compose run --rm wind-importer --layer-type=wind --once`, enable the layer in the running app, confirm particle motion plausibly matches real wind for the current day (quickstart.md steps 1–2)

**Checkpoint**: User Story 1 fully functional and independently demoable — this is the MVP.

---

## Phase 4: User Story 2 - Read wind intensity, not just direction (Priority: P2)

**Goal**: The layer visually communicates wind speed (color and/or particle behavior), with a legend explaining the scale.

**Independent Test**: Compare a calm region against a stormy one (e.g. near an active cyclone in the app's own event data); confirm the layer visibly communicates the difference and the legend explains units/scale (spec.md US2 acceptance scenarios 1–2).

### Implementation for User Story 2

- [ ] T016 [P] [US2] Add speed-to-color mapping to the flow-particle-layer's rendering config, decoding real speed from the texture via the snapshot's `u_min/u_max/v_min/v_max` (data-model.md)
- [ ] T017 [US2] Add the speed scale + unit legend into `FlowControlPanel.vue` (T011) — not a separate standalone legend, lives inside the same expandable panel
- [ ] T018 [US2] Route every new legend/label string through vue-i18n across all 7 locales (tr/en/es/fr/ru/ar/zh) — constitution Principle VI, explicit task per plan.md's Constitution Check note

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 4 - See ocean current flow alongside wind (Priority: P2)

**Goal**: An independently-toggleable ocean-currents layer, land-masked, coexisting with the wind layer without visual or performance conflict.

**Independent Test**: Toggle currents alone → particles only over ocean, none over land; toggle both wind and currents together over a coastal area → both remain visually distinguishable and performance stays within budget (spec.md US4 acceptance scenarios 1–2).

### Implementation for User Story 4

- [ ] T019 [P] [US4] Extend the importer (`wind-importer/fetch_gfs.py` / `grib_to_texture.py`, or add `fetch_currents.py`) to also fetch and convert a NOAA ocean-current product (research.md §5 — pin the exact product/source during this task) into the same `flow_snapshots`/texture shape, `layer_type='ocean_current'`
- [ ] T020 [US4] Add land-masking to the currents rendering (suppress particles over land) in the flow-particle-layer config, distinct from the wind layer's config
- [ ] T021 [US4] Add an ocean-currents toggle into `FlowControlPanel.vue` (T011), bound to `ui.currentsEnabled` (T006), independent of the wind toggle already there
- [ ] T022 [US4] Verify wind + currents rendering simultaneously stay visually distinguishable (distinct color treatment) and within the performance budget (SC-003/SC-004) — quickstart.md step 5

**Checkpoint**: User Stories 1, 2, and 4 all functional together.

---

## Phase 6: User Story 3 - Trust that the data is current (Priority: P3)

**Goal**: The layer always shows when its data was issued, and flags itself when that data is stale.

**Independent Test**: Legend shows an "as of [timestamp]" matching the snapshot's `issued_at`; artificially aging the latest snapshot beyond ~2x the refresh cadence triggers a visible staleness indication rather than presenting it as current (spec.md US3 acceptance scenarios 1–2).

### Tests for User Story 3

- [ ] T023 [P] [US3] Implement pure `isFlowSnapshotStale(issuedAt, now, cadenceHours)` helper in `src/utils/flowSnapshotStaleness.js` (contracts/flow-snapshot-contract.md Frontend step 4)
- [ ] T024 [P] [US3] Unit tests in `tests/unit/flowSnapshotStaleness.test.js` covering: fresh data, exactly-at-threshold, clearly stale, and missing/null `issuedAt` — same pattern as `tests/unit/disasterSourceBadges.test.js`

### Implementation for User Story 3

- [ ] T025 [US3] Display "as of [issued_at]" inside `FlowControlPanel.vue` (T011), separately for wind and currents, using this app's existing date-formatting convention
- [ ] T026 [US3] Wire the staleness flag (T023) into `FlowControlPanel.vue`'s display when triggered
- [ ] T027 [US3] Implement a graceful "data unavailable" state in `FlowControlPanel.vue`/`MapView.vue` for both layers when the texture fetch fails (FR-006) — quickstart.md step 3

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Reduced-motion "safe mode" fallback for both layers (static arrows/color fill instead of animated particles) — constitution Principle VI, non-optional per plan.md's Constitution Check
- [ ] T029 [P] Add a `flow_snapshots` retention-policy entry matching the existing pattern in `supabase/migrations/20260730130000_enforce_retention_policies_extend_timeout.sql` so old snapshots don't grow unbounded
- [ ] T030 Run the full `quickstart.md` validation end-to-end (all 6 steps) before calling the feature done
- [ ] T031 [P] Log the new `wind-importer` service in this repo's architecture/status docs (matching the existing convention of documenting new infra pieces)
- [ ] T032 Performance pass: confirm SC-003/SC-004 hold with wind + currents + existing hex/heatmap layers all active simultaneously

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001–T003) — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational (T004–T009) completion. Priority order: US1 (P1) → US2/US4 (P2, independent of each other) → US3 (P3).
- **Polish (Phase 7)**: Depends on whichever user stories are in scope for the current release being complete.

### User Story Dependencies

- **US1 (P1)**: No dependencies on other stories — the MVP.
- **US2 (P2)**: Builds on US1's rendered layer (needs T010–T012 to exist to attach a legend to) but is its own independently-testable increment.
- **US4 (P2)**: Independent of US2 — only depends on Foundational + the vendored layer (T003, T010's pattern). Can be built in parallel with US2 by a different contributor.
- **US3 (P3)**: Touches both US2's and US4's legend UI (T017, T021) — sequence after both if a single contributor; independently assignable if legends are stubbed first.

### Parallel Opportunities

- T002, T003 (Setup) in parallel.
- T006 (Foundational) in parallel with T007–T009 (different files/domains).
- Once Foundational is done: US2's implementation and US4's implementation can proceed in parallel (different files: legend vs. currents-fetch/land-mask).
- T023/T024 (US3 tests) in parallel with each other, and can start before T025–T027 once the helper's shape (T023) is agreed.
- T028, T029, T031 (Polish) in parallel.

---

## Parallel Example: Foundational Phase

```bash
# After T001-T003 (Setup), launch together:
Task: "Add windEnabled/currentsEnabled to src/stores/ui.js"          # T006
Task: "Implement fetch_gfs.py NOMADS GRIB2 fetch"                     # T007
```

## Parallel Example: User Story 2 + User Story 4

```bash
# Once Foundational + US1 (T010-T012) exist, these two stories proceed independently:
Task: "Speed-to-color mapping + wind legend (T016-T018)"   # US2, touches MapView.vue legend area + i18n files
Task: "Ocean current fetch + land-mask + toggle (T019-T022)" # US4, touches wind-importer/ + a different MapView.vue layer config
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1): animated wind direction on the map.
3. **STOP and VALIDATE** via quickstart.md steps 1–2.
4. Demo: a moving wind-flow map, no speed legend or currents yet — already the headline "wow" visual the user asked for.

### Incremental Delivery

1. Setup + Foundational → importer produces real snapshots.
2. US1 → wind direction animates → demo-able MVP.
3. US2 → speed becomes readable, not just direction.
4. US4 → ocean currents join, independently toggleable.
5. US3 → trust/freshness layer on top of both.
6. Polish → accessibility (reduced motion), retention, docs, perf pass.

### Notes

- [P] tasks touch different files with no unmet dependencies.
- Constitution Principle VI (accessibility/i18n) is not deferred to Polish for the legend strings themselves (T018) — only the reduced-motion fallback (T028) is Polish-phase, since it's a cross-cutting concern affecting both layers equally rather than being specific to one story.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently before continuing.
