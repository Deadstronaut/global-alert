# Contract: Hazard Taxonomy CRUD

No new Edge Function — same direct-Supabase-client + RLS pattern as `data_sources`/`contacts` (not the `create-user`-style Edge Function pattern, which exists only because `auth.users` creation needs the service-role Admin API; plain table CRUD does not).

## Create/edit a hazard type
- Client: `supabase.from('hazard_types').insert/update(...)`.
- RLS enforces super_admin-only write (`super_admin_hazard_types_all`); a duplicate `code` surfaces as a normal Postgres unique-violation error, displayed as "code already exists" (FR-004).

## Deactivate (not delete)
- `supabase.from('hazard_types').update({ is_active: false })`. No DELETE policy is granted to any role in this phase (even super_admin) — hard delete of a hazard type referenced by years of historical event data has no legitimate use case identified; deactivation is the only supported lifecycle end-state (FR-003).

## Create/edit thresholds
- `supabase.from('hazard_thresholds').upsert({ hazard_type_code, metric_name, unit, breakpoints })`.
- Client-side validation (ascending `min_value`) runs before submit for immediate feedback; the `validate_hazard_breakpoints()` trigger re-validates server-side and raises on a violation, so a client bypassing the form (direct API call) can't save inconsistent breakpoints either (FR-006).

## Read (every other role, via existing selectors)
- `supabase.from('hazard_types').select('code, display_name').eq('is_active', true)` — permitted by `read_active_hazard_types` for any authenticated role.
- The `useHazardTypesStore` (research.md §3-4) wraps this query once per session and exposes `activeHazardTypes` + a synchronous `computeSeverity(hazardType, value)` built from a joined `hazard_thresholds` read, falling back to the bundled original `SEVERITY_FN` values if the store hasn't loaded/errored (FR-011).
