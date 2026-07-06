# Contract: Hazard Taxonomy Hierarchy & Encyclopedia

## Write path (unchanged authorization, extended payload)

`hazardTypesStore.updateHazardType(code, payload)` (existing function, spec 010) — `payload` MAY
now include `parent_code: string | null`. No new function is introduced. Authorization is
unchanged: governed entirely by the existing `super_admin_hazard_types_all` RLS policy (super_admin
full access; a `hazard_taxonomy` capability-grant holder per spec 018 also has write access since
that grant is itself implemented as an additional RLS policy alongside, not instead of, the
super_admin one).

**Errors surfaced to the caller** (from the new DB trigger, propagated as a Postgres error the
existing `try/catch` in `HazardTypeFormModal.vue`'s save handler already displays):
- `invalid_hazard_parent: a hazard type cannot be its own parent`
- `invalid_hazard_parent: assigning % as parent of % would create a cycle`

## Read path (existing, unchanged)

`hazardTypesStore.fetchHazardTypes()` (existing) now also returns `parent_code` per row (via
`SELECT *`, already unrestricted to explicit columns) — no store change needed for the fetch
itself, only for consumption.

## New UI contract: Hazard Encyclopedia page

- Route: `/hazards`, no `meta.roles` (reachable by any signed-in role, including `viewer`).
- Component: `HazardEncyclopediaView.vue` → mounts `HazardEncyclopediaPanel.vue`.
- Data: read-only, sourced entirely from `useHazardTypesStore()`'s already-cached
  `activeHazardTypes`/`hazardTypes`/`thresholds` — no new Supabase query.
- Renders, per active hazard type: `display_name`, `category`, `description`, parent (if any, as
  "Part of: {parent.display_name}"), children (if any, as "Includes: {child.display_name}, ..."),
  and threshold breakpoints (if configured) as a read-only list of
  `{severity} — {metric_name} ≥ {min_value} {unit}`.
- No edit/create/deactivate controls anywhere on this page (FR-007).
