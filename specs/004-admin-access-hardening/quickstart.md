# Quickstart: Validating Administration & Access Hardening

Prerequisites: features 001–003 already live (auth, RBAC scaffolding, `profiles`/`organizations`
tables, `current_profile_role()` helper). No frontend framework change.

## 0. Per-deployment Supabase project configuration (not a migration, not app code)

This platform is deployed per-country/per-tenant, each on its own Supabase project — this step is
performed by whoever administers **that specific project**, not applied once by this repository on
behalf of every deployment.

In that project's Supabase dashboard, set **Auth → Email Templates/Settings → Mailer OTP Expiry**.
The recommended default documented by this feature is `172800` seconds (48 hours) — see
research.md §4 — but each deployment's operator may choose a different value appropriate to their
own security posture; the application places no requirement on the exact number. This setting
affects all invite/magic-link/recovery emails project-wide; if a given deployment has no other
magic-link flow, there is no conflicting side effect from changing it.

## 1. Apply the migration

Adds `profiles.is_active`, the two new `SECURITY DEFINER` helpers
(`current_profile_country_code()`, `current_profile_org_id()`), redefines
`current_profile_role()`, adds the 4 new `profiles` RLS policies, extends
`prevent_self_role_escalation`, and reverts `handle_new_user()`'s metadata read (data-model.md).

## 2. Verify the router guard (User Story 1)

- Log in as a Viewer, navigate directly to `/admin` (type the URL). Expected: immediately
  redirected away; open browser dev tools' Network tab and confirm no `profiles`/`organizations`/
  `drill_sessions`/`data_sources` requests fire at all.
- Repeat as Country Admin, Org Admin, Super Admin — each reaches `/admin` normally, unchanged from
  today.
- Log out entirely, navigate to `/admin` — redirected to `/login` (existing, unchanged behavior).

## 3. Verify country/org-scoped user management (User Story 2)

- Log in as a Country Admin for country `tr`. Open the Users tab. Expected: every `tr`-scoped
  account appears (not just your own row) — org_admins, viewers, and any other country_admins for
  `tr`.
- Edit one `tr` org_admin's organization assignment and save. Expected: succeeds.
- Attempt (via direct API call, since the UI won't offer it) to update a user in a different
  country. Expected: RLS denies the write.
- Log in as an Org Admin. Open the Users tab. Expected: only your own organization's viewer
  accounts appear.
- As the Country Admin, attempt to edit your own row's `role` field. Expected: still blocked by the
  existing `prevent_self_role_escalation` trigger (no regression).

## 4. Verify suspension (User Story 3)

- As an authorized admin, suspend a Viewer account (`suspend-user` Edge Function, `action:
  "suspend"`). Confirm the `profiles` row's `is_active` becomes `false` and an `audit_log` row
  appears for that `profiles` update.
- Attempt to log in as the suspended user. Expected: login rejected.
- If that user had an existing valid session before suspension, confirm any subsequent request
  against a role-scoped table (e.g., their own country's `incidents`) is denied within a few
  minutes (current_profile_role() now returns `NULL` for them).
- Reactivate the account (`action: "reactivate"`). Confirm login succeeds again with their
  original role/scope intact (unchanged by the suspend/reactivate cycle).
- Attempt to have a Country Admin suspend a Super Admin, another Country Admin, or themselves.
  Expected: all three rejected (403).

## 5. Verify invite-based onboarding (User Story 4)

- As an authorized admin, provision a new account via the Users tab form (email/role/scope only —
  no password field present). Expected: `create-user` returns success; the new address receives a
  Supabase invite email with a "set your password" link.
- Follow the link, set a password. Expected: subsequent login with that password succeeds.
- Wait past 48 hours (or manually expire in a lower environment) and attempt to use an unused
  invite link. Expected: rejected as expired.

## 6. Verify no hidden self-registration path (User Story 5)

- Confirm no `/register` or `/signup` route exists in `src/router/index.js` (already true today,
  unchanged).
- Attempt a direct Supabase Auth `signUp()` call with `user_metadata: { country_code: 'tr' }`
  (e.g., via browser console against the anon key). Expected: the resulting `profiles` row has
  `country_code = NULL` regardless of the metadata sent (handle_new_user() no longer reads it).
- Attempt to have a freshly self-registered (or any Viewer) user `UPDATE` their own
  `country_code` or `org_id` via a direct API call. Expected: rejected by the extended
  `prevent_self_role_escalation` trigger. Attempt to update their own `full_name`. Expected: still
  allowed (FR-013 preserved).

## 7. Run automated tests

```bash
npm run test               # Vitest — router-guard unit tests, existing suites unaffected
deno test --no-check --allow-net --allow-env supabase/functions/  # create-user/suspend-user tests
```
No regressions expected in existing `sourceScope`, `validatePayload`, `sourceHealth`, or
`gdacsSplit` test suites — this feature does not touch data-ingestion code paths.
