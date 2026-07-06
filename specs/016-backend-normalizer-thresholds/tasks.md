---

description: "Task list for Backend Ingestion Normalizers Read the Hazard Threshold Registry (spec 016)"
---

# Tasks: Backend Ingestion Normalizers Read the Hazard Threshold Registry

**Input**: Design documents from `/specs/016-backend-normalizer-thresholds/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/hazard-thresholds-cache.md, quickstart.md

**Tests**: Included — severity computation for real ingested hazard data is core data-quality logic (constitution
Principle IV), the same class of test-first zone as CAP export/dispatch matching.

**Organization**: Single user story (US1) — this spec has one priority-P1 story in spec.md; there is no US2/US3.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Two independent backend runtimes — `supabase/functions/shared/` (Deno/TypeScript) and
`server/src/processors/` (Node.js/JavaScript) — at repository root.

---

## Phase 1: Setup

- [X] T001 [P] Create `supabase/functions/shared/hazardThresholdsCache.ts` module skeleton (empty cache state: `thresholds`, `fetchedAt`, `refreshing`) per `contracts/hazard-thresholds-cache.md`
- [X] T002 [P] Create `server/src/processors/hazardThresholdsCache.js` module skeleton (same shape, Node/JS port) per `contracts/hazard-thresholds-cache.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Both cache modules must be able to fetch and expose registry data before `normalize()` in either
runtime can be taught to consult them.

**⚠️ CRITICAL**: Complete this phase before starting the user story.

- [X] T003 [P] In `supabase/functions/shared/hazardThresholdsCache.ts`, implement `getCachedBreakpoints(hazardTypeCode): Breakpoint[] | undefined` (synchronous, never throws), the exported **pure** `applyFetchResult(current, fetchResult): CacheState` merge function (analysis finding C1 — success replaces `thresholds`/`fetchedAt`, `null`/failure returns `current` unchanged), and a thin internal `refreshIfStale()` that awaits a service-role Supabase client fetch (same pattern as `getServiceClient()` in `upsert.ts`) and hands the outcome to `applyFetchResult()`, fire-and-forget, guarded by the `refreshing` flag (contract: `contracts/hazard-thresholds-cache.md`)
- [X] T004 [P] In `server/src/processors/hazardThresholdsCache.js`, implement the same `getCachedBreakpoints()`/`applyFetchResult()`/`refreshIfStale()` behavior using the Node aggregator's existing `@supabase/supabase-js` client setup
- [X] T005 [P] Create `supabase/functions/shared/normalize.test.ts` covering the 6 test cases from `contracts/hazard-thresholds-cache.md`'s table — test case 4 (refresh-failure-preserves-cache) calls the pure `applyFetchResult()` directly with a `null` fetch result, no network mocking needed (analysis finding C1); the other 5 cases exercise `getCachedBreakpoints()` against manually-constructed cache states
- [X] T006 [P] Create `server/src/processors/normalizer.test.js` (using Node's built-in `node --test` runner — no new dependency) covering the same 6 test cases for the Node/JS port, using the same `applyFetchResult()`-direct approach for test case 4

**Checkpoint**: Both cache modules exist, are independently correct, and are covered by tests — nothing in `normalize()` reads from them yet.

---

## Phase 3: User Story 1 - Admin's threshold change takes effect for real, ingested hazard data (Priority: P1) 🎯 MVP

**Goal**: Severity computed for automatically-ingested hazard events reflects the admin-configured
`hazard_thresholds` registry, with zero regression for uncustomized hazard types and zero ingestion failures if the
registry is unreachable.

**Independent Test**: Change a threshold for a hazard type via the admin screen, then trigger an ingestion for that
hazard type with a value in the changed range; confirm the resulting severity matches the new threshold (quickstart.md
Scenario 1), and confirm an uncustomized hazard type's severity is unchanged (Scenario 2).

### Implementation for User Story 1

- [X] T007 [US1] In `supabase/functions/shared/normalize.ts`, at the single call site where `severityFn(mag)` is invoked inside `normalize()` (analysis finding M1 — one call site, not per-entry): first call `getCachedBreakpoints(params.type)`; if defined, evaluate against those breakpoints using a pure `evaluateBreakpoints()` TS port (a direct port of `src/stores/hazardTypes.js`'s exported `evaluateBreakpoints()`, added as a new exported function in `normalize.ts` itself so `normalize.test.ts` can test it directly); if `undefined`, fall back to the existing `severityFn(mag)` call unchanged
- [X] T008 [US1] Apply the same change to `server/src/processors/normalizer.js`'s `severityFn(magnitude || 0)` call site, using a JS port of `evaluateBreakpoints()` added as an exported function in `normalizer.js` itself
- [X] T009 [P] [US1] Extend `supabase/functions/shared/normalize.test.ts` with cases 5–6 from the contract's table applied specifically to `normalize()`'s output (not just the cache module in isolation): a customized earthquake threshold changes computed severity; an uncustomized wildfire threshold produces the same severity as before this feature
- [X] T010 [P] [US1] Extend `server/src/processors/normalizer.test.js` with the same two `normalize()`-level cases for the Node/JS port

**Checkpoint**: User Story 1 fully functional — both runtimes' `normalize()` now consult the registry with a safe, zero-regression fallback.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T011 Run `npm run test` (frontend Vitest — confirms no accidental regression there) and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` (established project command) and confirm all existing and new Deno tests pass with no regressions
- [X] T012 Run `node --test src/processors/normalizer.test.js` from within `server/` (its own project root — `node --test` on a bare directory path failed to resolve from the repo root) and confirm the new Node test suite passes: 8/8
- [X] T013 Run `npm run build` and confirm a clean build
- [X] T014 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Hazard Taxonomy Admin module's remaining-gap line "backend normalize.ts/normalizer.js runtime'larının aynı registry'e bağlanması" is now closed — update its completion percentage accordingly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS the user story (both cache modules must exist and be
  correct before `normalize()` can safely consult them)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **Polish (Phase 4)**: Depends on User Story 1 being complete

### Parallel Opportunities

- T001/T002 (cache module skeletons, one per runtime) can run in parallel — different files, different runtimes
- T003/T004 (cache implementations) and T005/T006 (their tests) can each run in parallel across runtimes, though
  within a runtime the implementation should land before its own test file asserts against real behavior
- T007/T008 (wiring `normalize()` to the cache, one per runtime) can run in parallel
- T009/T010 (normalize()-level tests, one per runtime) can run in parallel, but T009 depends on T007 and T010
  depends on T008 (analysis finding M2 — each test file asserts against its own runtime's now-wired `normalize()`)

---

## Implementation Strategy

### MVP First (the only user story)

1. Complete Phase 1: Setup (cache module skeletons)
2. Complete Phase 2: Foundational (cache fetch/fallback logic + its own tests)
3. Complete Phase 3: User Story 1 (wire `normalize()` in both runtimes to the cache)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–4

### Incremental Delivery

1. Setup + Foundational → both cache modules exist and are independently correct
2. Add User Story 1 → validate → both runtimes' real severity computation is now registry-driven with safe fallback
3. Polish (test/build verification, docs)

---

## Notes

- No new table, no new Edge Function, no new admin UI — this closes a follow-up explicitly deferred by spec 010
- Cache modules are intentionally NOT shared between the two runtimes (different module systems/deployable units,
  consistent with `normalize.ts`/`normalizer.js` themselves already being independently-synced "mirror" files)
- Commit only when explicitly requested by the user
