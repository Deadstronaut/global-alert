# Contract: Data Sources admin CRUD

**Implementation note (superseding the original design below):** during implementation, this was
changed from a bespoke Edge Function to **direct Supabase client table access** (`src/stores/sources.js`
calling `supabase.from('data_sources')...` etc.), matching the pattern every other admin panel in
this codebase already uses (`AdminView.vue`'s users/orgs/drills tabs, none of which go through a
custom Edge Function for their own CRUD — Edge Functions in this app are reserved for external
data-fetching concerns, per `plan.md`'s Project Structure). Enforcement is via RLS policies on
`data_sources`/`source_state_transitions`/`rejected_payloads` (see `20260703_data_sources.sql`),
identical in spirit to the endpoint contract below — only the transport changed, not the
authorization model. The endpoint shapes below remain useful as the logical operation contract.

Auth: all operations require a valid Supabase session; write operations additionally require
`profiles.role IN ('super_admin', 'country_admin')`. **Known limitation, not introduced by this
feature**: this app's Supabase Auth is not yet activated end-to-end (see `docs/iş planı istereler.txt`
— Administration & Access Control module, "Supabase Auth aktif et" still pending) — the mock
`useAuthStore` (`loginAsSuperAdmin`/`loginAsViewer`) only gates UI visibility today, the same way
it already does for `AdminView.vue`'s existing tabs. Real enforcement activates automatically once
that separate, already-tracked auth work lands — no changes needed here at that point.

## `GET /manage-data-sources`

List all configured sources with current health snapshot.

**Response 200**:
```json
{
  "sources": [
    {
      "id": "uuid",
      "name": "USGS Earthquake Feed",
      "hazard_type": "earthquake",
      "poll_interval_seconds": 60,
      "is_active": true,
      "health_state": "healthy",
      "consecutive_failures": 0,
      "last_success_at": "2026-07-03T12:00:00Z",
      "last_attempt_at": "2026-07-03T12:00:00Z"
    }
  ]
}
```

## `POST /manage-data-sources`

Create a new source (spec FR-001). Body fields map directly to `data_sources` columns
(`name`, `hazard_type`, `endpoint_url`, `endpoint_config?`, `poll_interval_seconds`,
`staleness_threshold_seconds?`, `down_after_consecutive_failures?`).

**Response 201**: the created source row (`health_state: "healthy"`, `is_active: true`).

**Response 400**: `{ "error": "hazard_type must be one of: earthquake, wildfire, flood, drought, food_security" }`
(or equivalent validation message) — invalid `hazard_type` or missing required field.

**Response 403**: `{ "error": "insufficient role" }` — caller is not `super_admin`/`country_admin`.

## `PATCH /manage-data-sources/:id`

Edit an existing source's configuration, or toggle `is_active` (spec FR-002, FR-006).

- When `is_active` transitions `true → false`: sets `health_state = 'disabled'`, stops future
  polling immediately, and writes a `source_state_transitions` row with
  `reason: "manually disabled by <caller id>"`.
- When `is_active` transitions `false → true`: sets `health_state = 'healthy'` (treated as
  "pending first fetch" per data-model.md), writes a corresponding transition row.

**Response 200**: the updated source row.

**Response 404**: source not found.

## `DELETE /manage-data-sources/:id`

Permanently remove a source's configuration (spec FR-003).

- Deletes the `data_sources` row (cascades to `source_state_transitions` per FK).
- Does **not** touch any previously-ingested hazard event rows (`earthquake`, `wildfire`, etc.) —
  those are independent of `data_sources` and are retained per FR-003.
- `rejected_payloads.source_id` for this source becomes `NULL` (FK is `ON DELETE SET NULL`),
  preserving audit history per data-model.md.

**Response 204**: no body.

## `GET /manage-data-sources/:id/audit`

Query state-transition and rejected-payload history for one source (spec FR-014).

**Query params**: `from` (ISO date, optional), `to` (ISO date, optional).

**Response 200**:
```json
{
  "transitions": [
    { "previous_state": "healthy", "new_state": "degraded", "reason": "fetch failed: timeout", "created_at": "..." }
  ],
  "rejected_payloads": [
    { "validation_error": "missing required field: lat", "occurred_at": "...", "record_excerpt": { "...": "..." } }
  ]
}
```

**Response 403**: caller is not `super_admin` (only role permitted to read audit history, per
research.md §4).

## Internal contract: `validatePayload()` (shared/validatePayload.ts)

Not an HTTP endpoint — a function called by each `fetch-*` function before `normalize()`.

```ts
function validatePayload(raw: unknown, hazardType: DisasterType): 
  { valid: true } | { valid: false; reason: string }
```

- MUST check required fields exist and are non-null for the given `hazardType` (at minimum:
  a resolvable id, coordinates, a resolvable timestamp).
- MUST check latitude is within `-90..90` and longitude within `-180..180`.
- MUST check any declared numeric field (magnitude, depth, etc.) is actually numeric when present.
- MUST NOT throw — always returns the discriminated result so callers can continue processing
  the rest of a batch (spec FR-011: partial-batch tolerance).

## Internal contract: `sourceHealth.ts`

Not an HTTP endpoint — shared helper called by each `fetch-*` function after a fetch attempt
completes (success or failure), and by `manage-data-sources` for manual enable/disable.

```ts
async function recordFetchOutcome(sourceId: string, outcome: 'success' | 'failure', detail?: string): Promise<void>
async function setSourceActive(sourceId: string, isActive: boolean, changedBy: string): Promise<void>
```

Both functions are responsible for: updating `data_sources` (`health_state`,
`consecutive_failures`, `last_success_at`/`last_attempt_at`), and writing a
`source_state_transitions` row whenever `health_state` actually changes (not on every call —
e.g., two consecutive successes while already `healthy` write no transition row).
