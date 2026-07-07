---
description: "Task list for Incident Timeline Playback & Annual Incident Reports (spec 026)"
---

# Tasks: Incident Timeline Playback & Annual Incident Reports

**Input**: Design documents from `/specs/026-incident-timeline-reports/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/incident-timeline-reports.md, quickstart.md

**Tests**: Included — the report's summarization math (average time-to-close, false-alarm rate)
is exactly the class of easy-to-get-subtly-wrong logic this project test-firsts, matching
`complianceReport.ts`/`complianceReport.test.ts` (spec 019).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `supabase/functions/` at
repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260708020000_incident_timeline_reports.sql`: add
  `get_incident_timeline(p_incident_id UUID)` SECURITY DEFINER function per data-model.md —
  authorization check first (EXISTS against `incidents` mirroring its 3 existing RLS policies
  exactly: super_admin, country_admin/org_admin own country, any role own country per
  `viewer_incidents_read`), raising an exception if unauthorized; then `RETURNS TABLE(action TEXT,
  old_data JSONB, new_data JSONB, changed_by UUID, created_at TIMESTAMPTZ)` from `audit_log WHERE
  table_name = 'incidents' AND record_id = p_incident_id::text ORDER BY created_at ASC`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The report table, its RLS, and the pure summarization functions are required before
the report-generation Edge Function (US2) can be built; nothing in US1 depends on this phase.

- [X] T002 [P] In the same migration file, add `incident_reports` table (`id` PK,
  `period_start`/`period_end` TIMESTAMPTZ NOT NULL, `summary` JSONB NOT NULL, `generated_at`
  DEFAULT NOW(), `CHECK (period_end > period_start)`, `UNIQUE INDEX (period_start, period_end)`)
  per data-model.md — structural twin of `compliance_reports`
- [X] T003 [P] In the same migration file, add RLS: `super_admin_read_incident_reports` (SELECT,
  `current_profile_role() = 'super_admin'`) — no INSERT/UPDATE/DELETE policy for any role
- [X] T004 In the same migration file, add `trigger_incident_report_generation()` function
  (identical shape to `trigger_compliance_report_generation()`, reads `edge_function_base_url`/
  `service_role_key` from `vault.decrypted_secrets`, POSTs to `/generate-incident-report` via
  `pg_net`) and register it via `cron.schedule('generate-incident-report-yearly', '5 0 1 1 *',
  ...)` (Jan 1, 00:05 UTC — depends on T002/T003 existing first in the same file)
- [X] T005 [P] Create `supabase/functions/shared/incidentReportSummary.ts` per data-model.md: pure
  functions `computeSeverityAndHazardBreakdown(incidents)`, `computeAverageTimeToCloseHours(incidents)`
  (research.md Decision 5 — only `closed`/`archived` incidents with `closed_at` in-period; `null`
  if none), `computeFalseAlarmRate(incidents, capDraftStatusByCapId)` (research.md Decision 4 —
  only incidents with a non-null `linked_cap_id` whose linked status is terminal; `null` if none)
- [X] T006 [P] Create `supabase/functions/shared/incidentReportSummary.test.ts` (Deno test,
  mirrors `complianceReport.test.ts`'s structure) covering: empty incident list (all metrics
  `null`/zero, not an error), severity/hazard breakdown counts, average time-to-close with a mix
  of closed/still-open incidents, false-alarm rate with a mix of linked/unlinked/false-alarm/
  genuine incidents

**Checkpoint**: Report data model and its tested pure summarization logic exist — no Edge Function
or UI uses them yet.

---

## Phase 3: User Story 1 - Anyone who can view an incident can see its full history (Priority: P1) 🎯 MVP

**Goal**: Any user who can already see a given incident (Super Admin, Country/Org Admin, or
Viewer with matching country) can request and view its chronological history.

**Independent Test**: Open an incident that changed state at least once, request its timeline,
confirm chronological order with timestamps and actor; confirm a user without access to that
incident is rejected (quickstart.md Scenarios 1-2). Independent of User Story 2 entirely.

### Implementation for User Story 1

- [X] T007 [US1] In `src/views/IncidentsView.vue`, add a "🕐 Zaman Çizelgesi" button per incident
  card, a `ref` tracking which incident's timeline is currently expanded (only one open at a
  time, mirroring the existing `aarTargetId` single-open pattern), and a `timelineEntries` cache
  keyed by incident id
- [X] T008 [US1] In `IncidentsView.vue`, add `async function loadTimeline(incident)` calling
  `supabase.rpc('get_incident_timeline', { p_incident_id: incident.id })`, storing the result (or
  surfacing the rejection error via the existing `error.value` pattern if the call fails)
- [X] T009 [US1] In `IncidentsView.vue`'s template, render the expanded timeline as an ordered
  list per contracts/incident-timeline-reports.md's client-side rendering rule: if
  `old_data.status !== new_data.status`, render `"durum: {old} → {new}"`; otherwise a generic
  "updated" line; the first (`old_data === null`) row renders as the creation event; each row
  shows its `created_at` timestamp

**Checkpoint**: User Story 1 fully functional and independently testable — timeline visibility
exactly matches incident visibility for every role.

---

## Phase 4: User Story 2 - Super Admin reviews yearly incident statistics automatically (Priority: P2)

