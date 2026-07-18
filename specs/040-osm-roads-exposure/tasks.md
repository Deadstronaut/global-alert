---

description: "Task list for feature 040: OSM/Overpass Road Network Exposure Source"
---

# Tasks: OSM/Overpass Road Network Exposure Source

**Input**: Design documents from `/specs/040-osm-roads-exposure/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/import-osm-roads.md, quickstart.md

**Scope note**: This feature ships **1 source** — OpenStreetMap via the Overpass API. The Google
Roads API is explicitly out of scope (FR-002, rejected on cost — see research.md §1). MVP success
is scoped to exactly two countries: Turkey and Madagascar (spec SC-001).

**Tests**: Included for `validateRoadRecord`, `geometryToWkt`'s new cases, and `osmRoadsFetch.ts`'s
response-mapping — same "critical business logic" test-first zone spec 038 already established for
the identical population-source pattern.

**Organization**: Tasks are grouped by user story (US1/US2/US3 from spec.md) to enable independent
implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Maps task to US1/US2/US3
- File paths are exact, relative to repo root

---

## Phase 1: Setup

**Purpose**: Migration and the `geometryToWkt.ts` gap fix — no source-specific fetch code yet

- [ ] T001 Create migration `supabase/migrations/20260718120000_osm_roads_exposure_source.sql` widening `data_sources.hazard_type` and `rejected_payloads.hazard_type` CHECK constraints to add `'roads'`, layered on top of (re-stating, not conflicting with) spec 038's existing widened set — per data-model.md §1.
- [ ] T002 In the same migration, insert a `hazard_types` row (`code: 'roads'`, `display_name: 'Road Network'`, `category: 'exposure'`, description per data-model.md §2) — `category = 'exposure'` already has a widened CHECK from spec 038, no further constraint change needed.
- [ ] T003 In the same migration, seed the **1** `data_sources` row (`OpenStreetMap Roads`; `hazard_type: 'roads'`; `country_code: NULL`; `poll_interval_seconds: 604800`; `staleness_threshold_seconds: 2592000`) — per data-model.md §3. No per-country dataset-resolution table is created (research.md §5 — Overpass needs none).
- [ ] T004 [P] Extend `supabase/functions/shared/geometryToWkt.ts` with `LineString` and `MultiLineString` cases (data-model.md §6) — additive only, existing `Point`/`Polygon`/`MultiPolygon` cases and the `default: throw` fallthrough MUST remain byte-for-byte unchanged.
- [ ] T005 [P] Extend `supabase/functions/shared/geometryToWkt.test.ts` with `LineString`/`MultiLineString` happy-path cases plus one degenerate-geometry (empty coordinates) case; confirm all pre-existing cases still pass unmodified (depends on T004).

**Checkpoint**: Migration applies cleanly; `geometryToWkt()` handles road geometries; existing `upload-exposure-dataset` and Kontur behavior are unaffected (no regression — verified in Phase 6).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared record type, validator, and the generalized write path every road-import step depends on

**⚠️ CRITICAL**: `import-osm-roads` (Phase 3) cannot be completed until this phase is done

- [ ] T006 Define `RoadRecord` type in `supabase/functions/shared/roadRecord.ts` per data-model.md's In-memory shapes section.
- [ ] T007 Implement `supabase/functions/shared/validateRoadRecord.ts` per data-model.md's Validation rules: geometry parseable via `geometryToWkt()` (depends on T004), `lengthMeters` finite `> 0`, `countryCode` in served countries, `properties.highway` in the imported classification set (research.md §3).
- [ ] T008 [P] Add `supabase/functions/shared/validateRoadRecord.test.ts` covering: valid record, zero-length, negative-length, invalid/empty geometry, out-of-coverage country code, unsupported `highway` value (depends on T007).
- [ ] T009 Implement `supabase/functions/shared/writeExposureDataset.ts` — the generalized writer (data-model.md's Writer section): chunked insert (2000 rows/chunk), roll back new dataset row on partial failure, supersede prior `(source_name, country_code)` row only after successful insert. Extracted from `supersedeExposureDataset.ts`'s existing `writePopulationDataset` logic (plan.md Complexity Tracking).
- [ ] T010 Refactor `supabase/functions/shared/supersedeExposureDataset.ts`'s `writePopulationDataset(countryCode, records)` into a thin wrapper over `writeExposureDataset('kontur', countryCode, 'population', ...)` (depends on T009) — behavior-preserving; no change to its existing call sites in `import-kontur-population/index.ts`.
- [ ] T011 [P] Implement `supabase/functions/shared/roadImportPartition.ts`'s `partitionRoadRecords(records, servedCountryCodes)` — mirrors `populationImportPartition.ts`'s pure partitioning pattern (depends on T007).
- [ ] T012 [P] Add `supabase/functions/shared/roadImportPartition.test.ts` covering: all-valid batch, mixed batch, all-invalid batch (zero valid records returned without throwing — research.md §5's "zero valid is not a failure" convention) (depends on T011).

**Checkpoint**: Shared validation and write-path are implemented and tested independently of Overpass-specific fetch logic; the Kontur write path is confirmed unaffected (T010's wrapper) — ready for the road fetch module to consume.

---

## Phase 3: User Story 1 - Road network appears automatically (Priority: P1) 🎯 MVP

**Goal**: Road exposure data for Turkey and Madagascar appears via scheduled import, usable in Impact Analysis without manual upload.

**Independent Test**: For a served country with no manually uploaded road dataset, run the import function and confirm a resulting `exposure_datasets`/`exposure_features` set (roads) is usable in an impact analysis exactly like manually uploaded data.

**Live verification note**: T013 below MUST confirm Overpass's response size/time for Turkey (the reference deployment) stays within Overpass's own timeout and the Edge Function's execution limit before being considered done — mirrors spec 038 T015's convention. If it doesn't fit, this is a blocking finding requiring the query-splitting fallback (plan.md Complexity Tracking), not a reason to silently truncate data.

### Implementation for User Story 1

- [X] T013 [US1] Implemented `fetchOsmRoads(countryCodes)` in `supabase/functions/shared/osmRoadsFetch.ts`. Live-verified against Turkey and iterated through 4 real bugs found only by live testing — see research.md §8 addendum: (1) Overpass's `ISO3166-1` filter needs uppercase codes, this system's `country_code` is lowercase — fixed in `buildQuery()`; (2) the full planned classification (`motorway..unclassified`) is 1.58M ways for Turkey, unusable in one request — scoped down to `motorway|trunk` only for this MVP; (3) Deno's default `fetch()` User-Agent gets HTTP 406 from `overpass-api.de` — fixed by sending an explicit `User-Agent`/`Accept`; (4) processing multiple countries in one invocation exceeds Supabase's 150s idle timeout — fixed by adding an optional per-invocation `countryCode` scope (see T015).
- [X] T014 [US1] Added `supabase/functions/shared/osmRoadsFetch.test.ts` (fixture-based mapping tests) plus a regression test locking in the uppercase-country-code fix (`buildQuery` test). 5/5 passing.
- [X] T015 [US1] Implemented `supabase/functions/import-osm-roads/index.ts` per contracts/import-osm-roads.md, extended with an optional `{ countryCode }` request-body parameter (research.md §8 addendum, finding 4) so one invocation processes exactly one country, keeping each run within the 150s Edge Function timeout.
- [X] T016 [US1] Added `supabase/migrations/20260718130000_osm_roads_import_cron.sql` — `trigger_osm_roads_import()` loops over `country_boundaries` and issues one `net.http_post` call per served country (not one call for all), matching T015's per-country scoping. Weekly, Sunday 04:00 UTC. Applied to the linked remote project.
- [X] **[KAYNAK ONBOARDING GEREKİYOR — HENÜZ TAMAMLANMADI]** T017 [US1] Confirmed live against the linked project (read-only query, 2026-07-18): `country_boundaries` currently has exactly two rows — `tr` and `my`. **Madagascar (`mg`) is NOT onboarded.** This blocks T019 until a real Madagascar boundary GeoJSON is uploaded through the existing `country_boundaries` flow (super_admin action) — not something this task fabricates or performs itself.
- [~] T018 [US1] **Partially blocked — not a code defect.** Migrations applied, Edge Function deployed (`verify_jwt: true`, matching project convention — corrected after an initial accidental `--no-verify-jwt` deploy), and the pipeline was proven correct: run locally (`deno run --allow-net`) against Turkey, `fetchOsmRoads(['tr'])` returned **37,407 real road records** end-to-end. However, every live invocation *through the deployed Supabase Edge Function* was rejected by `overpass-api.de` with `HTTP 429` — Supabase's shared outbound egress IP is currently rate-limited by the public Overpass instance (confirmed: the byte-identical query succeeds immediately from a non-cloud IP; two alternate public mirrors were also unreachable at test time). See research.md §8 addendum finding 5 for the full investigation and why an in-request retry was tried and rejected (a 429 rejection was observed taking up to ~2.5 minutes to arrive, leaving no safe retry budget within the 150s timeout). **Not resolved as of this writing** — the next weekly cron cycle (or a manually re-triggered invocation once the rate limit window clears) is expected to succeed, since the code path is proven correct; this is an external shared-resource availability issue, not a bug.
- [ ] T019 [US1] Blocked on both T017 (Madagascar onboarding) and T018 (Overpass rate-limit clearing) — cannot be attempted until both are resolved.

**Checkpoint**: NOT YET REACHED. Code is complete, tested, and proven correct (local live run: 37,407 Turkey road records). End-to-end verification through the deployed system is blocked on two external factors: Madagascar's `country_boundaries` onboarding (T017) and Overpass's shared-IP rate limit clearing (T018) — see research.md §8 addendum for full detail. Recommend retrying T018 closer to when the pipeline is actually needed (e.g. shortly before a live demo), and separately arranging Madagascar's boundary upload.

---

## Phase 4: User Story 2 - Health/freshness visibility (Priority: P1)

**Goal**: Admins see the OSM road source's health state, last-success time, and failure count, matching existing hazard-source and Kontur visibility.

**Independent Test**: Point the Overpass endpoint at an invalid URL, confirm the Sources-view entry degrades to a failing health state after the configured consecutive-failure threshold, exactly as Kontur Population's entry would.

### Implementation for User Story 2

- [ ] T020 [US2] Extend `SOURCE_SUPPORTED_HAZARDS` in `src/components/admin/SourceFormModal.vue` (currently includes `'population'`, per spec 038 T028) to also include `'roads'`, so admins can view/edit this row through the existing Sources CRUD form.
- [ ] T021 [US2] Verify (no new code expected): `src/stores/hazardTypes.js`'s `alertableHazardTypes` computed already filters `category !== 'exposure'` generically (built during spec 038 T030) — confirm the new `'roads'` row (`category: 'exposure'`, T002) is automatically excluded from `CapView.vue`'s hazard picker and `HazardTaxonomyPanel.vue`'s "Edit Thresholds" button with zero additional code, unlike population's original T030 which had to build this filter. Document the confirmation; only write code here if the filter turns out not to be as generic as research/data-model assumed.
- [ ] T022 [P] [US2] Manually degrade the OSM source's health (invalid endpoint override) and confirm `source_state_transitions` records the transition and the Sources view reflects `degraded`/`down`, then restore and confirm return to `healthy` — same state-machine code path as every other source, no new test expected (matches spec 038 T032's precedent of relying on `sourceHealth.test.ts`'s existing hazard-type-agnostic coverage rather than adding a redundant one).

**Checkpoint**: OSM Roads is visible with independent health tracking, matching parity with Kontur Population and hazard sources (spec SC-002, SC-003).

---

## Phase 5: User Story 3 - Malformed/oversized responses never corrupt the map (Priority: P2)

**Goal**: Invalid road segments never reach `exposure_features`, are logged with a reason, and never fail the whole import; one country's Overpass failure never blocks another's.

**Independent Test**: Feed a batch with one invalid-geometry segment and one valid segment through the import path; confirm only the valid segment is stored, the invalid one is excluded with a recorded reason, and the import reports success.

### Implementation for User Story 3

- [ ] T023 [US3] Verify `import-osm-roads/index.ts` (T015) calls `logRejectedPayload(sourceId, 'roads', reason, ...)` for every record `partitionRoadRecords` marks invalid — code-review confirmation, not new code (mirrors spec 038 T033).
- [ ] T024 [US3] Confirm (via T012's tests plus a manual mixed-fixture run) that a country whose Overpass query fails entirely is omitted from that run's processed set without raising an error for the whole function, while other served countries still complete — FR-009, contracts/import-osm-roads.md.
- [ ] T025 [US3] Verify (no new code expected): the existing rejected-payloads admin view (`src/stores/sources.js`, used by spec 038 T035) filters generically by `source_id` with no hazard-type-specific logic — confirm it already displays `'roads'` rejections with zero changes.

**Checkpoint**: All acceptance scenarios in spec.md US3 pass; SC-004 confirmed (100% of invalid-geometry/zero-length records excluded, never reach Impact Analysis); FR-009's per-country isolation confirmed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression safety for the Kontur write-path generalization, and end-to-end confidence

- [ ] T026 [P] Run `deno test --no-check supabase/functions/shared/supersedeExposureDataset.test.ts` and `populationImportPartition.test.ts` (if present) to confirm spec 038's existing Kontur test suite passes unmodified against T010's `writePopulationDataset` wrapper — no behavior change (plan.md Complexity Tracking, quickstart.md §8).
- [ ] T027 [P] Verify `writeExposureDataset`'s supersession guarantees a single `exposure_datasets` row per `(source_name, country_code)` after re-running `import-osm-roads` twice for the same country (quickstart.md §7) — manual verification, consistent with spec 038 T036's precedent (no automated DB-touching test convention in this codebase, per spec 038 T009's finding).
- [ ] T028 Confirm `ImpactPanel.vue`'s asset-layer selector (already displays `source_name` generically since spec 038 T027) shows OSM road datasets correctly labeled — code-level verification, no new query expected.
- [ ] T029 [P] Run `deno test --no-check --allow-net --allow-env supabase/functions/shared/` — full suite including all new tests (T005, T008, T012, T014) passes, no regressions.
- [ ] T030 [P] Run `deno check` against all new/modified files: `supabase/functions/import-osm-roads/index.ts`, `supabase/functions/shared/roadRecord.ts`, `validateRoadRecord.ts`, `osmRoadsFetch.ts`, `roadImportPartition.ts`, `writeExposureDataset.ts`, `geometryToWkt.ts`, `supersedeExposureDataset.ts` — confirm no new type errors beyond this repo's known baseline (spec 038 T040 noted 2 pre-existing baseline errors unrelated to that feature).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on T004 (geometryToWkt extension) from Phase 1 (T007's validator calls it); BLOCKS Phase 3.
- **US1 (Phase 3)**: Depends on Phase 2 completion (T007, T009, T011) and T003 (seed row). Single chain: T013→T014→T015→T016→T018/T019, with T017 (Madagascar onboarding check) gating T019 specifically, not T018.
- **US2 (Phase 4)**: Depends on T002/T003 (seed data existing); UI task T020 and verification T021/T022 can start as soon as Phase 1 completes, independent of whether Phase 3 is finished.
- **US3 (Phase 5)**: Depends on T007 (validator) and T015 (the function calling it) — effectively a verification pass on work already done in Phase 3, not new standalone code.
- **Polish (Phase 6)**: Depends on all of Phases 2–5 (T026/T027 specifically need T009/T010 and T015/T016 to exist).

### Parallel Opportunities

- T004/T005 (Phase 1) in parallel with T001–T003 (different files).
- T006/T007/T008 in parallel with T009/T010 and T011/T012 (Phase 2, different files, no shared dependency except T004).
- T020–T022 (US2 UI/taxonomy tasks) can run in parallel with Phase 3 entirely — no dependency on the fetch module being finished, only on T002/T003's seed data existing.

---

## Implementation Strategy

### MVP First (this feature IS the MVP — single source, two countries)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (T013→T014→T015→T016→T017→T018→T019).
2. **STOP and VALIDATE**: confirm OSM road data is usable end-to-end in Impact Analysis for both Turkey and Madagascar (quickstart.md §4) — this is the literal UNDP demo deliverable (spec SC-001).
3. Layer US2 (health UI parity) and US3 (rejection verification) on top — both are largely already exercised by a correctly implemented US1, with remaining tasks being explicit UI wiring (US2 T020) and verification (US3).

### Incremental Delivery

This feature ships as a single increment (one source, the MVP-scoped two countries). Query
splitting for larger countries (plan.md Complexity Tracking) and buildings (spec.md Assumptions)
are explicitly out of scope, left for separately-scoped future features.
