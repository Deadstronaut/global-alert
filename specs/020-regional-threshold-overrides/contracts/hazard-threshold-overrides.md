# Contract: Hazard Threshold Overrides

No new API layer — writes go directly through the Supabase JS client against RLS-protected
`hazard_threshold_overrides`, same pattern as `hazard_thresholds` itself.

## Create/update an override (upsert)

**Operation**: `supabase.from('hazard_threshold_overrides').upsert({ hazard_type_code, country_code,
metric_name, unit, breakpoints }, { onConflict: 'hazard_type_code,country_code' })`

| Caller | Target `country_code` | Result |
|---|---|---|
| super_admin | any | Allowed |
| country_admin or org_admin, with `hazard_taxonomy` capability grant | their own country | Allowed |
| country_admin or org_admin, with `hazard_taxonomy` capability grant | a *different* country | Rejected by RLS `WITH CHECK` (FR-008) |
| country_admin or org_admin, WITHOUT the `hazard_taxonomy` capability grant, or viewer | any | Rejected by RLS — base role alone is never sufficient |

## Remove an override

**Operation**: `supabase.from('hazard_threshold_overrides').delete().eq('hazard_type_code',
code).eq('country_code', cc)`

Same eligibility table as above applies to `DELETE`. After removal, that hazard-type/country
combination reverts to the global classification, indistinguishable from one that never had an
override (FR-009).

## Read overrides

**Operation**: `supabase.from('hazard_threshold_overrides').select('*')`

Any authenticated user may read all overrides (severity resolution is computed client-side for
events in any country the user can see), matching `hazard_thresholds`'s own read-open shape.

## Effect on severity computation

| Scenario | `computeSeverity()` result |
|---|---|
| No override for `(hazardType, countryCode)` | Same as spec 010's existing behavior (registry global threshold, or bundled fallback) — FR-002 |
| Override exists for `(hazardType, countryCode)` | Override's breakpoints are evaluated instead — FR-003 |
| Override exists for a *different* hazard type in the same country | Unaffected hazard type still uses the global classification — FR-004 |
| Override exists for the same hazard type in a *different* country | Unaffected country still uses the global classification — FR-005 |
| No `countryCode` argument passed at all (legacy two-arg call) | Identical to pre-existing spec 010 behavior — no override lookup is attempted |
