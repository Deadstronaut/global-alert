---

description: "Task list for Flow Visualization Modes & Overlays"

---

# Tasks: Flow Visualization Modes & Overlays

**Input**: Design documents from `/specs/054-flow-visualization-modes/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/wave-snapshot-contract.md, contracts/overlay-snapshot-contract.md, quickstart.md

**Tests**: Light unit-test coverage for pure/testable logic only (matches spec 053's own convention) — no contract/integration harness exists for the Docker-based importers in this repo.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1=P1 Waves, US2=P2 Overlay, US3=P3 honest menu) so each can be implemented and demoed independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Extends spec 053's existing shape (see plan.md's Project Structure): `wind-importer/` (Python importer, extended in place), `supabase/migrations/`, `src/` (Vue frontend), `tests/unit/`.

---

## Phase 1: Setup

**Purpose**: Schema + storage for the two new snapshot shapes — no behavior yet.

- [ ] T001 [P] Write migration `supabase/migrations/<timestamp>_flow_snapshots_add_wave_type.sql`: alter `flow_snapshots`' `layer_type` CHECK constraint to add `'wave'` (data-model.md)
- [ ] T002 [P] Write migration `supabase/migrations/<timestamp>_overlay_snapshots.sql`: create `overlay_snapshots` table (data-model.md, all columns + `value_min<=value_max` check), the `overlay-snapshots` Storage bucket, and a public-SELECT RLS policy — mirror `20260805090000_flow_snapshots.sql`'s exact shape
- [ ] T003 [P] Extend `supabase/migrations/20260805100000_flow_snapshot_retention.sql`'s pattern: add a second retention sweep for `overlay_snapshots` (same 7-day/keep-latest-per-type logic) in a new migration, `<timestamp>_overlay_snapshot_retention.sql`

**Checkpoint**: Schema exists for both new capabilities; nothing produces data yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Store-level state and panel structure every user story needs.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T004 [P] Add `wavesEnabled` and `airQualityOverlayEnabled` (both default `false`) plus `selectedMode` (default `'air'`) to `src/stores/ui.js`, alongside the existing `windEnabled`/`currentsEnabled` (data-model.md's FlowLayerState)
- [ ] T005 Restructure `src/components/FlowControlPanel.vue`'s body into the Mode grouping (Air / Ocean / Chem / Particulates / Space / Bio) per spec FR-007 — Wind stays under Air (implicit, no visible Mode change needed since Air is the default), Currents moves under an explicit Ocean grouping, with Waves added as a second Ocean-mode entry (initially disabled, wired up in Phase 3). Space/Bio render as visibly-disabled entries with a short "coming soon" note (no data pipeline — research.md §5).
- [ ] T006 [P] Add the `windLayer` i18n namespace's new keys (Mode labels, Waves toggle/legend copy, Overlay toggle/legend copy, disabled-mode note) to all 7 locale files (`src/i18n/locales/{tr,en,es,fr,ru,ar,zh}.json`) — constitution Principle VI, matches spec 053's own T018

**Checkpoint**: Panel shows the full Mode/Animate structure; Waves and Overlay slots exist but aren't wired to real data yet. User story implementation can now begin.

---

## Phase 3: User Story 1 - See ocean wave conditions animated on the map (Priority: P1) 🎯 MVP

**Goal**: Animated wave particles render on the 2D map when Ocean mode's Waves is enabled, reusing the existing particle-flow layer as-is.

**Independent Test**: Enable Ocean mode + Waves; observe animating particles over ocean areas with a height-based legend; works with Currents on or off (spec.md US1 acceptance scenarios 1–3).

### Implementation for User Story 1

- [ ] T007 [P] [US1] Implement `wind-importer/fetch_waves.py`: fetch latest WAVEWATCH III `HTSGW`/`DIRPW` GRIB2 from NOMADS (research.md §1), mirroring `fetch_gfs.py`'s cycle-fallback shape
- [ ] T008 [US1] Implement `wind-importer/wave_vector.py`: convert height+direction arrays into the synthetic `u`/`v` vector (research.md §2), then hand off to the existing `grib_to_texture.py`/`flow_texture_common.py` conversion path unchanged
- [ ] T009 [US1] Extend `wind-importer/main.py`: add `layer_type='wave'` to the `--layer-type` choices, wired to T007+T008, `source_name='wavewatch3'`, writing to `flow_snapshots` exactly like wind/currents (contracts/wave-snapshot-contract.md Producer)
- [ ] T010 [US1] Extend `src/components/MapView.vue`'s `flowLayerInstances`/`FLOW_LAYER_IDS` maps (currently `wind`/`ocean_current`) to include `wave`, reusing `SimpleWindLayer` and `setFlowLayerEnabled` exactly as-is — no new rendering code (contracts/wave-snapshot-contract.md Frontend)
- [ ] T011 [US1] Wire a Waves toggle into `FlowControlPanel.vue`'s Ocean-mode section (T005), bound to `ui.wavesEnabled` (T004), following the exact same status/staleness display pattern already used for Wind/Currents
- [ ] T012 [US1] Update the panel's speed-legend label to say "wave height" (not "wind speed") when Waves is the active/most-recently-toggled animated layer, per contracts/wave-snapshot-contract.md's Frontend note
- [ ] T013 [US1] Manual validation: `docker compose run --rm wind-importer --layer-type=wave --once`, enable Waves in the running app, confirm particles appear only over ocean with a plausible height-based legend (quickstart.md steps 1–2)

**Checkpoint**: User Story 1 fully functional and independently demoable — this is the MVP for this spec.

---

## Phase 4: User Story 2 - See air quality / aerosol conditions as a color overlay (Priority: P2)

**Goal**: A color-graded PM2.5 layer renders on the map when the Overlay is enabled, coexisting with any animated layer.

**Independent Test**: Enable the air-quality Overlay; a color-graded layer with legend appears; enabling Wind alongside it keeps both visible together (spec.md US2 acceptance scenarios 1–2).

### Implementation for User Story 2

- [ ] T014 [P] [US2] Implement `wind-importer/fetch_overlay_cams.py`: fetch latest CAMS PM2.5 surface-concentration field via the Copernicus Atmosphere Data Store API (research.md §3), following `fetch_currents.py`'s credential-handling pattern (new `COPERNICUS_ADS_USERNAME`/`COPERNICUS_ADS_PASSWORD` or equivalent env vars in `server/.env`, documented the same way `COPERNICUS_MARINE_*` was)
- [ ] T015 [US2] Implement `wind-importer/overlay_texture.py`: resample the fetched field (reusing `flow_texture_common.py`'s `resample_band_to_grid`), then color it server-side using a quantile ramp matching `exposureLayerColor.js`'s existing gridded-metric convention (research.md §4), producing a pre-colored RGBA PNG
- [ ] T016 [US2] Extend `wind-importer/main.py`: add an `--overlay-type=air_quality_pm25` CLI mode, orchestrating fetch (T014) → color (T015) → upload to the `overlay-snapshots` bucket (T002) → insert `overlay_snapshots` row, same fail-loudly-keep-prior-data rule as the existing flow-snapshot path (contracts/overlay-snapshot-contract.md Producer)
- [ ] T017 [P] [US2] Add `fetchLatestOverlaySnapshot(overlayType)` to `src/utils/windLayerData.js`, parallel to the existing `fetchLatestFlowSnapshot` (contracts/overlay-snapshot-contract.md Frontend step 1)
- [ ] T018 [US2] Wire the Overlay into `src/components/MapView.vue` as a plain MapLibre `raster` source/layer (no custom WebGL code — unlike the particle layers) added on enable / removed on disable, using T017's fetch
- [ ] T019 [US2] Add the Overlay's legend (quantile-ramp swatches, matching this app's existing gridded-metric legend component style) into `FlowControlPanel.vue`'s Chem/Particulates-mode section (T005), bound to `ui.airQualityOverlayEnabled` (T004)
- [ ] T020 [US2] Verify Wind/Currents/Waves and the Overlay render together without one hiding the other, over a smoke/dust-affected region if test data allows (spec.md US2 acceptance scenario 2)
- [ ] T021 [US2] Manual validation: produce an overlay snapshot manually, enable it in the running app, confirm the color-graded layer + legend render correctly (quickstart.md steps 3–4)

**Checkpoint**: User Stories 1 AND 2 both work independently and together.

---

## Phase 5: User Story 3 - Understand what's available vs. not yet supported (Priority: P3)

**Goal**: Space and Bio modes are honestly presented as unavailable, not silently broken or misleadingly interactive.

**Independent Test**: Every Mode entry is either functional or clearly disabled with a note; interacting with a disabled entry does nothing harmful (spec.md US3 acceptance scenarios 1–2).

### Implementation for User Story 3

- [ ] T022 [US3] Verify Space/Bio's disabled state (already added in T005) has no click handler wired at all (not a handler that silently no-ops) and passes a quick manual accessibility check (focusable but clearly `aria-disabled`, consistent with the existing disabled-currents pattern this panel used before spec 053 shipped Currents)
- [ ] T023 [US3] Manual validation: open the panel fresh, confirm at a glance which modes are real vs. not, per quickstart.md step 5

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Confirm reduced-motion handling (T028 from spec 053, already implemented in `simple-wind-layer.js`) applies to Waves with zero additional code, since it reuses `SimpleWindLayer` unchanged — verify only, no new implementation expected
- [ ] T025 [P] Log the new CAMS-based overlay importer capability in this repo's architecture/status docs, alongside spec 053's own wind-importer entry (same task as spec 053's still-open T031 — do both together)
- [ ] T026 Run the full `quickstart.md` validation end-to-end (all 7 steps) before calling the feature done
- [ ] T027 Performance pass: confirm SC-003 holds with Wind + Currents + Waves + the Overlay all active simultaneously, plus existing hex/heatmap layers (spec 053's SC-003/SC-004 baseline)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately, in parallel with each other (T001–T003 touch different migration files).
- **Foundational (Phase 2)**: Depends on Setup (T001–T002, since T004/T005 assume the store/panel shape but not the data itself) — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational (T004–T006) completion. Priority order: US1 (P1) → US2 (P2) → US3 (P3), though US2 is independent of US1 and could be built in parallel by a different contributor.
- **Polish (Phase 6)**: Depends on whichever user stories are in scope being complete.

### User Story Dependencies

- **US1 (Waves, P1)**: No dependency on US2 — the MVP for this spec, and the lower-risk one (reuses 100% of existing rendering code).
- **US2 (Overlay, P2)**: Independent of US1 — only depends on Foundational. Genuinely new rendering code (raster layer, server-side coloring), so higher-risk/higher-effort than US1 despite lower spec priority number ordering coincidence.
- **US3 (Honest menu, P3)**: Depends on T005's Mode grouping existing (Foundational), not on US1/US2's data actually working — can be validated any time after Phase 2.

### Parallel Opportunities

- T001, T002, T003 (Setup) in parallel — three independent migration files.
- T004, T006 (Foundational) in parallel with each other; T005 depends on T004 existing (needs the store fields to bind to) but not on T006.
- Once Foundational is done: US1's implementation (T007–T013) and US2's implementation (T014–T021) can proceed fully in parallel — different importer modules, different MapView.vue layer types.
- T024, T025 (Polish) in parallel.

---

## Parallel Example: Setup Phase

```bash
Task: "flow_snapshots wave CHECK constraint migration"   # T001
Task: "overlay_snapshots table + bucket migration"        # T002
Task: "overlay_snapshots retention migration"              # T003
```

## Parallel Example: User Story 1 + User Story 2

```bash
# Once Foundational (T004-T006) exists, these two stories proceed independently:
Task: "Waves fetch + vector conversion + layer wiring (T007-T013)"      # US1, wind-importer/ + MapView.vue's flowLayerInstances
Task: "CAMS overlay fetch + coloring + raster layer wiring (T014-T021)"  # US2, wind-importer/ (different files) + MapView.vue's new raster layer
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (US1): animated wave particles on the map.
3. **STOP and VALIDATE** via quickstart.md steps 1–2.
4. Demo: Ocean mode now animates both Currents and Waves — already a meaningful step toward the full reference-tool structure the user asked for.

### Incremental Delivery

1. Setup + Foundational → schema + panel structure ready.
2. US1 (Waves) → Ocean mode fully animated (Currents + Waves).
3. US2 (Overlay) → Chem/Particulates mode gets real data, combinable with any animated layer.
4. US3 → honest, non-misleading menu for the remaining (Space/Bio) modes.
5. Polish → docs, perf pass.

### Notes

- [P] tasks touch different files with no unmet dependencies.
- Unlike spec 053, i18n (T006) is placed in Foundational rather than deferred into a later story, since both US1 and US2 need panel copy from the start (the Mode grouping itself, T005, is user-facing text).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently before continuing.
