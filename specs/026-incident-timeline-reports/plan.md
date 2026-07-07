# Implementation Plan: Incident Timeline Playback & Annual Incident Reports

**Branch**: `026-incident-timeline-reports` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/026-incident-timeline-reports/spec.md`

## Summary

Close two of Incident Tracking's remaining backlog items: (1) a per-incident timeline reconstructed
from the existing `audit_log` trail, exposed through a new SECURITY DEFINER function whose
authorization check exactly mirrors `incidents`' three existing RLS policies (so timeline access is
never broader or narrower than incident-viewing access); (2) an automatic yearly incident report
(count/severity/hazard breakdown, average time-to-close, false-alarm rate), directly modeled on
spec 019's `compliance_reports` pg_net+pg_cron+Vault pattern. Both are additive — no existing table,
RLS policy, or incident-management behavior changes.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), PL/pgSQL (Postgres migrations),
TypeScript (Deno Edge Function)

**Primary Dependencies**: Vue 3, vue-i18n, Supabase JS client, Supabase Postgres (`pg_cron`,
`pg_net`, Vault — all already enabled per spec 019), Deno (Edge Function runtime)

**Storage**: PostgreSQL via Supabase — one new table (`incident_reports`), one new SECURITY
DEFINER function (`get_incident_timeline`), one new trigger function
(`trigger_incident_report_generation`) + `cron.schedule()` entry. Zero changes to `incidents`,
`audit_log`, or `cap_drafts`.

**Testing**: Deno test (`supabase/functions/shared/*.test.ts`) for the report's pure summarization
logic, matching the exact precedent of `complianceReport.ts`/`complianceReport.test.ts` (spec 019).

**Target Platform**: Web (Vite-built SPA) + Supabase Edge Functions (Deno Deploy).

**Project Type**: Single Vue 3 + Supabase web application (existing repo structure).

**Performance Goals**: Timeline queries are scoped to a single incident's `audit_log` rows (already
indexed via `idx_audit_record (table_name, record_id)`) — no new performance concern. The yearly
report runs once a year via cron, not user-triggered, so no interactive-latency requirement.

**Constraints**: `get_incident_timeline()`'s authorization logic MUST exactly replicate `incidents`'
three RLS policies (`super_admin_incidents_all`, `country_admin_incidents_own`,
`viewer_incidents_read`) — this is the security-critical part of this spec and needs the same care
as any RLS-mirroring SECURITY DEFINER function in this project. Yearly report generation must be
idempotent per period (FR-006/SC-004), mirroring spec 019's `UNIQUE(period_start, period_end)` +
`ON CONFLICT ... DO NOTHING` approach.

**Scale/Scope**: One new RPC + one new table + one new Edge Function + one UI addition
(timeline expand/collapse on the existing incident card) + one UI addition (yearly reports list in
the existing Audit tab).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Security/RBAC**: PASS — `get_incident_timeline()` performs its own authorization check inside a
  SECURITY DEFINER function (same class of function as `save_integration_credentials`,
  `save_whatsapp_credentials`, `resolveThresholds`'s server-side counterparts), and that check is a
  direct mirror of `incidents`' existing, already-reviewed RLS policies — no new authorization
  model is introduced, only a read path that reuses the existing one. `incident_reports` reuses
  `compliance_reports`' exact super_admin-only visibility rule (already reviewed in spec 019).
- **Audit trail**: PASS — this spec is, in effect, making the *existing* audit trail (already
  captured by `audit_incidents`, spec 001-era infrastructure) usable by the roles who need it,
  without changing what gets logged or how.
- **Simplicity/YAGNI**: PASS — no new persistent "timeline" table (derived from `audit_log` on
  read); no configurable report period (fixed yearly, matching spec 019's fixed-weekly precedent);
  no replay/animation UI (a chronological list is sufficient per spec.md Assumptions).
- **Testing**: PASS — the report's summarization math (average time-to-close, false-alarm rate) is
  extracted into pure, Deno-testable functions, exactly matching `complianceReport.ts`'s existing
  pattern.

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/026-incident-timeline-reports/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── incident-timeline-reports.md
├── quickstart.md
└── tasks.md              # /speckit-tasks output (not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260708020000_incident_timeline_reports.sql   # new: get_incident_timeline(),
                                                       # incident_reports table + RLS,
                                                       # trigger_incident_report_generation()
                                                       # + yearly cron.schedule()

supabase/functions/
├── generate-incident-report/
│   └── index.ts                          # NEW — mirrors generate-compliance-report/index.ts
└── shared/
    ├── incidentReportSummary.ts          # NEW — pure summarization functions
    └── incidentReportSummary.test.ts     # NEW — Deno tests

src/views/
├── IncidentsView.vue     # add "🕐 Zaman Çizelgesi" expand/collapse per incident card
└── AdminView.vue         # add "Yıllık Olay Raporları" subsection next to the existing
                             # "Geçmiş Uyum Raporları" subsection in the Denetim (Audit) tab

src/i18n/locales/*.json    # 7 files: new keys for timeline UI + yearly report labels
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repo layout). This spec is a
close structural twin of spec 019 (compliance reports) applied to a different table, plus one new
read-only RPC for the timeline feature — no new project/module boundary, no new architectural
pattern being introduced for the first time.

## Complexity Tracking

*No entries — no Constitution Check violations.*
