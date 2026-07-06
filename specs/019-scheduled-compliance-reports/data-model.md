# Data Model: Scheduled Compliance Reports

## Entity: `compliance_reports` (NEW table)

Represents one automatically generated compliance summary for a single, non-overlapping period.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `period_start` | `TIMESTAMPTZ` | `NOT NULL` | Inclusive start of the covered period (FR-002) |
| `period_end` | `TIMESTAMPTZ` | `NOT NULL` | Exclusive end of the covered period (FR-002) |
| `summary` | `JSONB` | `NOT NULL` | `{ by_action: {...}, by_table: {...}, integrity_ok: boolean, broken_seq: number\|null }` (FR-003/FR-004) |
| `generated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When this row was inserted |

**Unique constraint**: `UNIQUE (period_start, period_end)` — enforces FR-005 (no duplicate report
for the same period) at the database layer, not just application logic (research.md Decision 3).

**Relationships**: None — a self-contained summary snapshot, not a foreign-keyed join to
`audit_log` (the underlying rows may themselves be subject to normal data lifecycle independent of
this summary).

**Validation rules** (from spec Functional Requirements):
- `period_end` MUST be after `period_start` (enforced by a `CHECK (period_end > period_start)`).
- A report is still generated (and stored) when a period had zero matching `audit_log` rows
  (FR-006) — `summary.by_action`/`summary.by_table` are simply empty objects in that case, not a
  skipped row.

## `summary` JSONB shape (produced by `summarizeAuditRows()`)

```json
{
  "by_action": { "INSERT": 12, "UPDATE": 4, "DELETE": 0 },
  "by_table": { "cap_drafts": 3, "profiles": 1 },
  "integrity_ok": true,
  "broken_seq": null
}
```

`integrity_ok`/`broken_seq` come directly from the existing `verify_audit_chain()` RPC's return
value (`NULL` → intact → `integrity_ok: true, broken_seq: null`; a `BIGINT` → broken at that
sequence → `integrity_ok: false, broken_seq: <value>`), reusing spec 007's existing integrity
mechanism rather than reimplementing it (FR-004).

## RLS Policy Additions

| Table | New Policy | Effect |
|---|---|---|
| `compliance_reports` | `super_admin_read_compliance_reports` | `current_profile_role() = 'super_admin'` may SELECT — mirrors the existing `super_admin_read_audit` policy on `audit_log` exactly (FR-007) |

No `INSERT`/`UPDATE`/`DELETE` policy is granted to any role via RLS — the only writer is the
`generate-compliance-report` Edge Function using a service-role client (bypasses RLS entirely),
matching the established trusted-backend-write pattern used by every other Edge-Function-only-write
table in this project (`dispatch_receipts.acknowledged_at`, `source_state_transitions`, etc.).

## New SQL function: `trigger_compliance_report_generation()`

```
trigger_compliance_report_generation() RETURNS VOID
  LANGUAGE plpgsql
  -- Reads edge_function_base_url / service_role_key from vault.decrypted_secrets (same secrets
  -- spec 009's notify_dispatch_on_broadcast() already requires) and calls net.http_post() against
  -- generate-compliance-report. No-ops with RAISE NOTICE if secrets aren't configured, mirroring
  -- notify_dispatch_on_broadcast()'s existing behavior exactly.
```

Called by the new weekly `pg_cron.schedule()` registration (research.md Decision 2), not directly
by any application code path.

## Pure function: `summarizeAuditRows()`

```
summarizeAuditRows(rows: { action: string; table_name: string | null }[]): {
  by_action: Record<string, number>;
  by_table: Record<string, number>;
}
```

Rows with a `null` `table_name` (e.g. a `LOGIN` action row, if such rows exist) are counted in
`by_action` but excluded from `by_table`'s keys (no `"null"` key invented). An empty `rows` array
returns `{ by_action: {}, by_table: {} }` (FR-006 — a valid, complete, empty report).
