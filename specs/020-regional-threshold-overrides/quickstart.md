# Quickstart: Regional Hazard Threshold Overrides

## Prerequisites

- Migration `20260707220000_hazard_threshold_overrides.sql` applied.
- A test Country Admin account (or an Org Admin with the `hazard_taxonomy` capability grant from
  spec 018) for one country, and the Super Admin test account.

## Scenario 1 — Zero-regression baseline (FR-002)

1. As any user, enter a manual event for a hazard type with no override anywhere.
2. **Expected**: severity matches exactly what it would have before this feature existed (global
   registry threshold, or bundled fallback).

## Scenario 2 — Country Admin creates a working override (US1)

1. Log in as a Country Admin (country `XX`); open the Hazard Taxonomy admin area's new "Ülke
   Override'ları" section.
2. Create an override for one hazard type in country `XX` with different breakpoints than the
   global ones.
3. Enter a manual event for that hazard type in country `XX`, at a value that would classify
   differently under the global thresholds.
4. **Expected**: the event's severity reflects the override, not the global classification.

## Scenario 3 — Override is scoped to exactly one hazard type and one country (US1 Scenarios 3–4)

1. With the override from Scenario 2 still in place, enter a manual event for a *different* hazard
   type in country `XX`.
2. **Expected**: severity uses the global classification (unaffected).
3. Enter a manual event for the *same* overridden hazard type, but in a different country `YY`.
4. **Expected**: severity uses the global classification for country `YY` (unaffected).

## Scenario 4 — Edit and remove (US2)

1. Edit the override's breakpoints; enter another event in country `XX` for that hazard type.
2. **Expected**: severity reflects the updated breakpoints.
3. Remove the override; enter another event in country `XX` for that hazard type.
4. **Expected**: severity reverts to the global classification, identical to Scenario 1's baseline.

## Scenario 5 — Cross-country write is rejected (FR-008)

1. As the Country Admin from Scenario 2 (country `XX`), attempt to create/edit an override for a
   different country `YY` (e.g. via a direct Supabase client call bypassing the UI's own country
   lock).
2. **Expected**: rejected by RLS, not merely hidden in the UI.

## Scenario 6 — Super Admin manages any country (US3)

1. Log in as Super Admin; create an override for a country with no assigned admin at all.
2. **Expected**: succeeds, exactly as it would for any other country.

## Validation commands

```sh
npm run test   # existing suite + new hazardThresholdOverrides.test.js must pass
npm run build  # clean build
```
