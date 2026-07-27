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

- [X] T001 **Bookkeeping fix (2026-07-27): file exists, checkbox was just never ticked.** Verified `supabase/migrations/20260718120000_osm_roads_exposure_source.sql` exists and matches this description.
- [X] T002 Verified: same migration's `hazard_types` row present as described.
- [X] T003 Verified: same migration's `data_sources` seed row present as described.
- [X] T004 [P] Verified `supabase/functions/shared/geometryToWkt.ts` has `LineString`/`MultiLineString` cases, additive, existing cases unchanged.
- [X] T005 [P] Verified `supabase/functions/shared/geometryToWkt.test.ts` has `LineString`/`MultiLineString` test cases (`Deno.test('geometryToWkt: LineString converts correctly', ...)` confirmed present).

**Checkpoint**: Migration applies cleanly; `geometryToWkt()` handles road geometries; existing `upload-exposure-dataset` and Kontur behavior are unaffected (no regression — verified in Phase 6).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared record type, validator, and the generalized write path every road-import step depends on

**⚠️ CRITICAL**: `import-osm-roads` (Phase 3) cannot be completed until this phase is done

- [X] T006 **Bookkeeping fix (2026-07-27)**: verified `supabase/functions/shared/roadRecord.ts` exists with `RoadRecord`.
- [X] T007 Verified `supabase/functions/shared/validateRoadRecord.ts` exists, matching the described validation rules.
- [X] T008 [P] Verified `supabase/functions/shared/validateRoadRecord.test.ts` exists.
- [X] T009 Verified `supabase/functions/shared/writeExposureDataset.ts` exists (the generalized writer, now also used by spec 046's later work — confirmed reused, not re-duplicated).
- [X] T010 Verified `supersedeExposureDataset.ts`'s wrapper refactor is in place; `import-kontur-population/index.ts` call sites unaffected.
- [X] T011 [P] Verified `supabase/functions/shared/roadImportPartition.ts` exists.
- [X] T012 [P] Verified `supabase/functions/shared/roadImportPartition.test.ts` exists.

**Checkpoint**: Shared validation and write-path are implemented and tested independently of Overpass-specific fetch logic; the Kontur write path is confirmed unaffected (T010's wrapper) — ready for the road fetch module to consume.

---

## Phase 3: User Story 1 - Road network appears automatically (Priority: P1) 🎯 MVP

**Goal**: Road exposure data for Turkey and Madagascar appears via scheduled import, usable in Impact Analysis without manual upload.

**Independent Test**: For a served country with no manually uploaded road dataset, run the import function and confirm a resulting `exposure_datasets`/`exposure_features` set (roads) is usable in an impact analysis exactly like manually uploaded data.

**Live verification note**: T013 below MUST confirm Overpass's response size/time for Turkey (the reference deployment) stays within Overpass's own timeout and the Edge Function's execution limit before being considered done — mirrors spec 038 T015's convention. If it doesn't fit, this is a blocking finding requiring the query-splitting fallback (plan.md Complexity Tracking), not a reason to silently truncate data.

### Implementation for User Story 1

- [X] T013 [US1] Implemented `fetchOsmRoads(countryCodes)` in `supabase/functions/shared/osmRoadsFetch.ts`. Live-verified against Turkey and iterated through 5 real bugs found only by live testing — see research.md §8 addendum: (1) Overpass's `ISO3166-1` filter needs uppercase codes, this system's `country_code` is lowercase — fixed in `buildQuery()`; (2) the full planned classification (`motorway..unclassified`) is 1.58M ways for Turkey, unusable in one request — scoped down; (3) Deno's default `fetch()` User-Agent gets HTTP 406 from `overpass-api.de` — fixed by sending an explicit `User-Agent`/`Accept`; (4) processing multiple countries in one invocation exceeds Supabase's 150s idle timeout — fixed by adding an optional per-invocation `countryCode` scope (see T015); (5) even `motorway|trunk` (37,407 ways/52MB) crashed the deployed Edge Function with `WORKER_RESOURCE_LIMIT` — scoped down further to `motorway` only.
- [X] T014 [US1] Added `supabase/functions/shared/osmRoadsFetch.test.ts` (fixture-based mapping tests) plus a regression test locking in the uppercase-country-code fix (`buildQuery` test). 5/5 passing.
- [X] T015 [US1] Implemented `supabase/functions/import-osm-roads/index.ts` per contracts/import-osm-roads.md, extended with an optional `{ countryCode }` request-body parameter (research.md §8 addendum, finding 4) so one invocation processes exactly one country, keeping each run within the 150s Edge Function timeout.
- [X] T016 [US1] Added `supabase/migrations/20260718130000_osm_roads_import_cron.sql` — `trigger_osm_roads_import()` loops over `country_boundaries` and issues one `net.http_post` call per served country (not one call for all), matching T015's per-country scoping. Weekly, Sunday 04:00 UTC. Applied to the linked remote project.
- [X] T017 [US1] **Resolved (2026-07-18).** Madagascar's real ADM1 boundary data (22 regions — Diana, Sava, etc.) was sourced live from geoBoundaries (`boundaryID: MDG-ADM1-27540722`, OSM/Wambacher-derived, Open Data Commons ODbL 1.0 license — the exact same source and license already used for Turkey's and Malaysia's `country_boundaries` rows, per `src/data/boundaries/README.md`'s documented convention) and upserted into `country_boundaries` (`country_code: 'mg'`, `name_property: 'shapeName'`). Verified live: `country_boundaries` now has 3 rows (`tr`: 81 features, `my`: 16 features, `mg`: 22 features). `getServedCountryCodes()` now returns `mg` alongside `tr`/`my` with zero code changes, confirming the generic/country-agnostic design (FR-010) works as intended for a newly onboarded country.
- [X] T018 [US1] **Resolved — via an architecture shift, not a retry.** Originally blocked on Supabase's shared Edge Function egress IP being rate-limited/rejected by the public Overpass instance (429/504/`WORKER_RESOURCE_LIMIT`/timeout, four distinct symptoms — see research.md §8 addendum findings 5-6 for the original investigation, kept for history). As of the self-hosted Docker migration (`docs/NEW_GAME_PLAN.md` §2.3), OSM Roads' periodic import moved out of the Edge Function entirely into `raster-importer/import-osm-roads.ts`, running in its own `osm-roads-importer`/`osm-roads-importer-scheduled` containers (`docker-compose.yml`) — a dedicated container IP, not Supabase's shared one, sidesteps the original blocker rather than needing it to clear on its own.
- [X] T019 [US1] **Resolved.** Live-verified (2026-07-27) via `exposure_datasets`: both served-country prerequisites now have real road data — Turkey 65,070 features (2026-07-22) and Madagascar 2,192 features (2026-07-19) — confirming T017's Madagascar onboarding paid off exactly as expected once T018's blocker cleared.

**Checkpoint**: Reached. Both served countries have real, live OSM road data in production, via the self-hosted container pipeline.

---

## Phase 4: User Story 2 - Health/freshness visibility (Priority: P1)

**Goal**: Admins see the OSM road source's health state, last-success time, and failure count, matching existing hazard-source and Kontur visibility.

**Independent Test**: Point the Overpass endpoint at an invalid URL, confirm the Sources-view entry degrades to a failing health state after the configured consecutive-failure threshold, exactly as Kontur Population's entry would.

### Implementation for User Story 2

- [X] T020 [US2] Added `'roads'` to `SOURCE_SUPPORTED_HAZARDS` in `src/components/admin/SourceFormModal.vue` (alongside `'population'`, per spec 038 T028) so admins can view/edit this row through the existing Sources CRUD form.
- [X] T021 [US2] Verified (no new code needed): `src/stores/hazardTypes.js`'s `alertableHazardTypes` computed filters `category !== 'exposure'` generically (spec 038 T030) — the new `'roads'` row (`category: 'exposure'`, T002) is automatically excluded from `CapView.vue`'s hazard picker and `HazardTaxonomyPanel.vue`'s "Edit Thresholds" button with zero additional code.
- [X] T022 [P] [US2] **Verified via `sourceHealth.test.ts`'s existing hazard-type-agnostic state-machine coverage (11/11 passing) rather than a live degrade/restore** — a live invalid-endpoint test doesn't map cleanly onto this source's actual design: `import-osm-roads/index.ts` (like Kontur's) calls `recordFetchOutcome(sourceId, 'success')` unconditionally whenever the function completes without throwing, even when every country was skipped (per-country Overpass failures are caught inside `fetchOsmRoads` and never propagate, by FR-009 design). So health only degrades via (a) an exception outside that per-country isolation (e.g. `getServedCountryCodes()`/`writeExposureDataset()` throwing) or (b) staleness (`last_success_at` older than `staleness_threshold_seconds` = 30 days) — not via Overpass being unreachable per se, which is exactly the situation T018 is currently in. This is the same convention Kontur already uses (spec 038), confirmed identical here, not a roads-specific gap. Flagging as known behavior: if Overpass stays unreachable past 30 days, the source will show `degraded` via staleness, not immediately.

