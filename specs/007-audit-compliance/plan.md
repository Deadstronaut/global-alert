# Implementation Plan: Audit & Compliance Viewer

**Branch**: `007-audit-compliance` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-audit-compliance/spec.md`

## Summary

Add a super_admin-only "Audit" tab to the existing `AdminView.vue` (matching its established
tab pattern, no new route) that browses/filters/paginates the existing `audit_log` table,
exports the filtered result (capped at 5,000 rows), and exposes an integrity-check action. The
existing `audit_log` schema, RLS (`super_admin_read_audit`, `no_update_audit`, `no_delete_audit`),
and `log_table_change()` trigger are all reused unchanged. The only schema change is additive: a
`seq BIGSERIAL` monotonic ordering column and a `chain_hash TEXT` column populated by a new
`BEFORE INSERT` trigger using pgcrypto's `digest(..., 'sha256')`.

## Technical Context

**Language/Version**: JavaScript/Vue 3 `<script setup>` (frontend), PL/pgSQL (migration) — no Edge Function needed; browsing/filtering/export run as direct `supabase.from('audit_log').select(...)` queries from the authenticated super_admin session (RLS already restricts read access), and CSV/JSON export is generated client-side from the fetched rows

**Primary Dependencies**: `@supabase/supabase-js` v2.97.0 (existing), Vue Router 4 (existing, no new route), vue-i18n (existing), Postgres `pgcrypto` extension (for `digest()` — enabled if not already present)

**Storage**: Supabase-hosted PostgreSQL — additive changes to the existing `audit_log` table only (`seq`, `chain_hash` columns, one new `BEFORE INSERT` trigger, one new `verify_audit_chain()` function); no new tables

**Testing**: Vitest for pure client-side logic (CSV/JSON serialization of a filtered row set, export-cap-warning logic); manual verification via quickstart.md for the DB-side hash chain and RLS restriction (consistent with this repo's existing practice for migration-heavy specs)

**Target Platform**: Existing Vue 3 SPA + Supabase Postgres — no new platform

**Project Type**: Web application (existing single frontend + Supabase backend, no new project structure)

**Performance Goals**: The integrity check (`verify_audit_chain()`) must complete in a reasonable time for this platform's realistic single/few-country audit-log volume; no specific SLA is set (Assumptions) — implemented as a single set-based SQL query (window function `LAG()` over `seq` order), not a per-row PL/pgSQL loop, to keep it efficient at any realistic scale without needing to define a specific target.

**Constraints**: The export cap (5,000 rows, per clarification) must be enforced server-side (query `LIMIT`), not just by truncating a client-side array, so a large unfiltered request never actually transfers more than 5,000 rows over the wire. The hash chain must not require retroactively computing hashes for rows that existed before this feature (Edge Cases/FR-008) — achieved by treating a NULL previous-chain_hash as a genesis marker rather than an error.

**Scale/Scope**: Same user base as prior specs — no scale change; `audit_log` growth rate is bounded by the existing triggers already wired to `profiles`/`organizations`/`cap_drafts`/`mfa_recovery_codes`, this spec adds no new audited tables.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: N/A — access/compliance feature, not hazard data. PASS.
- **Principle II (Scope Discipline)**: No new dissemination channel, no external identity federation, no CAP ingestion — purely an internal admin/compliance viewer over existing data. PASS.
- **Principle III (CAP v1.2)**: N/A directly, though `cap_drafts` audit history (already wired) is browsable through this feature as one of several audited tables — no CAP-specific logic added here. PASS.
- **Principle IV (Data Quality & Normalization)**: N/A — `audit_log` is not hazard/disaster data. PASS.
- **Principle V (Access Control & Auditability)**: This feature *is* the Auditability principle's user-facing realization — directly implements FR-0047 (structured export) and FR-0048 (cryptographic integrity verification) from SRS Module M9. The feature itself must not weaken the existing append-only guarantee (`no_update_audit`/`no_delete_audit`) — confirmed unchanged in this plan (FR-010). PASS.
- **Principle VI (Accessibility & i18n)**: New "Audit" tab UI is new user-facing surface — full i18n across all 7 locales required from the start (FR-011), no grandfather exception. PASS (i18n as an explicit task).
- **Principle VII (Performance & Resilience)**: The integrity check is designed as a single set-based query specifically to avoid an unbounded-time operation (Technical Context). PASS.
- **Principle VIII (Simplicity & YAGNI)**: Deliberately excludes PDF evidence packages, MinIO/S3 object storage integration, and scheduled/automated report generation from the broader SRS Module M9 list — these would require a new service/storage system this project has not adopted. CSV/JSON export (in-browser, no new service) is the chosen, simpler substitute for "structured export." PASS — this is the central Complexity Tracking judgment call for this spec, documented below.

**Result**: PASS. The most consequential Principle VIII judgment call: SRS FR-0045/MHEWS-SD-STORE-04 (PDF evidence packages in MinIO/S3) are explicitly NOT implemented — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/007-audit-compliance/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Existing single Vue 3 + Supabase project — no new top-level directories, no new route.

```text
src/
├── views/AdminView.vue                 # MODIFY — add a super_admin-only "Audit" tab: filter
                                         #   controls (table/user/action/date range), paginated
                                         #   result table, CSV/JSON export buttons, integrity-check
                                         #   button + result display, single-record history view
├── lib/auditExport.js                  # NEW — pure functions: rowsToCsv(rows), rowsToJson(rows),
                                         #   triggerDownload(content, filename, mimeType)
└── i18n/locales/*.json                 # new `audit` key block, all 7 locales

supabase/
└── migrations/
    └── <timestamp>_audit_log_hash_chain.sql  # NEW — pgcrypto extension (if needed), `seq`
                                                #   BIGSERIAL column, `chain_hash` column, BEFORE
                                                #   INSERT trigger computing it, `verify_audit_chain()`
                                                #   set-based verification function
```

**Structure Decision**: Single existing project — no new services. The Audit screen lives as a new
tab inside the existing `AdminView.vue` (matching its established `tab` ref pattern from spec 004),
not a new route, since it is exclusively a super_admin admin-panel capability like the existing
Users/Sources tabs. CSV/JSON generation happens client-side from already-RLS-filtered rows (no
Edge Function needed — this mirrors the "no new service unless proven insufficient" principle).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| SRS FR-0045/MHEWS-SD-STORE-04 (PDF evidence package + object storage) NOT implemented | Full SRS Module M9 scope | Adding MinIO/S3 + a PDF-rendering pipeline is a new service/storage integration this project has never adopted (Principle VIII); CSV/JSON export satisfies FR-0047's "structured export" requirement without it. Deferred to a future spec if a real operator need for PDF evidence packages emerges. |
