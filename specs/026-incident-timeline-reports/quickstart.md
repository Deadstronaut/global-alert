# Quickstart: Incident Timeline Playback & Annual Incident Reports

## Prerequisites

- Apply migration `supabase/migrations/20260708020000_incident_timeline_reports.sql` (user runs
  the Supabase CLI command themselves — never applied directly by the assistant).
- Deploy the `generate-incident-report` Edge Function (`supabase functions deploy
  generate-incident-report`) — user's own action, per this project's standing rule.
- At least one incident that has changed status at least once (for a non-trivial timeline).

## Scenario 1: View a timeline as an authorized user (US1, SC-001)

1. Sign in as any role with access to a given incident's country (Viewer included).
2. On `/alerts/incidents`, click "🕐 Zaman Çizelgesi" on an incident that has changed state.
3. Expected: every recorded change appears in chronological order with a timestamp and who made
   it; the very first entry is the incident's creation.

## Scenario 2: Timeline access is rejected for an incident outside the user's country (US1, SC-002)

1. Sign in as a Country Admin/Viewer for country A.
2. Attempt (e.g. via direct RPC call in devtools) to fetch the timeline of an incident belonging
   to country B.
3. Expected: the call is rejected — no rows are returned.

## Scenario 3: Trigger the yearly report manually for testing (US2, SC-003)

1. `curl -X POST https://<project>.supabase.co/functions/v1/generate-incident-report -H
   "Authorization: Bearer <service_role_key>"` (mirrors `generate-compliance-report`'s existing
   manual-test support).
2. Expected: a new row appears in `incident_reports` for the most recently fully-elapsed calendar
   year, with `total_incidents`, `by_severity`, `by_hazard_type`, `avg_time_to_close_hours`, and
   `false_alarm_rate` all populated (or `null` where genuinely no data exists per research.md
   Decisions 4/5).

## Scenario 4: Re-running report generation for the same year doesn't duplicate (US2, SC-004)

1. Repeat Scenario 3's curl call a second time immediately after.
2. Expected: `incident_reports` still has exactly one row for that year (no duplicate).

## Scenario 5: Only Super Admin can view yearly reports (US2, FR-007)

1. Sign in as a non-Super-Admin, attempt to query `incident_reports` directly.
2. Expected: no rows returned (RLS-filtered).
3. Sign in as Super Admin → Admin → Denetim tab → "Yıllık Olay Raporları" subsection.
4. Expected: the generated report is visible.
