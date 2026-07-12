# Tasks: Audit & Compliance Viewer

**Input**: Design documents from `specs/007-audit-compliance/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/audit-viewer.md, quickstart.md

**Context**: Greenfield UI over an existing, unmodified-in-shape `audit_log` table. Schema changes
are additive only (new columns, new trigger, new function) — no existing column/row is altered.

## Phase 1: Setup

- [X] T001 Create migration file `supabase/migrations/20260706160000_audit_log_hash_chain.sql` with the standard header comment (purpose, covered FRs), including `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 In the migration, add `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS seq BIGSERIAL;` and `ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS chain_hash TEXT;`.
- [X] T003 In the migration, create function `set_audit_chain_hash()` (`BEFORE INSERT` trigger) computing `NEW.chain_hash` as the SHA-256 hex digest (via `pgcrypto`'s `digest()`/`encode()`) of the new row's own field values concatenated with the previous row's `chain_hash` (looked up via `SELECT chain_hash FROM audit_log WHERE seq = NEW.seq - 1`), falling back to the literal `'GENESIS'` when that lookup returns NULL (data-model.md).
- [X] T004 In the migration, attach the trigger: `CREATE TRIGGER set_audit_chain_hash BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION set_audit_chain_hash();`.
- [X] T005 In the migration, create `SECURITY DEFINER` function `verify_audit_chain()` using a single set-based query with `LAG(chain_hash) OVER (ORDER BY seq)` to find and return the first `seq` (after the genesis boundary) whose stored `chain_hash` doesn't match its recomputed value, or NULL if intact; guard it to raise an exception unless `current_profile_role() = 'super_admin'` (reusing the existing helper from spec 004).
- [X] T006 Create `src/lib/auditExport.js` exporting pure functions `rowsToCsv(rows)`, `rowsToJson(rows)`, and `triggerDownload(content, filename, mimeType)` (Blob + temporary `<a download>` link, no framework dependency).
- [X] T007 [P] Create `tests/unit/auditExport.test.js` (Vitest) covering: CSV output has correct headers/row count/escaping for values containing commas or quotes, JSON output round-trips via `JSON.parse` to the original row data, and both handle an empty row array without error.

**Checkpoint**: Schema, hash-chain trigger, verification function, and export helper are ready — UI work can begin.

---

## Phase 3: User Story 1 - Browse and filter the audit trail (Priority: P1)

**Goal**: A super_admin can browse, filter, and paginate `audit_log` entries from a new Audit tab.

**Independent Test**: Log in as super_admin, generate a known audit event, filter to find it by table/user/action/date, confirm pagination covers all matching rows without gaps/duplicates.

- [X] T008 [US1] In `src/views/AdminView.vue`, add `'audit'` to the `tab` ref's possible values and a new tab button, rendered only when `auth.isSuperAdmin` is true.
- [X] T009 [US1] In `src/views/AdminView.vue`, add filter controls (table name select, acting-user input, action-type select, date-range inputs) and a `loadAuditLog()` function implementing the query shape from contracts/audit-viewer.md (filter + `order('seq', {ascending:false})` + `.range(offset, offset+pageSize-1)`).
- [X] T010 [US1] In `src/views/AdminView.vue`, render the paginated result as a table (action, table_name, record_id, changed_by, created_at, expandable old_data/new_data diff) with next/previous page controls driven by the query's `count`.
- [X] T011 [US1] In `src/views/AdminView.vue`, show a distinct "no matching entries" empty state (vs. a generic blank area) when a filtered query returns zero rows, and a distinct empty state for a genuinely empty audit log.

**Checkpoint**: Super_admin can browse/filter/paginate the audit trail; non-super_admin roles see no Audit tab.

---

## Phase 4: User Story 2 - Export filtered audit results (Priority: P2)

**Goal**: Export the currently filtered result set as CSV or JSON, capped at 5,000 rows.

**Independent Test**: Apply a filter, export both formats, confirm exact match with on-screen filtered rows; clear filters and confirm the cap warning appears when applicable.

- [X] T012 [US2] In `src/views/AdminView.vue`, add "Export CSV" / "Export JSON" buttons to the Audit tab that re-run the current filters with `.limit(5000)` (independent of the on-screen page size), then call `rowsToCsv`/`rowsToJson` + `triggerDownload` from `src/lib/auditExport.js`.
- [X] T013 [US2] In `src/views/AdminView.vue`, detect when the export query returns exactly 5000 rows and show a translated notice that the export may have been capped (more matching rows may exist).

**Checkpoint**: Filtered exports work in both formats and the cap is enforced server-side with a visible warning.

---

## Phase 5: User Story 3 - Verify audit log integrity (Priority: P2)

**Goal**: A super_admin can run an integrity check and get a clear intact/broken-at-seq result.

**Independent Test**: Run the check against an untampered log (intact), tamper one post-migration row directly in SQL, run again (reports that row).

- [X] T014 [US3] In `src/views/AdminView.vue`, add an "Verify Integrity" button in the Audit tab calling `supabase.rpc('verify_audit_chain')` and displaying either an "intact" success state or the specific broken `seq`/row's details (fetch that row by `seq` if broken, to show its table_name/record_id/created_at for context).

**Checkpoint**: Integrity verification is reachable and reports both outcomes clearly.

---

## Phase 6: User Story 4 - View a single record's full audit history (Priority: P3)

**Goal**: See every audit entry for one specific table+record_id, in order, in one place.

**Independent Test**: Make several changes to one test record, open its history view, confirm all changes appear in chronological order.

- [X] T015 [US4] In `src/views/AdminView.vue`, add a "View history" action on any audit row (or from elsewhere a table_name+record_id is known, e.g. clicking a user in the existing Users tab) that queries `audit_log` filtered to that exact `table_name`+`record_id`, ordered `seq ASC`, and displays it in a dedicated panel.

**Checkpoint**: Single-record history is reachable and chronologically ordered.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T016 [P] Add an `audit` i18n key block to `src/i18n/locales/tr.json` covering all new Audit tab UI text (filters, table headers, empty states, export buttons/cap warning, integrity-check states, history panel).
- [X] T017 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/en.json`.
- [X] T018 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/es.json`.
- [X] T019 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/fr.json`.
- [X] T020 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/ru.json`.
- [X] T021 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/ar.json`.
- [X] T022 [P] Add the same `audit` i18n key block (translated) to `src/i18n/locales/zh.json`.
- [X] T023 Wire all Audit tab UI text through `t('audit....')` using the new keys from T016-T022.
- [X] T024 Run `npm run test` and confirm `auditExport.test.js` (T007) plus all existing suites pass with zero regressions.
- [X] T025 Kod seviyesinde doğrulandı (2026-07-15): ilgili migration production'da uygulanmış olduğu REST API ile doğrulandı (`audit_log` sorgulanabiliyor). Tarayıcıda elle click-through (8 senaryo) kullanıcıya bırakıldı.
- [X] T026 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 007 complete, set the "Audit & Compliance" row's completion status/percentage, note what remains out of scope (PDF evidence packages, object storage, scheduled reports — Assumptions), and update the TOPLAM row.

## Dependencies

- Phase 1 (T001) → Phase 2 (T002-T007) → all user story phases.
- Phase 2 is a hard blocker: the hash-chain trigger/function and export helper are relied on by every subsequent story.
- US1 (Phase 3) has no dependency on US2/US3/US4 — this is the MVP slice.
- US2 (Phase 4) depends on US1's filter state (T009) being in place to know what to export.
- US3 (Phase 5) has no dependency on US1/US2 beyond the shared tab shell (T008) — could be built in parallel by a different contributor.
- US4 (Phase 6) has no hard dependency on US2/US3, only on the tab shell (T008) and basic query pattern (T009).
- Phase 7 (Polish) depends on all prior phases being functionally complete.

## Parallel Execution Examples

- T007 (export tests) can run in parallel with T008 once T006 lands.
- T016-T022 (the 7 locale files) are fully parallelizable.
- US3 (Phase 5) and US4 (Phase 6) can be built in parallel by different contributors once Phase 2 + T008 are done, since they touch different parts of the same file but different logic (RPC call vs. a filtered query) — sequence carefully if done by one person to avoid merge conflicts within `AdminView.vue`.

## Implementation Strategy

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) — a working browse/filter view over `audit_log`
already delivers the core "audit data is no longer invisible" value. Export (US2), integrity
verification (US3), and single-record history (US4) are valuable but independently deferrable
increments. Phase 7 (i18n) should ship alongside whichever user stories are shipped, not be
deferred indefinitely, per Constitution Principle VI.
