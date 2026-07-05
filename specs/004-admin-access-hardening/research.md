# Phase 0 Research: Administration & Access Hardening

## §1. Router guard mechanism (gap 1)

**Decision**: Add `meta: { roles: ['super_admin', 'country_admin', 'org_admin'] }` to the `/admin`
route in `src/router/index.js`, and extend the existing `router.beforeEach` guard (which already
awaits `auth.init()` and checks `to.meta.public`) with a second check: if `to.meta.roles` is set
and `auth.session.role` is not in that list, redirect to `home` (not `login` — the user IS
authenticated, just not authorized; redirecting to `login` would be misleading).

**Rationale**: `auth.init()` already resolves the session (including `role`) before the guard's
existing logic runs, so `auth.session?.role` is available synchronously at the point the guard
needs it — no extra async work. This mirrors the guard's existing `to.meta.public` pattern
(declarative per-route meta) rather than inventing a new authorization primitive.

**Alternatives considered**: A `v-if` wrapper at the top of `AdminView.vue` that unmounts children
when unauthorized — rejected because `onMounted` (and therefore all the admin data-fetching calls)
still fires before a template-level `v-if` can prevent it; the whole point of this gap is to stop
those requests from firing at all for unauthorized roles, which only a router-level (pre-navigation)
guard can do.

## §2. Profiles RLS scoping without recursion (gap 2)

**Decision**: Add two new `SECURITY DEFINER STABLE` helper functions alongside the existing
`current_profile_role()` (defined in `20260703120300_fix_profiles_rls_recursion.sql`):
`current_profile_country_code()` and `current_profile_org_id()`, both `SELECT ... FROM profiles
WHERE id = auth.uid()` under `SECURITY DEFINER` (bypasses RLS internally, exactly like
`current_profile_role()`). New `profiles` SELECT/UPDATE policies for country_admin/org_admin are
built from these three helpers instead of a direct `EXISTS (SELECT ... FROM profiles ...)`
subquery, which is what caused the original recursion bug this project already hit once.

