---

description: "Task list for Drill Response-Time and Participation Metrics (spec 017)"
---

# Tasks: Drill Response-Time and Participation Metrics

**Input**: Design documents from `/specs/017-drill-response-metrics/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ack-dispatch.md,
contracts/drill-metrics.md, quickstart.md

**Tests**: Included — `drillMetrics.ts`'s edge cases (FR-002/FR-005: "no response" vs `0`, "zero sent" vs `0%`) are
exactly the class of easy-to-get-subtly-wrong logic the constitution flags for test-first treatment.

**Organization**: Tasks are grouped by user story (US1–US2) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/functions/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707190000_dispatch_receipts_ack.sql` with a header comment describing scope (drill response/participation metrics, spec 017)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `acknowledged_at` column and the pure metrics module are shared by both user stories — US1 reads
timestamps that already exist plus needs the pure response-time function; US2 needs the column to exist before
anything can write to it.

**⚠️ CRITICAL**: Complete this phase before starting either user story.

- [X] T002 Add `acknowledged_at TIMESTAMPTZ NULL` column to `dispatch_receipts` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in the new migration — idempotent, no RLS policy change (no `anon` grant is added — the only writer is the new Edge Function using a service-role client, per research.md)
- [X] T003 [P] Create `supabase/functions/shared/drillMetrics.ts` implementing `computeResponseTimeSeconds(startedAt, firstAlertAt)` and `computeAckRate(sent, acknowledged)` per `contracts/drill-metrics.md` (both pure, no I/O)
- [X] T004 [P] Create `supabase/functions/shared/drillMetrics.test.ts` (Deno.test) covering the 5 test cases from `contracts/drill-metrics.md`'s table

**Checkpoint**: The column exists and the metrics math is implemented and tested — nothing calls it from `AdminView.vue` or the Edge Functions yet.

---

## Phase 3: User Story 1 - See how quickly the team responded during a drill (Priority: P1) 🎯 MVP

**Goal**: Ending a drill shows the elapsed time from drill start to the first exercise alert issued, or clearly
indicates no response occurred.

**Independent Test**: Start a drill, issue an exercise alert after a known interval, end the drill, and confirm the
summary shows a matching response time (quickstart.md Scenario 1); confirm a drill ended with no alert shows "no
data" rather than zero (Scenario 2).

### Implementation for User Story 1

- [X] T005 [US1] In `src/views/AdminView.vue`'s `endDrill()`, add a query fetching the earliest `created_at` among `is_exercise=true` CAP drafts for the drill's `country_code` at or after `drill.started_at` (sibling query to the existing `alerts_issued` count query), pass the result through `computeResponseTimeSeconds()`, and add `response_time_seconds` to the `summary` object written to `drill_sessions`
- [X] T006 [US1] In `src/views/AdminView.vue`'s drill card template (near the existing `Süre: ... · Uyarı: ...` line), display the response time — a clear "no response" state when `response_time_seconds` is `null`, otherwise a human-readable duration
- [X] T007 [P] [US1] Add i18n keys for the response-time label and its "no data" state to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)

**Checkpoint**: User Story 1 fully functional and independently testable — response time is visible without any acknowledgment infrastructure existing yet.

---

## Phase 4: User Story 2 - See whether alert recipients acknowledged the drill's alerts (Priority: P2)

**Goal**: A one-click link in dispatched emails lets a recipient confirm receipt; ending a drill shows the
acknowledgment rate among exercise dispatches that were actually sent.

**Independent Test**: Dispatch an exercise alert to a contact, visit that dispatch's ack link, end the drill, and
confirm the summary shows the correct acknowledged/sent counts (quickstart.md Scenarios 3–4); confirm re-visiting
the link and visiting a garbage link both behave harmlessly (Scenario 5).

### Implementation for User Story 2

