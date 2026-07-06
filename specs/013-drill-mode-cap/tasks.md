---

description: "Task list for Drill Mode — CAP Exercise Isolation (spec 013)"
---

# Tasks: Drill Mode — CAP Exercise Isolation

**Input**: Design documents from `/specs/013-drill-mode-cap/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/drill-exercise.md, quickstart.md

**Tests**: No dedicated unit tests — the rule lives entirely in DB triggers with no pure-JS mirror needed (see plan.md's Testing rationale); verification is via `quickstart.md` live-instance scenarios, consistent with how this project handles DB-trigger-only logic with no accompanying Edge Function.

**Organization**: Tasks are grouped by user story (US1–US4) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707160000_drill_cap_exercise_isolation.sql` with a header comment describing scope (MHEWS-FR-0210, MHEWS-FR-0245, MHEWS-FR-0278)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `is_exercise` column and its auto-set trigger are the basis for every user story.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 Add `is_exercise BOOLEAN NOT NULL DEFAULT false` column to `cap_drafts` via `ALTER TABLE IF EXISTS ... ADD COLUMN IF NOT EXISTS` in the new migration
- [X] T003 Implement `set_cap_exercise_flag()` trigger function and `BEFORE INSERT ON cap_drafts` trigger in the same migration, per `contracts/drill-exercise.md` (computes `NEW.is_exercise` from an `EXISTS` check against `drill_sessions` matching `NEW.country_code` and `status = 'active'`); idempotent via `DROP TRIGGER IF EXISTS`/`DROP FUNCTION IF EXISTS` before create

**Checkpoint**: New alerts are now automatically flagged — User Story 1 is functionally complete once this phase lands; Stories 2–4 build on it.

---

## Phase 3: User Story 1 - CAP alerts automatically flagged as exercise during an active drill (Priority: P1) 🎯 MVP

**Goal**: A new CAP draft is automatically flagged exercise if an active drill exists for its country, with the flag fixed at creation time.

**Independent Test**: Start a drill for a country, author a new CAP draft for that country, confirm `is_exercise = true`; author one for a country with no active drill, confirm `is_exercise = false`; end the drill and confirm the first draft's flag is unchanged.

### Implementation for User Story 1

- [X] T004 [US1] Manually verify `quickstart.md` Scenario 1 against a dev Supabase instance: auto-flagging on insert, no flagging when no active drill, flag persists after the drill ends

**Checkpoint**: User Story 1 fully functional — this phase has no additional code beyond the Foundational trigger, since the flag-setting logic *is* the entire story.

---

## Phase 4: User Story 2 - Exercise alerts never trigger real dispatch (Priority: P1)

**Goal**: Broadcasting an exercise-flagged alert never creates a `dispatch_jobs`/`dispatch_receipts` row; non-exercise alerts dispatch unchanged.

**Independent Test**: Broadcast an exercise-flagged alert and confirm zero dispatch rows are created for it; broadcast a normal alert at the same time and confirm it dispatches exactly as before.

### Implementation for User Story 2

- [X] T005 [US2] Modify the existing `trg_notify_dispatch_on_broadcast` trigger's `WHEN` clause in the new migration (via `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` re-declaration referencing the existing, unmodified `notify_dispatch_on_broadcast()` function body) to add `AND NOT NEW.is_exercise`, per `contracts/drill-exercise.md`. Must appear AFTER T002/T003 within the migration file itself (not just after them in phase order), since this trigger's `WHEN` clause references the `is_exercise` column T002 adds and relies on T003's trigger already being in effect
- [X] T006 [US2] Manually verify `quickstart.md` Scenario 2 against a dev Supabase instance: exercise alert broadcast creates zero `dispatch_jobs`/`dispatch_receipts` rows; a simultaneously-broadcast non-exercise alert dispatches normally (no regression)

**Checkpoint**: User Stories 1 AND 2 both work independently — the safety-critical guarantee (no real dispatch for drills) is now DB-enforced.

