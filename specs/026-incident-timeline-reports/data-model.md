# Data Model: Incident Timeline Playback & Annual Incident Reports

## New SECURITY DEFINER function: `get_incident_timeline(p_incident_id UUID)`

Returns `TABLE(action TEXT, old_data JSONB, new_data JSONB, changed_by UUID, created_at TIMESTAMPTZ)`.

Behavior:
1. Authorization check (mirrors `incidents`' 3 existing RLS policies exactly):
   ```sql
   IF NOT EXISTS (
     SELECT 1 FROM incidents i
     WHERE i.id = p_incident_id
       AND (
         current_profile_role() = 'super_admin'
         OR (current_profile_role() IN ('country_admin','org_admin') AND i.country_code = current_profile_country_code())
         OR (i.country_code = current_profile_country_code())  -- mirrors viewer_incidents_read
       )
   ) THEN
     RAISE EXCEPTION 'not authorized to view timeline for this incident';
   END IF;
   ```
2. Returns matching `audit_log` rows: `WHERE table_name = 'incidents' AND record_id =
   p_incident_id::text ORDER BY created_at ASC`.

No new table — this is a read-only reconstruction (Decision 1).

## Entity: `incident_reports` (new table, structural twin of `compliance_reports`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PRIMARY KEY DEFAULT gen_random_uuid() | |
| `period_start` | TIMESTAMPTZ NOT NULL | Jan 1 00:00:00 UTC of the reported year |
| `period_end` | TIMESTAMPTZ NOT NULL | Jan 1 00:00:00 UTC of the following year (exclusive) |
| `summary` | JSONB NOT NULL | see shape below |
| `generated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

`CHECK (period_end > period_start)`, `UNIQUE INDEX (period_start, period_end)` (FR-006/SC-004).

**RLS**: `super_admin_read_incident_reports` (SELECT, `current_profile_role() = 'super_admin'`) —
no INSERT/UPDATE/DELETE policy for any role; the only writer is the `generate-incident-report`
Edge Function using a service-role client, identical to `compliance_reports`.

### `summary` JSONB shape

```json
{
  "total_incidents": 42,
  "by_severity": { "critical": 3, "high": 10, "moderate": 20, "low": 8, "minimal": 1 },
  "by_hazard_type": { "earthquake": 15, "flood": 12, "wildfire": 15 },
  "avg_time_to_close_hours": 36.4,
  "false_alarm_rate": 0.12
}
```

`avg_time_to_close_hours` is `null` when zero incidents closed within the period (Decision 5).
`false_alarm_rate` is `null` when zero incidents had a linked, terminal-status CAP alert in the
period (Decision 4).

## New trigger function: `trigger_incident_report_generation()`

Identical shape to `trigger_compliance_report_generation()` (spec 019) — reads
`edge_function_base_url`/`service_role_key` from `vault.decrypted_secrets`, POSTs to
`/generate-incident-report` via `pg_net`. Scheduled via `cron.schedule('generate-incident-report-yearly',
'5 0 1 1 *', ...)` (Jan 1, 00:05 UTC — 5 minutes after the compliance report's weekly slot,
avoiding any resource contention, though none is expected at this scale).

## New Edge Function: `generate-incident-report`

Service-role-authenticated (same `Authorization: Bearer <service_role_key>` check as
`generate-compliance-report`). Computes the most recently fully-elapsed calendar year, queries
`incidents` for that year, calls the pure functions in `incidentReportSummary.ts` to build the
`summary` JSONB, and upserts into `incident_reports` with `ON CONFLICT (period_start, period_end)
DO NOTHING`.

## New shared module: `supabase/functions/shared/incidentReportSummary.ts`

Pure functions (Deno-testable, no Supabase client):
- `computeSeverityAndHazardBreakdown(incidents)` → `{ by_severity, by_hazard_type }`
- `computeAverageTimeToCloseHours(incidents)` → `number | null` (Decision 5)
- `computeFalseAlarmRate(incidents, capDraftStatusByCapId)` → `number | null` (Decision 4)
