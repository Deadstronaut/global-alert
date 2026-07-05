# Phase 1 Data Model: Administration & Access Hardening

## Modified table: `profiles`

One new column; no existing column removed or retyped.

| Field | Type | Notes |
|---|---|---|
| `is_active` | `BOOLEAN NOT NULL DEFAULT true` | **NEW**. `false` = suspended. Distinct from `role` (spec FR-005) — a suspended `country_admin` stays a `country_admin` on paper but loses both login and data access until reactivated. |

All other existing columns (`id`, `email`, `full_name`, `role`, `country_code`, `org_id`,
`created_at`, `updated_at`) are unchanged.

### New RLS policies on `profiles`

| Policy | Applies to | Rule |
|---|---|---|
| `country_admin_read_own_country_profiles` (SELECT) | country_admin | `current_profile_role() = 'country_admin' AND country_code = current_profile_country_code()` |
| `org_admin_read_own_org_profiles` (SELECT) | org_admin | `current_profile_role() = 'org_admin' AND country_code = current_profile_country_code() AND org_id = current_profile_org_id()` |
| `country_admin_update_own_country_profiles` (UPDATE) | country_admin | `USING`: row's current `role IN ('org_admin','viewer') AND country_code = current_profile_country_code()`. `WITH CHECK`: new row's `role IN ('org_admin','viewer') AND country_code = current_profile_country_code()` (country_admin cannot move a user to another country, nor promote past org_admin). |
| `org_admin_update_own_org_profiles` (UPDATE) | org_admin | `USING`: row's current `role = 'viewer' AND country_code = current_profile_country_code() AND org_id = current_profile_org_id()`. `WITH CHECK`: same, plus new row's `role = 'viewer'` (org_admin can only ever touch viewer-role rows, and cannot change that role). |

These are additive alongside the existing `users_read_own_profile`,
`super_admin_read_all_profiles`, `super_admin_update_profiles`, and (narrowed, see below)
`users_update_own_profile` policies — Postgres RLS policies are OR'd together per operation, so
existing super_admin/self-row behavior is unchanged.

### Modified helper function: `current_profile_role()`

Redefined (same function signature, `SECURITY DEFINER STABLE`, same call sites everywhere else in
the codebase unaffected) to return `NULL` for a suspended profile instead of its stored role:

```sql
CREATE OR REPLACE FUNCTION current_profile_role() RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN is_active THEN role ELSE NULL END FROM profiles WHERE id = auth.uid()
$$;
```

Every existing policy across `cap_drafts`, `incidents`, `drill_sessions`, `data_sources`,
`source_state_transitions`, `rejected_payloads`, and now `profiles` itself, which compares
`current_profile_role()` to a specific role string, automatically stops matching for a suspended
user — no per-table policy edits required elsewhere.

### New helper functions

```sql
CREATE OR REPLACE FUNCTION current_profile_country_code() RETURNS VARCHAR(2)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT country_code FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION current_profile_org_id() RETURNS UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$;
```

### Modified trigger: `prevent_self_role_escalation`

Extended with one additional guard clause (same trigger, same function name, still fires
`BEFORE UPDATE ON profiles`):

- Existing behavior unchanged: non-super_admin callers cannot change `NEW.role` on any row.
- **New**: non-super_admin, non-scoped-admin callers (i.e., a caller updating their *own* row via
  `users_update_own_profile`, not via one of the new scoped-admin policies above) cannot change
  `NEW.country_code` or `NEW.org_id` on their own row either — closes spec FR-012/FR-013's
  "no self-assigned scope" requirement. `full_name` and other non-privileged fields remain
  self-editable.

### Modified trigger function: `handle_new_user()`

Reverts to inserting `country_code = NULL` unconditionally on signup — stops reading
`NEW.raw_user_meta_data->>'country_code'`. Admin-provisioned accounts are unaffected (the
`create-user`/`suspend-user` Edge Functions set `country_code` via a separate service-role
`UPDATE` after insert, which always bypasses this trigger's insert-time default).

## New Edge Function: `suspend-user`

Not a new table — a new Deno function following `create-user`'s existing
auth-header-to-caller-profile resolution pattern.

| Field | Type | Notes |
|---|---|---|
| `target_user_id` | UUID | Required. The account to suspend or reactivate. |
| `action` | `'suspend' \| 'reactivate'` | Required. |

**Server-side authorization** (mirrors `create-user`'s hierarchy checks, per spec FR-008):

- Caller must be `super_admin`, `country_admin`, or `org_admin`.
- Caller cannot target their own `id` (spec edge case: no self-suspend).
- `super_admin` may suspend/reactivate anyone except cannot suspend themself.
- `country_admin` may only target rows where `role IN ('org_admin', 'viewer')` AND
  `country_code = caller.country_code` (cannot touch another country_admin or any super_admin).
- `org_admin` may only target rows where `role = 'viewer'` AND `country_code = caller.country_code`
  AND `org_id = caller.org_id`.

**Effect of `action: 'suspend'`**:
1. `profiles.is_active = false` for `target_user_id` (service-role `UPDATE`, triggers the existing
   `audit_profiles` trigger automatically).
2. `auth.admin.updateUserById(target_user_id, { ban_duration: '87600h' })`.

**Effect of `action: 'reactivate'`**: the inverse of both steps
(`is_active = true`, `ban_duration: 'none'`).

## Modified Edge Function: `create-user`

- Request body's `password` field is removed.
- `auth.admin.createUser({ email, password, email_confirm: true, ... })` is replaced with
  `auth.admin.inviteUserByEmail(email, { data: { ... } })`.
- All existing hierarchy-enforcement logic (who may create what role/country/org) is unchanged —
  only the account-creation call itself changes from password-based to invite-based.

## Relationships

```
profiles.is_active (new column) ──> read by current_profile_role() (modified helper)
                                 ──> read by every existing role-scoped RLS policy (cap_drafts,
                                     incidents, drill_sessions, data_sources,
                                     source_state_transitions, rejected_payloads, profiles)

suspend-user Edge Function ──> UPDATE profiles (triggers existing audit_profiles trigger)
                            ──> auth.admin.updateUserById (Supabase Auth Admin API, no local table)

create-user Edge Function ──> auth.admin.inviteUserByEmail (Supabase Auth Admin API)
                           ──> UPDATE profiles (triggers existing audit_profiles trigger, unchanged)
```

No changes to `organizations`, `cap_drafts`, `incidents`, `drill_sessions`, `data_sources`, or any
disaster-event table — this feature is scoped entirely to `profiles`, its RLS policies/triggers,
and the two Edge Functions above.