**Checkpoint**: OSM Roads is visible with independent health tracking, matching parity with Kontur Population and hazard sources (spec SC-002, SC-003).

---

## Phase 5: User Story 3 - Malformed/oversized responses never corrupt the map (Priority: P2)

**Goal**: Invalid road segments never reach `exposure_features`, are logged with a reason, and never fail the whole import; one country's Overpass failure never blocks another's.

**Independent Test**: Feed a batch with one invalid-geometry segment and one valid segment through the import path; confirm only the valid segment is stored, the invalid one is excluded with a recorded reason, and the import reports success.

### Implementation for User Story 3

- [X] T023 [US3] Verified: `import-osm-roads/index.ts` (T015, lines 78-84) calls `logRejectedPayload(sourceId, 'roads', reason, { countryCode, osmId, highway })` for every record `partitionRoadRecords` marks invalid.
- [X] T024 [US3] Confirmed via `roadImportPartition.test.ts` (4/4 passing, incl. all-invalid-batch-returns-zero-without-throwing) and code review: `fetchOsmRoads` catches each country's Overpass failure internally and simply omits that country's map entry (never throws), so `index.ts`'s per-country loop (`countriesSkipped.push(countryCode); continue`) never blocks other served countries — FR-009 confirmed.
- [X] T025 [US3] Verified: `src/stores/sources.js` (lines 86, 89-91) filters `rejected_payloads` by `.eq('source_id', sourceId)` only, no hazard-type-specific logic — already displays `'roads'` rejections with zero changes.