**Rationale**: This is the exact, already-proven fix pattern in this codebase (see
`20260703120300_fix_profiles_rls_recursion.sql`'s own explanatory comment) — reusing it for the
two new scoping dimensions (country, org) is the smallest change that avoids re-introducing the
same class of bug (Constitution Principle VIII).

**Alternatives considered**: A single JSON/composite-returning helper (`current_profile_scope()`
returning `(role, country_code, org_id)` in one call) — rejected as a premature optimization; three
separate scalar functions are simpler to reason about and test independently, and profile lookups
here are cheap, low-frequency (admin-panel actions, not hot-path event ingestion).

**Column-level restriction**: Postgres RLS `UPDATE` policies support both `USING` (which existing
rows are visible/editable) and `WITH CHECK` (whether the resulting new row is allowed). The new
country_admin/org_admin `UPDATE` policies need `WITH CHECK` clauses constraining the *new* row's
role to the allowed target set (e.g., country_admin's `WITH CHECK` requires `NEW.role IN
('org_admin', 'viewer')`), not just the old row's visibility — otherwise a country_admin could see
an org_admin row (via `USING`) but the `WITH CHECK` gap would let them set `role = 'super_admin'`
on save. Confirmed via Postgres RLS docs: `WITH CHECK` defaults to the same expression as `USING`
if omitted, which is NOT what's wanted here — the two must be written explicitly and differently
for country_admin/org_admin update policies.

## §3. Real suspension: Supabase Auth native ban vs. custom column (gap 3)

**Decision**: Use both, together — they solve two different halves of FR-005/FR-006:
1. Add `profiles.is_active BOOLEAN NOT NULL DEFAULT true`, and redefine
   `current_profile_role()` to return the stored role only `WHEN is_active`, else `NULL`
   (`SELECT CASE WHEN is_active THEN role ELSE NULL END FROM profiles WHERE id = auth.uid()`).
   Since virtually every role-scoped RLS policy in this codebase already routes through
   `current_profile_role()` (cap_drafts, incidents, drill_sessions, data_sources,
   source_state_transitions, rejected_payloads, and now profiles itself), a suspended user's
   `current_profile_role()` becomes `NULL` and every one of those policies stops matching on
   their very next request — this is what actually satisfies "an already-active session loses
   access within 5 minutes" (SC-003), since it doesn't depend on their JWT expiring.
2. Also call Supabase Auth Admin's `updateUserById(id, { ban_duration: '87600h' })` (10 years,
   Supabase's own documented pattern for an effectively-permanent ban, reversed by
   `ban_duration: 'none'`) so a suspended user's *next login attempt* is rejected at the auth layer
   itself (satisfies FR-005's "immediately prevents login"), not merely at the data layer.

**Rationale**: Relying on `ban_duration` alone would satisfy "can't log in again" but NOT "loses
access within 5 minutes if already logged in" — a valid, unexpired JWT keeps working against RLS
until Supabase itself re-checks ban status (which happens at token refresh, not on every request).
Relying on the `is_active`/`current_profile_role()` change alone would cut off data access quickly
but would still let a banned-in-name-only user's password keep authenticating a *new* session
(GoTrue's own login endpoint doesn't consult `profiles.is_active`, only its own `banned_until`).
Combining both closes both halves with two small, independent, already-idiomatic mechanisms.

**Alternatives considered**: Building a custom per-request session-validity check (e.g., a
Postgres `age(now(), token_issued_at) < 5 minutes` circuit-breaker) — rejected as unnecessary
complexity (Principle VIII); the `current_profile_role()` NULL-out approach achieves the same
practical outcome using infrastructure that already exists everywhere in this codebase.

## §4. Invite/magic-link onboarding (gap 4)

**Decision**: Replace `create-user`'s current `auth.admin.createUser({ email, password,
email_confirm: true })` call with `auth.admin.inviteUserByEmail(email, { data: {...} })` — this is
Supabase's built-in "admin creates the account, user sets their own password via emailed link"
primitive, already available on the exact same `auth.admin.*` surface `create-user` already uses
(no new dependency). The `password` field is removed entirely from both the Edge Function's request
body and `AdminView.vue`'s create-user form.

**Expiry (recommended default 48 hours per spec FR-011)**: Supabase's invite/magic-link emails
share one project-wide "Mailer OTP Expiry" setting (in seconds) that applies to all OTP-style
emails (invite, magic link, recovery) — there is no per-call expiry override in `supabase-js` v2's
`inviteUserByEmail`, and this setting lives on each Supabase *project*, not in this codebase. Since
this platform is deployed per-country/per-tenant (each running its own Supabase project), this
value cannot be set once by this repository on behalf of every deployment — it is documented in
`quickstart.md` as a recommended default (`172800` seconds / 48 hours) that whoever administers a
given deployment's Supabase project configures for that project. This repository's own
development/reference project may set it to the recommended value, but the application code has
no dependency on any specific number — it only depends on Supabase's invite mechanism existing.

**Alternatives considered**: Building a fully custom `invitations` table (token, expires_at) plus a
custom "accept invite" page, giving per-invite expiry control independent of any global setting —
rejected for now per Principle VIII/YAGNI: the project-wide setting achieves the spec's actual
requirement (48h expiry) with zero new schema or custom token-verification code; it only becomes
insufficient if a future feature needs a *different* expiry for a *different* magic-link flow,
which is not a current requirement.

## §5. Reconciling orphaned self-registration (gap 5)

**Decision**: Two small, independent changes:
1. `handle_new_user()` (the `on_auth_user_created` trigger function) stops reading
   `NEW.raw_user_meta_data->>'country_code'` — new rows always insert with `country_code = NULL`
   (the pre-`20260703120400_registration_country_code.sql` behavior). Admin-provisioned accounts are
   unaffected: `create-user`'s subsequent service-role `UPDATE` already sets `country_code`
   explicitly regardless of what the trigger inserted.
2. `users_update_own_profile`'s effective column scope is narrowed: the existing
   `prevent_self_role_escalation` trigger already blocks self-service `role` changes for
   non-super_admins; it is extended (same trigger function, same trigger, one more `IF` branch) to
   also raise an exception if a non-super_admin, non-scoped-admin caller's `UPDATE` changes
   `country_code` or `org_id` on their own row. `full_name` (and any other non-privilege field)
   remains freely self-editable, satisfying spec FR-013.

**Rationale**: Both changes are additive/subtractive edits to functions and triggers that already
exist for exactly this purpose (self-registration support, self-escalation prevention) — no new
policy or trigger object is introduced, matching Principle VIII.

**Alternatives considered**: Dropping the `users_update_own_profile` policy entirely — rejected
because it would also remove the legitimate ability to self-edit `full_name`, which spec FR-013
explicitly wants preserved.

## §6. Audit trail wiring (FR-014, Constitution Principle V)

**Decision**: Reuse the existing generic `log_table_change()` trigger function (the one already
attached to `profiles`, `organizations`, and `data_sources` per
`20260703120200_fix_log_table_change_search_path.sql`'s comment) — since `profiles` already has
this trigger attached from its original migration, suspend/reactivate/role-scope changes made via
direct `UPDATE` on `profiles` are automatically captured with no additional wiring. The new
`suspend-user` Edge Function's actions are themselves just `profiles` `UPDATE`s (setting
`is_active`) plus an `auth.admin.updateUserById` ban call — the `profiles` `UPDATE` half is
automatically audited by the existing trigger; the `ban_duration` half is an Auth Admin API call
with no corresponding table row to trigger off, so `suspend-user`'s response/logs are the record of
that half (consistent with how `create-user` today has no separate audit-table row for the
`auth.admin.createUser` call either — the `profiles` insert triggers the existing audit path).

**Rationale**: Zero new schema for FR-014 — the append-only `audit_log` table this codebase
already has is Principle V's intended mechanism, and it already fires on `profiles` updates.

**Alternatives considered**: A dedicated `admin_actions` table specifically for suspend/reactivate
events — rejected per Principle VIII; the generic `audit_log` table already captures `table_name:
'profiles'`, `action: 'UPDATE'`, `old_data`/`new_data` (which will show `is_active: true → false`),
and `changed_by`, which is sufficient to answer "who suspended whom and when."
