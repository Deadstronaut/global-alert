# Contract: `generate-compliance-report` Edge Function

## Invocation

Called only by `trigger_compliance_report_generation()` via `pg_net.http_post()` on the weekly
`pg_cron` schedule (research.md Decision 1/2). Not intended for direct client invocation, but
(unlike `ack-dispatch`) does not need `verify_jwt = false` — it is called with the service-role
key as its Authorization header, same as `dispatch-alert`'s Mode A (automatic dispatch) path.

**Request**: `POST /functions/v1/generate-compliance-report` with
`Authorization: Bearer <service-role-key>`. No request body is required — the function computes
its own period (the most recently fully-elapsed week that does not yet have a report).

## Behavior

1. Compute `period_start`/`period_end` as the most recently fully-elapsed week (Monday-to-Monday
   ending before now) — no gap-search or backfill (spec.md's Edge Cases explicitly say catch-up is
   not required; a gap-search was considered and rejected as unnecessary complexity, see
   research.md Decision 2 / analysis finding F1).
2. Fetch `audit_log` rows with `created_at >= period_start AND created_at < period_end`.
3. Call `summarizeAuditRows(rows)` (research.md Decision 4) to get `by_action`/`by_table` counts.
4. Call the existing `verify_audit_chain()` RPC to get the integrity result for inclusion in the
   report (FR-004) — note this checks the chain up to "now," not scoped to the period, since the
   chain is a whole-table property; the report simply records what that check returned at
   generation time.
5. Insert one row into `compliance_reports` with `ON CONFLICT (period_start, period_end) DO
   NOTHING` (FR-005 — idempotent even if this function is somehow invoked twice for the same
   period).

## Outcomes

| Scenario | Result |
|---|---|
| No existing report for the oldest elapsed uncovered week | New `compliance_reports` row inserted, contains real or zero-activity counts (FR-006) per whatever the period actually had |
| A report for that period already exists (race/retry) | `ON CONFLICT DO NOTHING` — no error, no duplicate row |
| `verify_audit_chain()` finds a broken link | Report is still inserted, with `summary.integrity_ok = false` and `summary.broken_seq` set (FR-004's "clearly flags the integrity problem" requirement) |
| Called without a valid service-role Authorization header | Rejected (401), same as `dispatch-alert`'s existing Mode A auth check |

## Reading reports (client-side)

`AdminView.vue`'s new Audit-tab subsection reads `compliance_reports` directly via the Supabase JS
client (`supabase.from('compliance_reports').select('*').order('period_start', {ascending:
false})`), relying entirely on RLS (`super_admin_read_compliance_reports`) rather than a bespoke
endpoint — same reading pattern already used for `audit_log` in the same view.

## Downloading a report (client-side)

Reuses `rowsToCsv`/`rowsToJson`/`triggerDownload` from `src/lib/auditExport.js` unchanged — a
report's `summary` JSONB is flattened into a small row-shaped structure (e.g. one row per
`by_action`/`by_table` entry, or the whole summary object serialized directly for JSON) before
being handed to the existing helpers, per FR-009's "format consistent with the existing manual
audit log export options."
