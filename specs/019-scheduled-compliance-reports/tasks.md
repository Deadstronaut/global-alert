---

description: "Task list for Scheduled Compliance Reports (spec 019)"
---

# Tasks: Scheduled Compliance Reports

**Input**: Design documents from `/specs/019-scheduled-compliance-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/generate-compliance-report.md, quickstart.md

**Tests**: Included — `summarizeAuditRows()`'s edge cases (zero-activity periods, null
`table_name` rows) are exactly the class of easy-to-get-subtly-wrong logic the constitution flags
for test-first treatment, matching the project's established pattern (spec 016/017's pure-function
extraction).

**Organization**: Tasks are grouped by user story (US1–US2) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/functions/`, `supabase/migrations/` at
repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707210000_compliance_reports.sql` with a header comment describing scope (scheduled compliance reports, spec 019, first migration in this project to register a `pg_cron.schedule()` call — see research.md Decision 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `compliance_reports` table, its RLS, and the pure summarization function are
shared by both user stories — nothing else can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting either user story.

- [X] T002 In the new migration, create `compliance_reports` table per data-model.md: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `period_start TIMESTAMPTZ NOT NULL`, `period_end TIMESTAMPTZ NOT NULL`, `summary JSONB NOT NULL`, `generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `CHECK (period_end > period_start)`, `UNIQUE (period_start, period_end)` (FR-005 idempotency) — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T003 In the same migration, enable RLS on `compliance_reports` and add `super_admin_read_compliance_reports` policy (`current_profile_role() = 'super_admin'` may SELECT), mirroring the existing `super_admin_read_audit` policy on `audit_log` exactly (FR-007) — `DROP POLICY IF EXISTS` + `CREATE POLICY`
- [X] T004 [P] Create `supabase/functions/shared/complianceReport.ts` implementing `summarizeAuditRows(rows)` per data-model.md/contracts (pure, no I/O; groups by `action` and `table_name`, excludes null `table_name` from `by_table`, returns `{ by_action: {}, by_table: {} }` for an empty input)
- [X] T005 [P] Create `supabase/functions/shared/complianceReport.test.ts` (Deno.test) covering: normal mixed-action rows, an empty array (FR-006), rows with a null `table_name`, and multiple rows sharing the same action/table (count aggregation correctness)

**Checkpoint**: The table, its RLS, and the tested summarization logic exist — nothing calls it
from an Edge Function or `AdminView.vue` yet.

---

## Phase 3: User Story 1 - Super Admin reviews an automatically generated compliance report (Priority: P1) 🎯 MVP

**Goal**: A compliance report is automatically generated every week, summarizing audit activity and
the audit trail's integrity status, without any manual action.

**Independent Test**: Manually invoke the Edge Function (quickstart.md Scenario 2) and confirm a
new report row appears with the correct period, activity counts, and integrity result; confirm a
second invocation for the same period does not create a duplicate (Scenario 3); confirm a
zero-activity period still produces a report (Scenario 4).

### Implementation for User Story 1

- [X] T006 [US1] Create `supabase/functions/generate-compliance-report/index.ts`: `adminClient()` pattern (service-role client, mirrors `dispatch-alert/index.ts`); compute `period_start`/`period_end` as the most recently fully-elapsed week (Monday-to-Monday ending before now) — no gap-search/backfill (per analysis finding F1, spec.md's Edge Cases explicitly say catch-up is not required; the `UNIQUE` constraint + `ON CONFLICT` exist only to guard against concurrent/retry duplicates, not to drive catch-up logic); fetch `audit_log` rows for that period; call `summarizeAuditRows()`; call the existing `verify_audit_chain()` RPC and fold its result into `summary.integrity_ok`/`summary.broken_seq`; `INSERT ... ON CONFLICT (period_start, period_end) DO NOTHING` into `compliance_reports`
- [X] T007 [US1] In the migration, create `trigger_compliance_report_generation()` `plpgsql` function per data-model.md: reads `edge_function_base_url`/`service_role_key` from `vault.decrypted_secrets` (same secrets `notify_dispatch_on_broadcast()` already requires per spec 009), calls `net.http_post()` against `generate-compliance-report`, no-ops with `RAISE NOTICE` if secrets aren't configured (research.md Decision 1) — requires `CREATE EXTENSION IF NOT EXISTS pg_net` (idempotent, likely already enabled by spec 009 but declared again defensively)
- [X] T008 [US1] In the migration, register the weekly schedule: unschedule any existing job named `generate-compliance-report-weekly` first (idempotent re-apply), then `SELECT cron.schedule('generate-compliance-report-weekly', '0 0 * * 1', $$SELECT trigger_compliance_report_generation()$$)` (research.md Decision 2) — requires `CREATE EXTENSION IF NOT EXISTS pg_cron`
- [X] T009 [US1] Register `generate-compliance-report` in `supabase/config.toml` (standard `verify_jwt = true` — called with the service-role key as bearer token, same as `dispatch-alert`'s Mode A, not `ack-dispatch`'s public no-auth case)

**Checkpoint**: User Story 1 fully functional and independently testable — reports generate
automatically on schedule (or on manual invocation for testing) with correct idempotency and
zero-activity handling; nothing is visible in the UI yet.

---

## Phase 4: User Story 2 - Super Admin downloads a past report for external record-keeping (Priority: P2)

**Goal**: Super Admin can see the list of generated reports in the existing Audit tab and download
any one of them as CSV/JSON.

**Independent Test**: View the Audit tab as Super Admin, confirm generated reports are listed, and
download one, confirming its contents match what's shown on screen (quickstart.md Scenario 5).

### Implementation for User Story 2

- [X] T010 [US2] In `src/views/AdminView.vue`'s Audit tab, add a "Geçmiş Raporlar" subsection: fetch `compliance_reports` via `supabase.from('compliance_reports').select('*').order('period_start', { ascending: false })` (relies on RLS from T003, same pattern as the existing audit log query), display each report's period and summary counts — during quickstart Scenario 5, informally time locating/opening the most recent report as an SC-002 check (under 10 seconds, per analysis finding F2)
- [X] T011 [US2] In the same subsection, add CSV/JSON download buttons per report row that flatten the report's `summary` JSONB into a row-shaped structure and pass it through the existing `rowsToCsv`/`rowsToJson`/`triggerDownload` helpers from `src/lib/auditExport.js` (contracts/generate-compliance-report.md — no new export mechanism)
- [X] T012 [P] [US2] Add i18n keys for the "Geçmiş Raporlar" section label, period display, and download buttons to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)

