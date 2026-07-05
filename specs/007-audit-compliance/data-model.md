# Data Model: Audit & Compliance Viewer

## `audit_log` (existing table — additive changes only)

Existing columns (unchanged): `id`, `action`, `table_name`, `record_id`, `old_data`, `new_data`,
`changed_by`, `ip_address`, `user_agent`, `checksum` (generated, per-row self-contained hash),
`created_at`.

### New columns

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `seq` | BIGSERIAL | No (auto) | Monotonic insertion-order tiebreaker, immune to timestamp collisions (research.md §1). Backfills automatically for existing rows in insertion order when the column is added. |
| `chain_hash` | TEXT | Yes | SHA-256 hex digest chaining this row to the previous row's `chain_hash` (research.md §2). NULL for rows inserted before this feature (genesis boundary, FR-008) — never backfilled. |

### New function: `verify_audit_chain()`

Returns the `seq` of the first row (after the genesis boundary) whose stored `chain_hash` does
not match its recomputed value, or NULL if the chain is fully intact from that point forward.
Implemented as a single set-based query using `LAG(chain_hash) OVER (ORDER BY seq)`
(research.md §4).

### New trigger: `set_audit_chain_hash()` (`BEFORE INSERT` on `audit_log`)

Computes `NEW.chain_hash` from `NEW`'s own field values plus the previous row's `chain_hash`
(or the `'GENESIS'` marker — research.md §3). Runs before the row is written, so `chain_hash` is
present from the moment of insert, consistent with the append-only/no-update guarantee (FR-010) —
it is never recomputed or altered afterward.

## Relationships

- No new foreign keys — `audit_log` already references `auth.users(id)` via `changed_by`
  (unchanged).
- This feature reads (never writes application-level rows) `audit_log` rows produced by the
  existing triggers on `profiles`, `organizations`, `cap_drafts`, `mfa_recovery_codes`
  (specs 004-006) — no changes to those triggers.

## Query shape (browse/filter, FR-002/FR-003)

```sql
SELECT * FROM audit_log
WHERE (table_name = :table_name OR :table_name IS NULL)
  AND (changed_by = :user_id OR :user_id IS NULL)
  AND (action = :action OR :action IS NULL)
  AND (created_at >= :from OR :from IS NULL)
  AND (created_at <= :to OR :to IS NULL)
ORDER BY seq DESC
LIMIT :page_size OFFSET :page_offset;
```

Executed via `supabase.from('audit_log').select('*').eq(...).gte(...).lte(...).order('seq', {
ascending: false }).range(offset, offset + pageSize - 1)` — standard Supabase-JS query builder,
no new RPC needed for browsing (RLS already restricts to super_admin).