**Goal**: A Super Admin can see an automatically-generated yearly summary (counts, breakdowns,
average time-to-close, false-alarm rate) without manual computation.

**Independent Test**: Trigger report generation for a completed year (manually via curl, per
quickstart.md, since waiting for the actual yearly cron isn't practical to test), confirm the
report's fields are populated correctly, confirm re-running doesn't duplicate, confirm only
Super Admin can see it (quickstart.md Scenarios 3-5).

### Implementation for User Story 2

- [X] T010 [US2] Create `supabase/functions/generate-incident-report/index.ts` (mirrors
  `generate-compliance-report/index.ts`'s structure): service-role auth check, computes the most
  recently fully-elapsed calendar year (Jan 1 00:00 UTC of last year → Jan 1 00:00 UTC of this
  year), queries `incidents` for that period plus their linked `cap_drafts.status` (for
  false-alarm calculation), calls `incidentReportSummary.ts`'s pure functions (T005) to build the
  `summary` JSONB, upserts into `incident_reports` with `ON CONFLICT (period_start, period_end) DO
  NOTHING` (FR-006/SC-004)
- [X] T011 [US2] In `src/views/AdminView.vue`'s existing Denetim (Audit) tab, add a "Yıllık Olay
  Raporları" subsection next to the existing "Geçmiş Uyum Raporları" subsection — same
  super_admin-only visibility gate, same list/table presentation pattern, `SELECT * FROM
  incident_reports ORDER BY period_start DESC`, reuses the existing CSV/JSON export mechanisms
  already present in that tab (no new export code, per plan.md/contracts.md)

**Checkpoint**: User Story 2 fully functional and independently testable — yearly reports
generate idempotently and are visible only to Super Admins.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T012 [P] Add i18n coverage for all new user-facing text (timeline button label, timeline
  entry formatting labels, "no history" empty state, yearly reports subsection title/column
  labels) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T013 Run `deno test supabase/functions/shared/incidentReportSummary.test.ts` (or the
  project's existing Deno test runner command) and confirm all pass
- [X] T014 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T015 Run `npm run build` and confirm a clean build
- [X] T016 Validate quickstart.md Scenarios 1-5 against the live Supabase instance after the user
  applied `20260708020000_incident_timeline_reports.sql` and deployed `generate-incident-report`.
  Confirmed via read-only queries: `get_incident_timeline()` and
  `trigger_incident_report_generation()` functions present, `incident_reports` table present, the
  `generate-incident-report-yearly` cron job registered with schedule `5 0 1 1 *`, and the
  `generate-incident-report` Edge Function is deployed and ACTIVE (`verify_jwt: true`, same
  pattern as `generate-compliance-report` — the pg_net trigger already sends a service-role bearer
  token, so this is consistent with the existing precedent, not a gap). The RPC's actual
  authorization behavior and the Edge Function's real output (Scenarios 1, 2, 3, 5) require a
  live authenticated UI session or a manual curl call with the service-role key, which the
  assistant does not have — **user should exercise the live UI** (Country Admin/Viewer viewing a
  timeline, Super Admin viewing yearly reports) and optionally trigger the report manually per
  quickstart.md Scenario 3 to see real output data
- [X] T017 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Incident Tracking
  module's "timeline playback" and "false-alarm-rate metrikleri" + part of "otomatik/yıllık rapor
  üretimi" backlog items are now closed — update completion percentage; note that "LLM SOP
  asistanı" remains explicitly out of scope pending future AI/LLM infrastructure, and "drill/
  exercise simulation" remains a separate module's item

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup (T004 needs T002/T003 to exist first in the same
  migration file) — BLOCKS User Story 2 only (User Story 1 needs only T001)
- **User Story 1 (Phase 3)**: Depends on Setup (T001) only — can proceed in parallel with Phase 2
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) fully complete
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- User Story 1 (Phase 3) and Phase 2 (Foundational) can proceed in parallel — they touch
  disjoint files and neither depends on the other
- T002/T003 (table + RLS) can be scaffolded together; T005/T006 (pure functions + their tests) can
  be scaffolded together
- T012 (i18n) can run in parallel with T013/T014/T015

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup (`get_incident_timeline()`)
2. Complete Phase 3: User Story 1 (timeline UI) — this alone closes the "timeline playback"
   backlog item
3. **STOP and VALIDATE**: quickstart.md Scenarios 1-2

### Incremental Delivery

4. Complete Phase 2: Foundational (report table/RLS/pure functions) — can happen any time
   before Phase 4, including in parallel with Phase 3
5. Complete Phase 4: User Story 2 (yearly report) — closes "otomatik/yıllık rapor üretimi" +
   "false-alarm-rate metrikleri"
6. **STOP and VALIDATE**: quickstart.md Scenarios 3-5
7. Complete Phase 5: Polish (i18n/docs/test/build verification)

---

## Notes

- `incidents`, `audit_log`, and `cap_drafts` tables are never modified — this spec is purely
  additive (one new RPC, one new table, one new Edge Function)
- `get_incident_timeline()`'s authorization check is the security-critical part of this spec —
  it must be verified to exactly match `incidents`' 3 existing RLS policies, no broader, no
  narrower (FR-002/SC-002)
- Commit only when explicitly requested by the user
