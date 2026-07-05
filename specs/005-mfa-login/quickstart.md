# Quickstart: Validating MFA for Login

Prerequisites: spec 004 (profiles suspension/RLS, router guard pattern) already live. No new
external dependency — Supabase Auth's native TOTP MFA is already available on the project's
existing Auth configuration (no dashboard toggle required; `auth.mfa.*` is enabled by default on
Supabase projects).

## 1. Apply the migration

Adds `mfa_recovery_codes` and `mfa_role_policy` (seeded with all 4 roles at `required = false`).

## 2. Verify enrollment is reachable by every role (User Story 1)

- Log in as a Viewer (who, per spec 004, cannot reach `/admin`). Navigate to `/account-security`.
  Expected: page loads normally — this route carries no role restriction.
- Start enrollment; confirm a QR/secret is shown, scan it with any TOTP authenticator app, enter
  the resulting 6-digit code. Expected: factor becomes active, 10 recovery codes are displayed
  exactly once with a clear "save these now" warning.
- Refresh the page. Expected: the same recovery codes are never shown again; the factor shows as
  active in the account security list.

## 3. Verify the login challenge (User Story 2)

- Log out, log back in as the same user with the correct password. Expected: instead of landing
  in the app, a code-entry challenge screen appears.
- Enter an incorrect/expired code. Expected: access denied, generic "invalid code" message, stays
  on the challenge screen.
- Enter the current valid code from the authenticator app. Expected: signed in normally, same
  role/permissions as before this feature.
- Navigate directly to a protected URL (e.g., `/admin` as a country_admin) mid-challenge, before
  entering a code (e.g., by typing the URL in a second tab with the same session). Expected:
  redirected to the challenge screen, not the requested page.
- As a suspended (spec 004) account with an enrolled factor, attempt login. Expected: denied
  regardless of password/code correctness, at whichever step the suspension check fires.

## 4. Verify recovery codes (User Story 3)

- Using a fresh test enrollment's saved recovery codes, at the challenge screen choose "use a
  recovery code" and submit one. Expected: signed in successfully.
- Immediately attempt to reuse the exact same recovery code on a subsequent login attempt.
  Expected: rejected as invalid/already used.
- After the recovery-code login, navigate anywhere in the app. Expected: prompted to re-enroll a
  new authenticator (the old factor was removed server-side per research.md §3) and shown a fresh
  set of recovery codes once re-enrollment completes.

## 5. Verify per-role, per-deployment policy (User Story 4)

- As `super_admin`, run `UPDATE mfa_role_policy SET required = true WHERE role = 'country_admin';`
  directly against the database (no code change, no redeploy — spec SC-004).
- Log in as a country_admin with no enrolled factor. Expected: routed directly into
  `/account-security` with enrollment presented as required, not optional, before reaching any
  other protected route.
- Log in as an org_admin (policy still `required = false`). Expected: unaffected, logs in normally
  with enrollment remaining available but optional.
- As the now-MFA-required country_admin, attempt to remove their only active factor from
  `/account-security`. Expected: blocked (or requires enrolling a replacement first), since a
  mandatory factor cannot be dropped to zero (spec US4 acceptance scenario 3).

## 6. Run automated tests

```bash
npm run test               # Vitest — AAL-gating router logic, existing suites unaffected
deno test --no-check --allow-net --allow-env supabase/functions/  # verify-recovery-code tests
```
No regressions expected in spec 001–004's existing test suites — this feature does not touch
data-ingestion or the spec-004 profiles-RLS/suspend-user code paths, only login and a new,
independent account-security surface.
