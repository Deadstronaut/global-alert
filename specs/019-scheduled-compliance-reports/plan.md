# Implementation Plan: Scheduled Compliance Reports

**Branch**: `019-scheduled-compliance-reports` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-scheduled-compliance-reports/spec.md`

## Summary

Today, compliance review of the audit trail is entirely manual — a Super Admin must remember to
open the Audit tab and export a CSV/JSON, and there is no periodic, hands-off summary. This
feature adds a new `compliance_reports` table plus a `generate-compliance-report` Edge Function,
scheduled weekly via `pg_cron`, that summarizes `audit_log` activity for the elapsed week (counts
by action/table) and includes the existing `verify_audit_chain()` integrity result, storing one
report row per week (idempotent via a `UNIQUE (period_start, period_end)` constraint). Super Admin
reviews and downloads these reports from a small new section within the existing Audit tab, reusing
the already-built `rowsToCsv`/`rowsToJson`/`triggerDownload` export helpers — no new export
mechanism, no PDF, no email delivery, no configurable period, per spec.md's Assumptions.

## Technical Context

**Language/Version**: TypeScript (Deno Edge Function + shared module), JavaScript (Vue 3
`<script setup>`), SQL (PostgreSQL migration incl. `pg_cron.schedule`)

**Primary Dependencies**: Supabase JS client, PostgreSQL RLS + existing `current_profile_role()`
helper, `pg_cron` extension (already in use by this project for `fetch-*` Edge Functions, though
never previously registered via a migration file — this is the first)

**Storage**: PostgreSQL (Supabase) — one new table (`compliance_reports`), no changes to
`audit_log`'s existing shape

**Testing**: `Deno.test` for the new pure `summarizeAuditRows()` function (action/table_name count
aggregation) — matches the project's established "critical business logic gets a pure, testable
function" pattern (`applyFetchResult`, `computeResponseTimeSeconds`, `evaluateBreakpoints`, etc.).
No test precedent exists (or is added here) for RLS policies or `pg_cron` scheduling itself —
verified by running the Edge Function manually and inspecting `cron.job`/`cron.job_run_details`
per quickstart.md.

**Target Platform**: Web (existing Vue 3 SPA), Supabase-hosted Postgres + Deno Edge Functions

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project/service)

**Performance Goals**: N/A — weekly, low-frequency background job; the summarization query reads at
most one week of `audit_log` rows, an existing table with indexes already covering `created_at`
(`idx_audit_created_at`) and `table_name`/`created_at` (`idx_audit_table_name`) from spec 007.

**Constraints**: Report generation MUST be idempotent per period (FR-005) — enforced by a DB-level
`UNIQUE (period_start, period_end)` constraint plus `ON CONFLICT DO NOTHING`, not just
application-level care. Only Super Admin may read reports (FR-007) — reusing the existing
`current_profile_role() = 'super_admin'` RLS pattern, not inventing a new access model. No email
delivery, no PDF, no configurable period (all explicitly out of scope per spec.md).

**Scale/Scope**: 1 new table, 1 new shared pure-function module + its test, 1 new Edge Function,
1 `pg_cron.schedule()` registration, 1 new UI subsection in the existing Audit tab (no new tab).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — no hazard/disaster modeling
  touched. PASS.
- **Principle II (Scope Discipline)**: N/A — no dissemination channel, identity, or CAP change;
  explicitly does NOT add email delivery for reports (spec.md Assumptions), staying inside existing
  boundaries rather than expanding them. PASS.
- **Principle III (CAP v1.2 Compliance)**: N/A. PASS.
- **Principle IV (Data Quality & Normalization)**: N/A — no disaster/hazard event ingestion path
  touched; this reads `audit_log`, an already-normalized administrative log, not raw external data.
  PASS.
- **Principle V (Access Control & Auditability)**: Directly reinforced — reports are Super-Admin-
  only (FR-007), reusing the existing `current_profile_role()` RLS pattern rather than a new access
  model, and the report itself surfaces the existing audit-chain integrity check (FR-004),
  strengthening auditability rather than adding a new gap. PASS.
- **Principle VI (Accessibility & Internationalization)**: New UI strings (report list labels,
  period display, download buttons) MUST be added via the i18n system across all 7 locales,
  matching existing project convention. Planned in Phase 1/tasks. PASS (pending execution).
- **Principle VII (Performance & Resilience by Design)**: N/A — no polling/offline-cache path
  touched; the new background job runs weekly and reads a bounded (one-week) slice of an indexed
  table. PASS.
- **Principle VIII (Simplicity & YAGNI)**: Central to this plan's scoping — reuses the existing
  `pg_cron` mechanism (already present in this Supabase project for `fetch-*` jobs) rather than
  introducing a new scheduler/queue; reuses the existing `verify_audit_chain()` RPC rather than
  reimplementing integrity checking; reuses the existing CSV/JSON export helpers rather than adding
  a report-specific export path or a PDF pipeline. No new service, queue, or framework introduced.
  PASS.

**Result**: All principles pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/019-scheduled-compliance-reports/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── 20260707210000_compliance_reports.sql   # NEW — table, RLS, pg_cron.schedule
└── functions/
    ├── shared/
    │   ├── complianceReport.ts                  # NEW — pure summarizeAuditRows()
    │   └── complianceReport.test.ts             # NEW
    └── generate-compliance-report/
        └── index.ts                             # NEW — Edge Function, adminClient() pattern

src/
├── views/
│   └── AdminView.vue          # MODIFIED — new "Geçmiş Raporlar" subsection in Audit tab
└── i18n/
    └── locales/*.json         # MODIFIED — 7 locales, new audit.reports.* keys
```

**Structure Decision**: Single existing Vue 3 + Supabase project — no new project/service
directory. One migration, one new shared pure-function module + test, one new Edge Function, and a
targeted addition to the existing `AdminView.vue` Audit tab — same structure every prior spec in
this repo (001–018) has used.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*