---

## Phase 5: User Story 3 - Exercise alerts are clearly, visibly marked everywhere (Priority: P2)

**Goal**: Every exercise-flagged alert shows a persistent "EXERCISE ONLY" indicator at every status, everywhere it's displayed.

**Independent Test**: View an exercise-flagged alert in the Active and History tabs and confirm the badge is always visible; confirm a normal alert never shows it.

### Implementation for User Story 3

- [X] T007 [US3] Add an "EXERCISE ONLY" badge to each draft card in `src/views/CapView.vue`, rendered whenever `draft.is_exercise` is true, visible in both the Active and History tabs regardless of `draft.status`
- [X] T008 [US3] Manually verify `quickstart.md` Scenario 3: badge visible on the exercise draft in both tabs; absent on a normal draft

**Checkpoint**: All three of US1/US2/US3 independently functional.

---

## Phase 6: User Story 4 - Drill summary reflects how many alerts were actually issued (Priority: P3)

**Goal**: Ending a drill records the count of exercise CAP alerts authored during it in its summary.

**Independent Test**: Author N exercise alerts during a drill, end it, and confirm `summary.alerts_issued === N` (including `N = 0`).

### Implementation for User Story 4

- [X] T009 [US4] In `src/views/AdminView.vue`'s `endDrill()`, add a `SELECT COUNT(*) FROM cap_drafts WHERE is_exercise = true AND country_code = <drill.country_code> AND created_at >= <drill.started_at>` query and include the result as `alerts_issued` in the `summary` object passed to the existing `UPDATE drill_sessions` call
- [X] T010 [US4] Manually verify `quickstart.md` Scenario 4: summary reflects the correct count for both a drill with alerts authored and one with none

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T011 Add the `cap.exerciseOnly` i18n key (and any other new UI text from T007) to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — a small enough addition to hand-edit directly rather than warranting a new one-off generator script
- [X] T012 Run `npm run test` and confirm all existing Vitest tests still pass with no regressions (no new test files expected for this spec, per the Tests note above)
- [X] T013 Run `npm run build` and confirm a clean build
- [X] T014 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Preparedness, Drill & Response module's safety-critical gap (CAP exercise isolation) is now closed — update its completion percentage accordingly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (the `is_exercise` column and its auto-set trigger are the basis for everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only — trivially satisfied by Phase 2 itself, this phase is verification-only
- **User Story 2 (Phase 4)**: Depends on Foundational (needs `is_exercise` to exist to reference it in the `WHEN` clause)
- **User Story 3 (Phase 5)**: Depends on Foundational only (needs `is_exercise` to be fetched/rendered) — independent of Stories 2 and 4
- **User Story 4 (Phase 6)**: Depends on Foundational only (needs `is_exercise` to count against) — independent of Stories 2 and 3
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- Once Foundational (Phase 2) is done, Stories 2, 3, and 4 touch three different files (`supabase/migrations/...` for US2, `CapView.vue` for US3, `AdminView.vue` for US4) and have no dependency on each other — all three could be worked on in parallel by different contributors

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (auto-flagging trigger) — CRITICAL
3. Complete Phase 4: User Story 2 (dispatch suppression)
4. **STOP and VALIDATE**: `quickstart.md` Scenarios 1–2 — this alone closes the module's single
   safety-critical gap (no real dispatch during a drill), before any UI polish

### Incremental Delivery

1. Setup + Foundational → auto-flagging live (Story 1 done)
2. Add Story 2 → validate → dispatch isolation confirmed (the core safety guarantee)
3. Add Story 3 → validate → visible watermark confirmed
4. Add Story 4 → validate → summary count confirmed
5. Polish (i18n, docs, test/build verification)

---

## Notes

- No new table, no new Pinia store, no new admin panel — this spec is deliberately the smallest
  footprint of any spec so far, since it only constrains existing behavior (plan.md's Structure
  Decision)
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete, per this project's established practice
- Commit only when explicitly requested by the user
