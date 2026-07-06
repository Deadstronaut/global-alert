# Quickstart: Admin Panel Capability Grants

## Prerequisites

- Migration `20260707200000_profile_capability_grants.sql` applied to your Supabase project.
- At least one existing `country_admin` or `org_admin` test user, and the Super Admin test account.

## Scenario 1 — Grant a capability (US1)

1. Log in as Super Admin, open the admin panel's user list.
2. Find a `country_admin` test user's row; toggle on "Hazard Taxonomy".
3. Confirm the row now shows "Hazard Taxonomy" as active (US3 visibility).
4. Log in as that test user (or refresh their session).
5. **Expected**: the Hazard Taxonomy tab is now visible and usable (create/edit a hazard type or
   threshold succeeds). The SOP Repository, Map Layers, and Audit tabs remain hidden.

## Scenario 2 — Revoke a capability (US2)

1. As Super Admin, toggle off "Hazard Taxonomy" for the same test user from Scenario 1.
2. Log in as that test user again (or refresh their session).
3. **Expected**: the Hazard Taxonomy tab is hidden again; a direct write attempt against
   `hazard_types`/`hazard_thresholds` is rejected by RLS.

## Scenario 3 — Grants are independent per capability

1. As Super Admin, grant "Audit" (only) to an `org_admin` test user.
2. Log in as that user.
3. **Expected**: Audit tab visible and functional (same scope as Super Admin's audit view); Hazard
   Taxonomy, SOP Repository, and Map Layers tabs remain hidden.

## Scenario 4 — Viewer is not a valid grant target (edge case)

1. As Super Admin, attempt to grant any capability to a `viewer` test user (directly via the
   Supabase table editor or API, bypassing the UI which should not offer this option at all).
2. **Expected**: insert is rejected by the `BEFORE INSERT` trigger.

## Scenario 5 — Zero regression for ungranted users

1. Log in as a `country_admin`/`org_admin` test user with no capability grants at all (baseline,
   pre-existing test account).
2. **Expected**: admin panel behaves identically to before this feature shipped — none of the 4
   tabs are visible, exactly as today.

## Validation commands

```sh
npm run test      # existing suite must still pass, zero regressions
npm run build     # clean build
```

No new automated test files are added for this feature (see plan.md's Testing section — no
precedent for RLS-policy-level automated tests in this project; verified by quickstart scenarios
above instead, consistent with how prior RLS-only changes in this repo were validated).
