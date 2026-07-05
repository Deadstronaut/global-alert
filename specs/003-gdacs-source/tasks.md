---

description: "Task list for GDACS Global Data Source"
---

# Tasks: GDACS Global Data Source

**Input**: Design documents from `specs/003-gdacs-source/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/fetch-gdacs.md, quickstart.md

**Tests**: Constitution's non-negotiable test-first zones (dedup, severity mapping, CAP validation,
proximity calc) do not apply directly to this feature — the one genuinely new piece of logic
(`gdacsSplit()`'s routing/drop behavior) is still test-covered below as good practice, mirroring
001's precedent of testing new shared helpers, without re-testing the already-covered health
state machine or dedup logic from 001.

**IMPORTANT — architecture revised during implementation (see research.md §6–§7, plan.md Summary):**
Task descriptions below still say `fetch-gdacs/index.ts` in places — this file was **never
created**. GDACS required integration into the 4 existing single-hazard functions instead of a
standalone function, because this app's deduplication runs in-memory inside each function and a
separate `fetch-gdacs` would never see, e.g., `fetch-earthquakes`'s USGS batch to dedupe against.
Wherever a task says "`fetch-gdacs/index.ts`", read it as "the relevant one of
`fetch-earthquakes`/`fetch-wildfires`/`fetch-floods`/`fetch-droughts`/`index.ts`" per
contracts/fetch-gdacs.md's per-function breakdown. `logRejectedPayload()` for dropped TC/VO
categories was replaced with `console.log` + response `meta.droppedCategories` (research.md §7 —
the `rejected_payloads.hazard_type` CHECK constraint doesn't accept TC/VO). All tasks below are
marked complete against the corrected design, not the original text.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Phase 1: Setup

**Purpose**: Confirm the exact GDACS endpoint this feature will call

- [X] T001 Confirm and record the exact GDACS GeoJSON event-list endpoint URL and query parameters to use (base: `gdacsapi/api/events/geteventlist/SEARCH`, per research.md §1) — decide whether to request all 6 categories (`EQ;TC;FL;VO;DR;WF`) and let `gdacsSplit()` filter, or request only the 4 in-scope categories at the query-string level; either is valid, document the choice as a one-line comment in the eventual `fetch-gdacs/index.ts`

**Checkpoint**: Endpoint URL finalized, ready for implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared splitting logic every user story depends on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T002 [P] Create `supabase/functions/shared/gdacsSplit.ts` implementing `gdacsSplit(features)` per contracts/fetch-gdacs.md and data-model.md's `GdacsSplitResult` shape: routes `eventtype` `EQ`→`earthquake`, `WF`→`wildfire`, `FL`→`flood`, `DR`→`drought`; routes any other value (`TC`, `VO`, unrecognized) into `dropped` with a reason string; never throws; does not mutate input; handles an empty `features` array
- [X] T003 [P] Write `supabase/functions/shared/gdacsSplit.test.ts` (Deno test) covering: correct routing of one record per in-scope category, `TC` and `VO` both landing in `dropped` with a reason mentioning the eventtype, an empty-array input producing all-empty buckets, and an unrecognized/unknown eventtype also landing in `dropped` (not silently ignored) — write and confirm this passes before wiring T002 into the Edge Function

**Checkpoint**: `gdacsSplit()` exists and is unit-tested — both US1 (routing) and US2 (dropping) can now proceed.

---

## Phase 3: User Story 1 - Global hazard coverage without a country tie (Priority: P1) 🎯 MVP

**Goal**: GDACS's in-scope events (earthquake, wildfire, flood, drought) flow into this app's existing hazard views, and GDACS appears as a global source to every admin.

**Independent Test**: After seeding GDACS's `data_sources` rows and running one fetch cycle, confirm GDACS earthquake/wildfire/flood/drought events appear in their respective map layers, and that any admin (including one with zero local sources) sees GDACS in the Sources tab's Global group.

### Implementation for User Story 1

- [X] T004 [US1] Create `supabase/functions/fetch-gdacs/index.ts` following the exact structure of existing `fetch-*` functions (e.g. `fetch-wildfires/index.ts`): resolve 4 source ids via `resolveSourceId(hazardType, 'GDACS')` for `earthquake`/`wildfire`/`flood`/`drought`; skip the whole fetch if none of the 4 are active (`isSourceActive()`); make one HTTP GET to the endpoint from T001 (`AbortSignal.timeout(20_000)`); on failure, call `recordFetchOutcome(id, 'failure', message)` for all 4 ids and return an error/partial response matching existing functions' shape; on success, call `gdacsSplit()` (T002), then for each in-scope bucket run `validatePayload(raw, hazardType)` → `normalize()` for valid records, `logRejectedPayload(sourceIdForThatType, hazardType, reason, raw)` for invalid ones (mirrors contracts/fetch-gdacs.md steps 1–6)
- [X] T005 [US1] Call `recordFetchOutcome(id, 'success')` for all 4 GDACS source ids after a successful HTTP fetch (regardless of how many individual records validated), and a single `upsertEvents()` call combining all 4 categories' normalized records, in `supabase/functions/fetch-gdacs/index.ts` (contracts/fetch-gdacs.md steps 8–9)
- [X] T006 [US1] Seed the 4 GDACS `data_sources` rows (`name: "GDACS"`, `hazard_type` in `earthquake`/`wildfire`/`flood`/`drought`, `country_code: null`, `poll_interval_seconds: 300` per research.md §5) via the existing admin Sources-tab CRUD (as `super_admin`) or a one-off SQL insert, per quickstart.md §1 — user applied the SQL insert directly to the live/shared Supabase project

**Checkpoint**: User Story 1 fully functional — GDACS's 4 in-scope hazard types flow into existing views, visible to every admin as a global source.

---

## Phase 4: User Story 2 - Out-of-scope hazard categories are safely dropped (Priority: P1)

**Goal**: GDACS's tropical cyclone and volcano events never get stored or crash the fetch — they are excluded with a recorded reason, same as a malformed record.

**Independent Test**: Feed a batch containing a TC event, a VO event, and an in-scope event through `fetch-gdacs`; confirm only the in-scope event is stored, the other two are excluded with a reason, and the fetch reports success for the in-scope portion.

### Implementation for User Story 2

- [X] T007 [US2] In `supabase/functions/fetch-gdacs/index.ts` (same file as T004/T005, sequential), for each entry in `gdacsSplit()`'s `dropped` array, log the exclusion and surface it in the response `meta.droppedCategories` array per contracts/fetch-gdacs.md §7 — **not** `logRejectedPayload()` as originally planned (discovered during implementation: `rejected_payloads.hazard_type` is CHECK-constrained to the 5 supported hazard types, and TC/VO aren't among them, so writing there would violate the constraint); confirm this runs even when `dropped` is the only non-empty bucket (spec Acceptance Scenario 3: an all-dropped fetch still reports a successful fetch, not a failure)

**Checkpoint**: TC/VO events are excluded and audited without affecting in-scope categories' success status; `gdacsSplit.test.ts` (T003) already covers the routing/drop logic itself, this task covers its wiring into the audit trail.

---

## Phase 5: User Story 3 - GDACS participates in existing health monitoring and deduplication (Priority: P2)

**Goal**: GDACS's 4 rows behave identically to any existing source for health tracking and are deduplicated against other sources reporting the same real-world event.

**Independent Test**: Point GDACS's endpoint at an invalid URL and confirm all 4 rows degrade together; feed a GDACS earthquake matching an already-ingested USGS earthquake and confirm only one is retained.

### Implementation for User Story 3

- [X] T008 [US3] Review `supabase/functions/fetch-gdacs/index.ts` (T004/T005) to confirm `recordFetchOutcome()` is invoked for all 4 GDACS source ids on both the success and failure paths of the single shared HTTP call — no new code expected if T004/T005 were implemented per contracts/fetch-gdacs.md, this is a verification checkpoint, not new logic
- [X] T009 [US3] Manually verify (per quickstart.md §4) that `upsertEvents()`'s existing per-hazard-type deduplication rule applies unmodified to GDACS records — no code change expected; confirm by feeding a GDACS earthquake within the existing distance/time window of an already-ingested USGS earthquake and checking only one row persists

**Checkpoint**: All three user stories independently functional — global coverage (US1), safe category exclusion (US2), and health/dedup parity (US3) all complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning multiple user stories

- [X] T010 [P] Run `deno test --no-check --allow-net --allow-env supabase/functions/shared/ supabase/functions/fetch-gdacs/` and confirm `gdacsSplit.test.ts` (T003) passes alongside existing 001-era Deno tests with no regressions
- [X] T011 [P] Verify the Sources tab (`AdminView.vue`/`SourceHealthCard.vue`) renders GDACS's 4 rows correctly in the Global group with no visual regression — no code change expected since 001/002 already render arbitrary `data_sources` rows generically
- [X] T012 Update `docs/iş planı istereler.txt`'s Data Ingestion & Monitoring row to note GDACS was added as a new global multi-hazard source (spec 003), building on specs 001/002

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: No dependency on Setup's endpoint-URL decision for the split logic itself (it operates on already-fetched features), but T001's decision informs how T004 constructs the request — BLOCKS all user stories in practice since `fetch-gdacs/index.ts` needs both
- **User Story 1 (Phase 3)**: Depends on Foundational (T002); is the MVP
- **User Story 2 (Phase 4)**: Depends on Foundational (T002/T003) and on US1's T004 existing (same file, sequential wiring) — not independently deployable before T004, but independently *testable* once both exist
- **User Story 3 (Phase 5)**: Depends on US1's T004/T005 (the recordFetchOutcome wiring it verifies); no new code of its own
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### Within Each User Story

- T002 (gdacsSplit) before T003 (its test) is not strictly required (test-first is fine here too) — either order works since this isn't a constitutional test-first zone
- T004 → T005 → T007 are sequential (same file, `fetch-gdacs/index.ts`), not parallel
- T006 (seeding data_sources rows) can happen in parallel with T004/T005's coding, but the seeded rows are needed before any real fetch can be tested end-to-end

### Parallel Opportunities

- T002 and T003 (gdacsSplit + its test) can be developed together — different concerns, same file dependency is minor
- T006 (seeding rows) is parallel to T004/T005 (writing the function) — different artifacts (data vs. code)
- T010 and T011 (Polish) are parallel to each other

---

## Parallel Example: Foundational Phase

```bash
# Can proceed together:
Task: "Create supabase/functions/shared/gdacsSplit.ts (T002)"
Task: "Write supabase/functions/shared/gdacsSplit.test.ts (T003)"
# Meanwhile, independently:
Task: "Seed the 4 GDACS data_sources rows (T006)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001 — confirm endpoint)
2. Complete Phase 2: Foundational (T002/T003 — gdacsSplit + test)
3. Complete Phase 3: User Story 1 (T004–T006 — the Edge Function + seeded rows)
4. **STOP and VALIDATE**: Run quickstart.md §2 — confirm GDACS events appear in existing hazard
   views and GDACS shows up as a global source for every admin
5. User Story 2 (T007) is a small, low-risk addition on top of the same file — recommended to
   include even in an MVP cut, since an unhandled TC/VO record would otherwise silently vanish
   without an audit trail (acceptable functionally, but loses the "why did this record disappear"
   diagnosability the rest of this system already guarantees)

### Incremental Delivery

1. Setup + Foundational → splitting logic ready
2. Add User Story 1 → validate independently → deploy (MVP)
3. Add User Story 2 → validate independently → deploy
4. Add User Story 3 (verification only) → confirm → deploy
5. Polish phase → final hardening pass, then seed rows into the live/shared Supabase project
   (a live-database action — per established project precedent, requires explicit user approval
   before running against the shared project, same as specs 001/002)

## Notes

- [P] tasks touch different files with no dependency on an incomplete task
- Commit after each task or logical group; stop at any checkpoint to validate that story alone
- Seeding the 4 `data_sources` rows into the **live, shared** Supabase project (as opposed to
  local/dev) requires the same explicit user go-ahead already established for specs 001/002 —
  do not insert into the live project without asking first
