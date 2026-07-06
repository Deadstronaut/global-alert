# Quickstart: Shelter Management

## Prerequisites

- Migration `20260707230000_shelters.sql` applied.
- A test Country Admin account for one country, a Viewer account, and the Super Admin test
  account. An existing open incident (any country) is useful for Scenario 4.

## Scenario 1 — Register a shelter (US1, FR-001)

1. Log in as a Country Admin (country `XX`); open the admin panel's new "Sığınaklar" tab.
2. Create a shelter with a name, location, total capacity (e.g. 200), and status `open`.
3. **Expected**: the shelter appears in the list with those exact values.

## Scenario 2 — Capacity/status update and invariant enforcement (US1, FR-002/FR-003)

1. Edit the shelter from Scenario 1: set current occupancy to 150.
2. **Expected**: succeeds, occupancy percentage shows 75%.
3. Attempt to set current occupancy to 250 (above total capacity 200).
4. **Expected**: rejected — occupancy can never exceed total capacity.
5. Attempt to create a new shelter with total capacity 0 or -5.
6. **Expected**: rejected — total capacity must be positive.

## Scenario 3 — System-wide read visibility (US2, FR-008)

1. Log in as a Viewer account (any country, including a country different from `XX`).
2. Open the shelter information view.
3. **Expected**: the shelter from Scenario 1 (country `XX`) is visible, along with its capacity,
   occupancy, and status — even though the Viewer's own country differs.
4. Confirm no create/edit/deactivate controls are available to this account.

## Scenario 4 — Incident association (US3, FR-009/FR-010)

1. As the Country Admin, link the shelter from Scenario 1 to an existing open incident in country
   `XX`.
2. **Expected**: the shelter's record shows the linked incident.
3. Delete (or otherwise remove) that incident.
4. **Expected**: the shelter's `linked_incident_id` clears automatically; the shelter record
   itself (name, capacity, occupancy, status) is unaffected.

## Scenario 5 — Cross-country write rejection (FR-007)

1. As the Country Admin from country `XX`, attempt to create or edit a shelter for a different
   country `YY` (e.g. via a direct Supabase client call bypassing the UI's own country lock).
2. **Expected**: rejected by RLS, not merely hidden in the UI.

## Scenario 6 — Deactivation and soft-delete (US1, FR-005)

1. Deactivate the shelter from Scenario 1.
2. **Expected**: it no longer appears in the active shelter list (for any role, including Viewer),
   but its historical record still exists in the database (confirmed via a direct query, not
   through the UI).

## Validation commands

```sh
npm run test   # existing suite + new shelterOccupancy.test.js must pass
npm run build  # clean build
```
