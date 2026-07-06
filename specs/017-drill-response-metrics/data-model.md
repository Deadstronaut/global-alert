# Data Model: Drill Response-Time and Participation Metrics

## Entities

### Dispatch Receipt (`dispatch_receipts`) — modified

New column:

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `acknowledged_at` | `TIMESTAMPTZ` | YES | `NULL` | Set exactly once, by the `ack-dispatch` Edge Function only, the first time the recipient visits their acknowledgment link. `NULL` means not yet acknowledged (or never will be — acknowledgment is optional, not required). |

No changes to any existing column, constraint, RLS policy, or trigger's *signature*. The existing
`audit_dispatch_receipts` trigger (`log_table_change()`) automatically captures acknowledgment as part of its
existing whole-row-diff logging — no new audit code needed.

### Drill Session (`drill_sessions`) — unchanged schema, richer `summary` JSON

`summary` (already a flexible JSON field per spec 013) gains two new keys when `endDrill()` runs, alongside the
existing `duration_min`/`alerts_issued`/`ended_at`:

| Key | Type | Notes |
|---|---|---|
| `response_time_seconds` | number \| null | Seconds between `drill.started_at` and the earliest `is_exercise=true` CAP draft's `created_at` in that drill's country/window. `null` if no exercise alert was ever issued during the drill (FR-002 — never a misleading `0`). |
| `ack_rate` | `{ acknowledged: number, sent: number } \| null` | Counts, not a pre-divided percentage, so the UI can render "3 / 5" as well as a percentage; `null` if `sent` is `0` (FR-005 — never a misleading `0%`). |

No migration needed for `drill_sessions` — `summary` is already a schemaless JSON column (spec 013).

## Pure Logic (`supabase/functions/shared/drillMetrics.ts`)

```ts
export function computeResponseTimeSeconds(startedAt: string, firstAlertAt: string | null): number | null
export function computeAckRate(sent: number, acknowledged: number): { sent: number; acknowledged: number } | null
```

- `computeResponseTimeSeconds`: returns `null` if `firstAlertAt` is `null` (FR-002); otherwise the non-negative
  second difference.
- `computeAckRate`: returns `null` if `sent === 0` (FR-005); otherwise `{ sent, acknowledged }` (acknowledged is
  always `<= sent` by construction, since acknowledgment only exists for receipts that reached `sent`/`delivered`
  status).

## Behavior Summary

1. `endDrill()` (unchanged query pattern, two additional read-only queries): fetches the earliest exercise CAP
   draft's `created_at` for the drill's country/window (existing `alerts_issued` query's sibling), and counts
   `dispatch_receipts` rows (joined through `dispatch_jobs` to that same set of exercise drafts) with
   `status IN ('sent','delivered')` (sent denominator) versus `acknowledged_at IS NOT NULL` (acknowledged
   numerator).
2. Both raw counts are passed through the pure functions above before being written into `summary`.
3. `ack-dispatch` (new Edge Function, `GET /ack-dispatch?receipt_id=<uuid>`): using a service-role client,
   conditionally updates `acknowledged_at = NOW() WHERE id = receipt_id AND acknowledged_at IS NULL`, then always
   returns a 200 HTML response with a friendly confirmation message — regardless of whether the row existed, was
   already acknowledged, or the update affected zero rows (FR-006).