- [X] T008 [US2] Create `supabase/functions/ack-dispatch/index.ts` per `contracts/ack-dispatch.md`: `GET` handler reading `receipt_id` from the query string, using a service-role client to conditionally `UPDATE dispatch_receipts SET acknowledged_at = NOW() WHERE id = receipt_id AND acknowledged_at IS NULL`, always returning a `200` self-contained HTML response regardless of outcome (missing/garbage ID, already-acknowledged, or newly-acknowledged all render the same friendly page)
- [X] T009 [US2] Register `ack-dispatch` in `supabase/config.toml` with `verify_jwt = false` (the only such entry in the project — research.md explains why this one function needs it)
- [X] T010 [US2] In `supabase/functions/dispatch-alert/index.ts`, thread `receipt.id` into `buildEmailBody()` (called after the receipt row is already inserted, so the ID is available) and append an acknowledgment link built as `Deno.env.get('SUPABASE_URL') + '/functions/v1/ack-dispatch?receipt_id=' + receipt.id` (analysis finding H1 — NOT `PUBLIC_PORTAL_URL`, which is a distinct, unrelated env var already used elsewhere in this file for the portal link; matches `contracts/ack-dispatch.md`'s endpoint exactly) to the email body's existing HTML — WhatsApp mock channel is unaffected (spec.md scope: email path only)
- [X] T011 [US1+US2] In `src/views/AdminView.vue`'s `endDrill()`, add a query fetching the **set** of `cap_drafts.id` matching the same filter T005 uses (`is_exercise=true AND country_code=drill.country_code AND created_at >= drill.started_at`) — a separate query for IDs, not a reuse of T005's single `MIN(created_at)` aggregate (analysis finding M1) — then count `dispatch_receipts` rows joined through `dispatch_jobs.cap_draft_id IN (that ID list)` with `status IN ('sent','delivered')` (sent count) and with `acknowledged_at IS NOT NULL` (acknowledged count), pass both through `computeAckRate()`, and add the result to `summary`
- [X] T012 [US1+US2] In `src/views/AdminView.vue`'s drill card template, display the acknowledgment rate (e.g. "3 / 5") or a clear "no data" state when `computeAckRate()` returned `null`
- [X] T013 [P] [US2] Add i18n keys for the acknowledgment-rate label, its "no data" state, and the `ack-dispatch` confirmation page's own text (rendered directly by the Edge Function, so these strings live as constants in `ack-dispatch/index.ts` itself, not the Vue i18n system — Deno Edge Functions don't share the frontend's i18n runtime; a short comment in the function notes this is intentionally English-only for v1, consistent with the project's existing English-only Edge Function response bodies e.g. `dispatch-alert`'s email template)

**Checkpoint**: Both user stories independently functional — acknowledgment infrastructure exists and feeds the same drill summary response time already displays.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 Run `npm run test` and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` (established project command) and confirm all existing and new tests pass with no regressions
- [X] T015 Run `npm run build` and confirm a clean build
- [X] T016 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Preparedness, Drill & Response module's remaining-gap line (response-time timers, participation/acknowledgment metrics) is now closed — update its completion percentage accordingly (simulated hazard injection remains out of scope, unaffected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (column + pure metrics module underpin
  both)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; T011/T012 additionally depend on T005's query pattern
  existing in `endDrill()` (same function, extended incrementally) — so in practice User Story 1 should land
  first even though User Story 2's own infrastructure (T008–T010) has no such dependency
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T003/T004 (pure module + its tests) can be scaffolded in parallel, though T004 asserts against T003's actual
  output
- T007 (i18n) can run in parallel with T005/T006
- T008/T009/T010 (the ack Edge Function, its config registration, and the email-body change) can mostly proceed
  in parallel, though T010 needs T008 to exist for the link format to be meaningful
- T013 (i18n) can run in parallel with T011/T012

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (`acknowledged_at` column + `drillMetrics.ts`)
3. Complete Phase 3: User Story 1 (response-time display)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–2 — drills now show real response-time data with zero new
   public surface area

### Incremental Delivery

1. Setup + Foundational → column exists, metrics math is tested
2. Add User Story 1 → validate → response time visible in drill summaries
3. Add User Story 2 → validate → one-click ack link live, ack rate visible in drill summaries
4. Polish (i18n, docs, test/build verification)

---

## Notes

- No new table — `acknowledged_at` is a single additive column; `drill_sessions.summary` is already schemaless JSON
- `ack-dispatch` is the first and only Edge Function in this project with `verify_jwt = false` — flagged explicitly
  in code and in `supabase/config.toml` so it isn't mistaken for an oversight later
- Migrations are provided as exact CLI commands to the user for manual application once implementation is complete
- Commit only when explicitly requested by the user