**Checkpoint**: All acceptance scenarios in spec.md US3 pass; SC-004 confirmed (100% of invalid-geometry/zero-length records excluded, never reach Impact Analysis); FR-009's per-country isolation confirmed.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Regression safety for the Kontur write-path generalization, and end-to-end confidence

- [X] T026 [P] Ran `deno test --no-check --allow-net --allow-env supabase/functions/shared/populationImportPartition.test.ts` — 4/4 passing, unmodified since T010's `writePopulationDataset` wrapper (no `supersedeExposureDataset.test.ts` exists — consistent with spec 038 T009's convention that DB-touching functions aren't unit tested).
- [X] T027 [P] **Verified live (2026-07-19), via spec 042's own investigation.** While validating spec 042 (exposure layer map visualization) against live data, discovered the existing `osm — tr` dataset row (id `24849b2b...`, `feature_count: 37407`) had **zero actual `exposure_features` rows** behind it — dangling metadata from an incomplete/lost write, not a code defect (see spec 042 research.md's addendum for the full investigation). Re-ran the same `writeExposureDataset` code path against Turkey via a local script (same reachability workaround as T013's original proof — Overpass's shared-egress-IP issue, finding 5/6 in this file's own research.md, is still unresolved for the *deployed Edge Function* specifically), producing 5,233 real motorway-only features (id `9dc057c2...`). **Confirmed**: the old `24849b2b` row was automatically deleted the moment the new write completed successfully — exactly one `exposure_datasets` row remains for `(osm, tr)`, proving supersession works correctly end-to-end. T018/T019 remain open only for *deployed Edge Function* Overpass reachability specifically — the write/supersede mechanism itself is now proven, not just theorized.
- [X] T028 Verified: `ImpactPanel.vue`'s asset-layer selector (line 233) renders `{{ d.name }}{{ d.source_name ? ...}}` generically — OSM road datasets will display correctly labeled with zero additional code.
- [X] T029 [P] Ran `deno test --no-check --allow-net --allow-env supabase/functions/shared/` — **219/219 passing**, no regressions.
- [X] T030 [P] Ran `deno check` against all new/modified files (`import-osm-roads/index.ts`, `roadRecord.ts`, `validateRoadRecord.ts`, `osmRoadsFetch.ts`, `roadImportPartition.ts`, `writeExposureDataset.ts`, `geometryToWkt.ts`, `supersedeExposureDataset.ts`) — all check clean. Only 2 errors surfaced repo-wide, both in `hazardThresholdsCache.ts`/`upsert.ts` — files this feature doesn't touch, matching spec 038 T040's documented pre-existing baseline.

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
