# Quickstart: Scheduled Compliance Reports

## Prerequisites

- Migration `20260707210000_compliance_reports.sql` applied.
- Spec 009's Vault secrets (`edge_function_base_url`, `service_role_key`) already configured (if
  not, this feature will safely no-op with a `RAISE NOTICE` rather than error — see research.md
  Decision 1).
- `generate-compliance-report` Edge Function deployed.

## Scenario 1 — Verify the pg_cron job registered correctly (new territory for this project)

Since this project has never registered a `pg_cron` job via a migration file before (research.md
Decision 2), explicitly verify it took effect:

```sql
select jobname, schedule, active from cron.job where jobname = 'generate-compliance-report-weekly';
```

**Expected**: one row, `schedule = '0 0 * * 1'`, `active = true`.

## Scenario 2 — Manually trigger report generation (don't wait a week)

```sh
curl -X POST "https://<project-ref>.supabase.co/functions/v1/generate-compliance-report" \
  -H "Authorization: Bearer <service-role-key>"
```

**Expected**: a new row appears in `compliance_reports` for the most recently fully-elapsed week
(US1 Scenario 1).

## Scenario 3 — Idempotency (US1 Edge Case)

Run the same `curl` command from Scenario 2 again immediately.

**Expected**: no second row is created for the same period — `select count(*) from
compliance_reports` is unchanged (FR-005, SC-003).

## Scenario 4 — Zero-activity period still produces a report (US1 Scenario 3)

If a period genuinely had no `audit_log` activity, confirm the report row still exists with
`summary = { "by_action": {}, "by_table": {}, "integrity_ok": ..., "broken_seq": ... }` rather than
no row at all.

## Scenario 5 — Super Admin views and downloads a report (US1 + US2)

1. Log in as Super Admin, open the Audit tab.
2. Confirm the new "Geçmiş Raporlar" (Past Reports) subsection lists the report(s) generated above,
   each showing its period and a summary — informally time how long it takes to locate/open the
   most recent report (SC-002: should be under 10 seconds).
3. Download one report as CSV and as JSON; confirm the contents match what was shown on screen
   (SC-004).

## Scenario 6 — Non-Super-Admin cannot see reports (FR-007)

Log in as any other role and confirm `compliance_reports` is not queryable (RLS denies it) and no
"Geçmiş Raporlar" section appears (it's nested inside the already Super-Admin-only Audit tab).

## Validation commands

```sh
npm run test                                                              # existing suite + new complianceReport.test.ts must pass
npm run build                                                             # clean build
deno test --no-check --allow-net --allow-env supabase/functions/shared/   # new summarizeAuditRows() tests
```
