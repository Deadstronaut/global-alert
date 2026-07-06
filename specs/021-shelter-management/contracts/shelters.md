# Contract: Shelters

No new API layer — writes/reads go directly through the Supabase JS client against
RLS-protected `shelters`, same pattern as `contacts` (spec 009) and `incidents` (spec 011).

## Create/update a shelter

**Operation**: `supabase.from('shelters').insert(payload)` /
`supabase.from('shelters').update(payload).eq('id', id)`

| Caller | Target `country_code` | Result |
|---|---|---|
| super_admin | any | Allowed |
| country_admin or org_admin | their own country | Allowed |
| country_admin or org_admin | a *different* country | Rejected by RLS (FR-007) |
| viewer | any | Rejected by RLS — no INSERT/UPDATE policy grants viewer write access |

Any INSERT/UPDATE where `capacity_occupied > capacity_total`, or `capacity_total <= 0`, is
rejected by the database's CHECK constraints regardless of caller role (FR-002/FR-003, SC-002).

## Deactivate a shelter

**Operation**: `supabase.from('shelters').update({ is_active: false }).eq('id', id)`

Same eligibility as update above. No hard DELETE policy exists for any role except super_admin's
`FOR ALL` — country_admin/org_admin only ever deactivate, matching `contacts`' FR-004 precedent
(FR-005).

## Read shelters

**Operation**: `supabase.from('shelters').select('*').eq('is_active', true)`

Any authenticated user (any role, any country) may read all active shelters (FR-008) — this is
the one deliberate deviation from `contacts`' country-scoped read shape; see research.md
Decision 1.

## Link/unlink an incident

**Operation**: `supabase.from('shelters').update({ linked_incident_id: incidentId | null }).eq('id', id)`

Same eligibility as update above (FR-009). If the referenced incident is later deleted,
`linked_incident_id` is set to `NULL` automatically by the FK's `ON DELETE SET NULL` action — no
application code path is required to maintain this (FR-010).

## Effect on `occupancyPercentage()`

| Scenario | Result |
|---|---|
| `capacity_total = 100`, `capacity_occupied = 40` | `40` |
| `capacity_total = 100`, `capacity_occupied = 100` | `100` |
| `capacity_total = 0` (should never occur on a persisted row, per FR-003) | `0` (defensive fallback) |
