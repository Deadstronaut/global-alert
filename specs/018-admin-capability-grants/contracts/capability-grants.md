# Contract: Capability Grant / Revoke

This project has no REST API layer for admin actions like this — writes go directly through the
Supabase JS client against RLS-protected tables (same pattern as `contacts`, `data_sources`, etc.).
This contract documents the expected client-side operations and their RLS-enforced outcomes.

## Grant a capability

**Operation**: `supabase.from('profile_capability_grants').insert({ profile_id, capability,
granted_by: currentUserId })`

**Preconditions**: Caller is authenticated and `current_profile_role() = 'super_admin'`; target
`profile_id` currently has `role IN ('country_admin', 'org_admin')`.

**Outcomes**:
| Caller role | Target role | `capability` value | Result |
|---|---|---|---|
| super_admin | country_admin or org_admin | one of the 4 valid values | Row inserted (or no-op if already granted — `ON CONFLICT (profile_id, capability) DO NOTHING`) |
| super_admin | viewer | any | Rejected — trigger raises exception (FR-003) |
| super_admin | super_admin | any | Rejected — trigger raises exception (grants are meaningless for Super Admin, FR-003 scope) |
| country_admin / org_admin / viewer | (any) | (any) | Rejected — RLS denies the INSERT (FR-004) |

## Revoke a capability

**Operation**: `supabase.from('profile_capability_grants').delete().eq('profile_id',
targetProfileId).eq('capability', capability)`

**Preconditions**: Caller is authenticated and `current_profile_role() = 'super_admin'`.

**Outcomes**:
| Caller role | Result |
|---|---|
| super_admin | Row deleted if present; no-op if not present (idempotent revoke) |
| anyone else | Rejected — RLS denies the DELETE |

## Read own/other grants

**Operation**: `supabase.from('profile_capability_grants').select('*')`

**Outcomes**:
| Caller role | Visible rows |
|---|---|
| super_admin | All rows (for the user-list capability display, US3) |
| any other role | Only rows where `profile_id = auth.uid()` (own grants, consumed by `auth.js` at session load) |

## Effect of a granted capability on the 4 covered areas

For each of `hazard_types`/`hazard_thresholds` (capability `hazard_taxonomy`), `sop_documents`
(capability `sop_repository`), `map_layers` (capability `map_layers`), `audit_log` (capability
`audit`, read-only):

| Grantee has capability? | Access to that specific area |
|---|---|
| Yes | Identical to what `super_admin` already has for that table (per FR-006) |
| No | Identical to current pre-feature behavior for their base role (per FR-010 — no regression) |

Access to the other 3 areas, and to any other Super-Admin-only ability (create-user, suspend-user,
dispatch retry, etc.) is unaffected by any capability grant (FR-007).