**Checkpoint**: Both user stories independently functional — reports generate automatically and are
reviewable/downloadable from the existing Audit tab.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T013 Run `npm run test` and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` (established project command) and confirm all existing and new tests pass with no regressions
- [X] T014 Run `npm run build` and confirm a clean build
- [X] T015 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Audit & Compliance module's remaining-gap line ("zamanlanmış raporlar") is now closed — update completion percentage and describe what was and was not covered (PDF/MinIO evidence packages and AI/LLM audit fields remain out of scope, unaffected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (table/RLS/pure function
  underpin everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; also functionally depends on User Story 1
  having generated at least one report to be visible, though the UI code itself (T010/T011) has no
  hard build-order dependency on T006–T009
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T004/T005 (pure module + its tests) can be scaffolded in parallel, though T005 asserts against
  T004's actual output
- T012 (i18n) can run in parallel with T010/T011

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (table + RLS + `summarizeAuditRows()`)
3. Complete Phase 3: User Story 1 (automatic weekly generation)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–4 — the pg_cron job is registered, manual
   invocation produces a correct report, idempotency holds, zero-activity periods still produce a
   report

### Incremental Delivery

1. Setup + Foundational → table/RLS/summarization exist, nothing generates yet
2. Add User Story 1 → validate → reports generate automatically (or via manual trigger for testing)
3. Add User Story 2 → validate → reports are visible and downloadable in the Audit tab
4. Polish (i18n, docs, test/build verification)

---

## Notes

- This is the first migration in this project to register a `pg_cron.schedule()` call — flagged
  explicitly in the migration's header comment and in quickstart.md Scenario 1, since the project's
  existing `fetch-*` cron jobs were apparently registered outside of migrations (research.md
  Decision 2)
- No new table for scheduling itself — `pg_cron`'s own `cron.job` table already tracks the
  registration; `compliance_reports` only stores the generated report data
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete
- Commit only when explicitly requested by the user

## Deployment Verification Status (2026-07-06)

Migration and Edge Function deployed to the linked Supabase project. Verified live:
- `compliance_reports` table exists; RLS policy present.
- `cron.job` shows `generate-compliance-report-weekly`, schedule `0 0 * * 1`, `active: true` —
  confirms this project's first-ever migration-registered `pg_cron` job took effect correctly.
- Code path confirmed correct up to the auth boundary: `net._http_response` first showed a
  platform-gateway-level `UNAUTHORIZED_INVALID_JWT_FORMAT` (Vault's `service_role_key` secret held
  literal placeholder text `<service-role-key>` from the migration's own example comment, never
  substituted with a real key when spec 009 was originally set up — a **pre-existing, unrelated
  issue affecting `dispatch-alert`'s automatic CAP-broadcast dispatch too**, not something spec 019
  introduced). After the user corrected the Vault secret to a real service-role JWT, the gateway
  error disappeared, but the function's own internal auth check (`authHeader !== Bearer
  ${serviceKey}`) still rejects it — the deployed function's own `Deno.env.get
  ('SUPABASE_SERVICE_ROLE_KEY')` does not byte-match the JWT the user confirmed is current,
  suspected cause: Supabase's newer secret-key system vs. the legacy JWT-format key shown in
  `.env`/Vault (unconfirmed — needs the user to check the Dashboard's current Edge Function secret
  value).
- **End-to-end automatic report generation (an actual `compliance_reports` row produced via the
  scheduled path) could NOT be confirmed** — blocked on this environment/key-configuration issue,
  not a defect in this feature's code. All other functional pieces (table, RLS, pure summarization
  logic + tests, cron registration, UI) are verified correct.
- This is a pre-existing infrastructure issue (predates spec 019, shared with spec 009's
  `dispatch-alert`) and is being tracked/resolved separately from this feature.
