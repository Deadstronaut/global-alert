# Data Model: Shelter Management

## Entity: `shelters` (NEW table)

Represents a physical location where people can seek refuge during a hazard event.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | |
| `name` | `TEXT` | `NOT NULL` | |
| `country_code` | `VARCHAR(2)` | `NOT NULL` | Owning country, mirrors `contacts.country_code` |
| `org_id` | `UUID` | `REFERENCES organizations(id) ON DELETE SET NULL`, nullable | Optional, mirrors `contacts.org_id` |
| `lat` | `DOUBLE PRECISION` | nullable | Location, same shape as `incidents.lat` |
| `lng` | `DOUBLE PRECISION` | nullable | Location, same shape as `incidents.lng` |
| `capacity_total` | `INTEGER` | `NOT NULL`, `CHECK (capacity_total > 0)` | FR-003 |
| `capacity_occupied` | `INTEGER` | `NOT NULL DEFAULT 0`, `CHECK (capacity_occupied <= capacity_total)` | FR-002 |
| `status` | `TEXT` | `NOT NULL DEFAULT 'open'`, `CHECK (status IN ('open','closed','full'))` | FR-001 |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Soft-delete, mirrors `contacts.is_active` |
| `linked_incident_id` | `UUID` | `REFERENCES incidents(id) ON DELETE SET NULL`, nullable | FR-009/FR-010 |
| `created_by` | `UUID` | `REFERENCES auth.users(id) ON DELETE SET NULL`, nullable | |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Maintained by `set_updated_at()` trigger (reused) |

**Relationships**:
- Many-to-one with `organizations` via `org_id` (nullable, `ON DELETE SET NULL`, matching
  `contacts.org_id`).
- Many-to-one with `incidents` via `linked_incident_id` (nullable, `ON DELETE SET NULL`, matching
  `incidents.linked_cap_id`'s own shape) — FR-010's "deleting the incident clears the link,
  shelter unaffected" guarantee comes directly from this FK action, not application code.

**Validation rules** (from spec Functional Requirements):
- `capacity_occupied` MUST NOT exceed `capacity_total` at all times (FR-002) — enforced by
  `chk_shelter_capacity` CHECK constraint (research.md Decision 3).
- `capacity_total` MUST be positive (FR-003) — enforced by `chk_shelter_capacity_positive` CHECK
  constraint.
- `status` MUST be one of `open`, `closed`, `full` (FR-001) — enforced by a CHECK constraint.

## RLS Policy Additions

| Policy | Effect |
|---|---|
| `super_admin_shelters_all` | `role = 'super_admin'` may INSERT/UPDATE/DELETE/SELECT any row, any country (FR-006) |
| `country_scoped_shelters_select` | `role IN ('country_admin','org_admin') AND country_code = <own country>` may SELECT rows in their own country (mirrors `contacts`) |
| `country_scoped_shelters_insert` | same role/country condition, WITH CHECK on INSERT (FR-006/FR-007) |
| `country_scoped_shelters_update` | same role/country condition, USING on UPDATE (FR-006/FR-007) — no DELETE policy for these roles, deactivate-only, matching `contacts` |
| `authenticated_shelters_read` | `TO authenticated USING (is_active)` — **any** signed-in user (including `viewer`, and `country_admin`/`org_admin` outside their own country) may SELECT all active shelters, system-wide (FR-008) — the one deliberate deviation from the `contacts` pattern (research.md Decision 1) |

Note: `country_scoped_shelters_select` becomes redundant in practice once
`authenticated_shelters_read` exists (both grant SELECT, and the latter is broader), but is kept
for symmetry with the `contacts` pattern and so that a future narrowing of
`authenticated_shelters_read` (e.g., if system-wide read is ever revisited) does not silently
remove country_admin/org_admin's own-country read access.

## New pure function: `occupancyPercentage()`

```
occupancyPercentage(shelter: { capacity_total: number, capacity_occupied: number }): number
```

Returns `Math.round((capacity_occupied / capacity_total) * 100)`, or `0` if `capacity_total` is
falsy (defensive fallback against not-yet-loaded/malformed local state — the DB constraint already
guarantees `capacity_total > 0` for any persisted row, per FR-003/FR-011).
