# Edge Function Contract: `dispatch-alert`

Two invocation modes, distinguished by which field is present in the request body.

## Mode A — Automatic dispatch (called only by the DB trigger)

**Caller**: Postgres trigger on `cap_drafts` (`AFTER UPDATE`, `NEW.status = 'broadcast' AND OLD.status IS DISTINCT FROM NEW.status`), via `pg_net.http_post`, authenticated with the service role key. Never called directly by a client.

**Request**:
```json
{ "draft_id": "uuid" }
```

**Behavior**:
1. Load the `cap_drafts` row by `draft_id`. If not found or `status != 'broadcast'`, return 200 with `{ skipped: true, reason: "not_broadcast" }` (defensive against a stale/duplicate trigger fire).
2. Create a `dispatch_jobs` row (`status = 'queued'`), then transition it to `running`.
3. Query `contacts` for matches per research.md §4 (`is_active`, opt-in per channel, `country_code` match, `hazard_type_filter` match-or-null).
4. If zero matches: create no receipts, set `dispatch_jobs.matched_contact_count = 0`, mark `completed`. (Edge case from spec — not an error.)
5. For each matched contact with `email_opt_in = true` and a non-null `email`: create a `dispatch_receipts` row (`channel = 'email'`, `queued`), call the configured email provider adapter, update the receipt to `sent`/`failed` based on the provider response.
6. For each matched contact with `whatsapp_opt_in = true` and a non-null `whatsapp_number`: create a `dispatch_receipts` row (`channel = 'whatsapp'`, `is_mock = true`), synchronously transition `queued → sent → delivered` (research.md §3).
7. A failure on one contact/channel MUST NOT stop processing the remaining contacts (FR-010).
8. After all contacts are processed, set `dispatch_jobs.status = 'completed'` — unless the provider was entirely unreachable (e.g., auth failure, network error at the provider level, not a per-recipient rejection), in which case set `status = 'failed'` with `failure_reason` populated.

**Response**: `{ job_id, matched_contact_count, sent, failed }`

## Mode B — Retry failed receipts (called by an authenticated Operator/Approver client)

**Caller**: `AdminView.vue` / Dispatch panel, via `supabase.functions.invoke('dispatch-alert', { body: { job_id } })`, user-authenticated (JWT forwarded).

**Request**:
```json
{ "job_id": "uuid" }
```

**Authorization**: Caller's role must be `super_admin`, or `country_admin`/`org_admin` scoped to the `cap_drafts.country_code`/`org_id` the job's draft belongs to (join `dispatch_jobs → cap_drafts`). `viewer` role, and any `country_admin`/`org_admin` outside the job's own scope, get HTTP 403. There is no separate "Auditor" role in this system (`profiles.role` only contains `super_admin`/`country_admin`/`org_admin`/`viewer`) — read/retry visibility follows the same tiering as every other admin surface.

**Behavior**:
1. Load the `dispatch_jobs` row by `job_id`; 404 if not found.
2. Select all `dispatch_receipts` for this job with `status IN ('failed','bounced')`.
3. For each, increment `retry_count`, reset to `queued`, and re-attempt via the same per-channel adapter as Mode A.
4. Receipts already `sent`/`delivered` are untouched (FR-011).
5. Update `dispatch_jobs.status` to `completed` if all receipts end up non-`failed`, otherwise leave as-is (still reflects mixed outcome, visible in the panel).

**Response**: `{ job_id, retried_count, now_sent, still_failed }`

## Error handling

- Malformed/missing body → HTTP 400.
- `draft_id` present but draft not found → HTTP 200 `{ skipped: true }` (Mode A is trigger-invoked, not user-invoked — no one is waiting on an error toast).
- `job_id` present but caller unauthorized → HTTP 403, and an `audit_log` entry is written (consistent with existing Edge Function authorization-check patterns, e.g. `suspendAuthorization.ts`).
