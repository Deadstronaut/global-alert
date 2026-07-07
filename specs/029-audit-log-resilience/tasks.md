---
description: "Task list for Audit Log Resilience (spec 029)"
---

# Tasks: Denetim Günlüğü Dayanıklılığı

**Input**: Design documents from `/specs/029-audit-log-resilience/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not included as new Vitest files (this spec's logic is entirely SQL — a trigger function and a CHECK constraint); authorization/behavior is validated live via transactional DB testing (project's established technique) per quickstart.md.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

*(none — User Story 1 and User Story 2 are independent; both land in one migration file but neither blocks the other)*

---

## Phase 3: User Story 1 - Bir denetim kaydı yazılamazsa asıl işlem yine de tamamlanır (Priority: P1) 🎯 MVP

**Goal**: A failed audit-log write never blocks the triggering operation; failed writes are durably captured for later retry, retryable by a Super Admin.

**Independent Test**: Simulate an audit-log write failure, make a change to an audited table, confirm the change still succeeds and the failed audit entry appears in the dead-letter area; trigger a retry and confirm success removes it (quickstart.md Scenarios 1-4).

### Implementation for User Story 1

- [X] T001 [US1] Create `supabase/migrations/<timestamp>_audit_log_resilience.sql`: add `audit_log_dead_letter` table per data-model.md (`id, action, table_name, record_id, old_data, new_data, error_message, failed_at DEFAULT NOW()`), with RLS enabled and a `super_admin_read_audit_dead_letter` SELECT policy mirroring `audit_log`'s existing `super_admin_read_audit` policy exactly — no INSERT/UPDATE/DELETE policy for any role (only SECURITY DEFINER functions write to it)
- [X] T002 [US1] In the same migration file, update `log_table_change()` via the project's standard idempotent pattern (`DROP FUNCTION IF EXISTS` / `CREATE OR REPLACE FUNCTION`, as in `20260706190000_fix_log_table_change_missing_id.sql`): wrap each of the three `IF TG_OP = '...'` branches' `INSERT INTO audit_log` call in its own `BEGIN...EXCEPTION WHEN OTHERS THEN INSERT INTO audit_log_dead_letter (...) VALUES (...); END` block per data-model.md — on exception, insert the same action/table_name/record_id/old_data/new_data plus `SQLERRM` as `error_message`; the function's `RETURN NEW`/`RETURN OLD` at the end of each branch must execute unconditionally (success or dead-letter), never raising, so the triggering operation is never blocked (FR-001)
- [X] T003 [US1] In the same migration file, add `flush_audit_dead_letter() RETURNS TABLE(succeeded INT, failed INT)` SECURITY DEFINER function: `SET search_path = public`; raises an exception unless `current_profile_role() = 'super_admin'`; otherwise iterates every row in `audit_log_dead_letter`, attempts to `INSERT` it into `audit_log` (respecting the same columns), deletes the row from `audit_log_dead_letter` on success, counts successes/failures, returns the tally; `GRANT EXECUTE ... TO authenticated`. **Optional enhancement note (analysis F1, not required for this spec)**: this manual retry action isn't itself written as its own `audit_log` entry (only the flushed rows are) — acceptable for now since Constitution Principle V's named categories (login/edit/publish/role-change/drill-toggle) don't explicitly cover "retried a dead-letter queue"; a future iteration could add one `INSERT INTO audit_log (action, ...) VALUES ('AUDIT_FLUSH', ...)` call if stricter meta-auditing is ever desired.
- [X] T004 [US1] In `src/views/AdminView.vue`'s Denetim (Audit) tab, add a "Bekleyen Denetim Kayıtları" subsection (near the existing "Geçmiş Raporlar" subsection, ~line 1507): a count of `audit_log_dead_letter` rows (fetched via a plain `supabase.from('audit_log_dead_letter').select('*', { count: 'exact' })`, super_admin-only per existing RLS), and a "Tekrar Dene" button calling `supabase.rpc('flush_audit_dead_letter')`, displaying the returned `succeeded`/`failed` counts and refreshing the list afterward

**Checkpoint**: User Story 1 fully functional and independently testable — audit write failures never block the triggering operation, and a Super Admin can view/retry them.

---

## Phase 4: User Story 2 - Eksik bilgiyle bir denetim kaydı asla oluşturulamaz (Priority: P2)

**Goal**: Any resource-tied audit event (INSERT/UPDATE/DELETE) must specify which table/record it concerns; resource-independent events (LOGIN/EXPORT) remain unaffected.

**Independent Test**: Attempt to insert an audit_log row for a resource-tied action with no table_name/record_id — confirm rejection; attempt the same for a resource-independent action — confirm it's accepted (quickstart.md Scenarios 5-6).

### Implementation for User Story 2

- [X] T005 [US2] In the same migration file, add a `CHECK` constraint to `audit_log` per data-model.md. **Corrected during live application**: the first attempt (`table_name IS NOT NULL AND record_id IS NOT NULL`) failed against real data — `record_id` is legitimately `NULL` for tables whose PK isn't named `id` (`hazard_types`, `country_boundaries`, `integration_types`, confirmed via a live read-only query), since `log_table_change()` extracts it via `to_jsonb(NEW)->>'id'` (20260706190000 fix) which returns NULL for those. Corrected constraint: `ALTER TABLE audit_log ADD CONSTRAINT chk_audit_log_completeness CHECK (action NOT IN ('INSERT','UPDATE','DELETE') OR table_name IS NOT NULL);` — `table_name` alone is confirmed always non-null for every existing INSERT/UPDATE/DELETE row.

**Checkpoint**: User Story 2 fully functional and independently testable — incomplete resource-tied audit rows are rejected at the schema level, resource-independent rows are unaffected.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T006 [P] Add i18n coverage for all new user-facing text ("Bekleyen Denetim Kayıtları" section title, count label, "Tekrar Dene" button, retry result message) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T007 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T008 Run `npm run build` and confirm a clean build
- [X] T009 Validated quickstart.md Scenarios against the live Supabase instance after the user applied `20260709140000_audit_log_resilience.sql` (following a live-caught CHECK-constraint correction — see T005). Confirmed via transactional (BEGIN/temp-table-log/ROLLBACK) testing, zero permanent changes: (a) `audit_log_dead_letter` table, `chk_audit_log_completeness` constraint, and `flush_audit_dead_letter()` all exist; (b) a normal `profiles` UPDATE still logs correctly (audit_log grew by 1 row); (c) **all ~19 existing triggers bound to `log_table_change()` remain intact and functional** (the exact regression the CASCADE mistake would have caused, now confirmed absent); (d) the CHECK constraint correctly rejects an incomplete `INSERT`-type row (`table_name`/`record_id` both NULL) and correctly accepts a `LOGIN`-type row with `table_name` NULL; (e) `flush_audit_dead_letter()`'s super_admin-only guard logic matches the established pattern from specs 019/026/028 (SKIPped for lack of a second non-super_admin test profile in this environment, same limitation noted in those prior specs). Dead-letter table currently empty (expected — no real audit-write failures have occurred). Actual UI click-through (the "Tekrar Dene" button, live dead-letter count display) requires the user's own testing session.
- [X] T010 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Audit & Compliance module's audit-write-failure-resilience and audit-event-completeness-validation PRD requirements (MHEWS-FC-ERR-09, MHEWS-FC-OUV-06) are now closed — update completion percentage and narrative; note the three already-known out-of-scope items (PDF/S3 evidence packages, AI/LLM audit fields, configurable report period) remain unaffected

---

## Dependencies & Execution Order

### Phase Dependencies

- **User Story 1 (Phase 3)**: No dependencies — can proceed first
- **User Story 2 (Phase 4)**: No dependencies — independent of User Story 1, though both land in the same migration file (sequential file edits, not parallel)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- User Story 1 and User Story 2 touch different parts of the same migration file and could be conceptually drafted in either order, though they must be applied together as one file
- T006 (i18n) can run in parallel with T007/T008

---

## Implementation Strategy

### MVP First

1. Complete Phase 3: User Story 1 (dead-letter table + resilient trigger + retry UI) — this alone closes MHEWS-FC-ERR-09
2. **STOP and VALIDATE**: quickstart.md Scenarios 1-4

### Incremental Delivery

3. Complete Phase 4: User Story 2 (CHECK constraint) — closes MHEWS-FC-OUV-06
4. **STOP and VALIDATE**: quickstart.md Scenarios 5-6
5. Complete Phase 5: Polish (i18n/test/build/docs)

---

## Notes

- `audit_log`'s existing schema, RLS, and hash-chain (`verify_audit_chain()`, spec 007) are never modified — this spec is purely additive (one new table, one new CHECK constraint, one updated trigger function, one new retry function)
- The CHECK constraint and the dead-letter trigger logic are independent safety nets — a row that fails the CHECK constraint on insert into `audit_log` (e.g., during a `flush_audit_dead_letter()` retry) would itself need to be a valid, complete row to succeed; this is expected and correct (the constraint doesn't get bypassed for retries)
- Commit only when explicitly requested by the user
