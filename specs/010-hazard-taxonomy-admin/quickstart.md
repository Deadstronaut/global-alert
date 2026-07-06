# Quickstart: Hazard Taxonomy Admin

## Prerequisites
- Migration applied: `hazard_types` + `hazard_thresholds` tables, RLS, audit triggers, seed data (9 hazard types + their thresholds).
- A `super_admin` account and at least one `country_admin`/`viewer` account for negative-access testing.

## Scenario 1 — Registry visibility and access control (User Story 1)
1. Log in as `super_admin`, open the new "Hazard Taxonomy" admin tab.
2. Confirm all 9 seeded hazard types appear with their category and "Active" status.
3. Add a new hazard type (e.g. code `landslide`, category `geo`). Confirm it saves and appears in the list immediately.
4. Attempt to add another hazard type with code `landslide` again — confirm it's rejected with a clear duplicate-code message.
5. Deactivate one existing hazard type (not one referenced by live demo data, to keep this reversible). Confirm its status flips to "Inactive" but it's not removed from the list.
6. Log in as `country_admin`/`viewer`; confirm the Hazard Taxonomy tab is not accessible.

## Scenario 2 — Threshold editing changes live severity classification (User Story 2)
1. As `super_admin`, open earthquake's threshold editor; confirm the pre-seeded breakpoints match today's hardcoded values (2.5/4.0/5.5/7.0).
2. Change the "critical" breakpoint from 7.0 to 7.5. Save.
3. Go to the Manual Entry form, submit a test earthquake event with magnitude 7.2. Confirm it's classified "high", not "critical" — proving live severity computation reads the updated config.
4. Revert the breakpoint back to 7.0 to restore original behavior.
5. Attempt to save breakpoints out of ascending order (e.g. set "high" minimum higher than "critical" minimum). Confirm this is rejected with a validation error.

## Scenario 3 — Zero-regression check for existing hazard types (User Story 2, SC-003)
1. Before any edits, submit a magnitude-6.0 test earthquake via Manual Entry and confirm it classifies as "high" (matching today's pre-feature behavior exactly).
2. Repeat for one or two of the other 4 pre-seeded types (e.g. wildfire frp=300 → "high") to confirm the seed data reproduces `SEVERITY_FN` exactly.

## Scenario 4 — New hazard type propagates to all 6 selectors without a code change (User Story 3)
1. Add the `landslide` hazard type from Scenario 1 (or a fresh one).
2. Open each of: Contacts "Afet Tipi Filtresi" dropdown, File Import hazard-type select, Manual Entry hazard-type select, Source Form hazard-type select, CAP alert authoring hazard-type select, Incidents hazard-type select.
3. Confirm `landslide` appears as a selectable option in every one of the 6, with no redeploy between adding it and seeing it appear.
4. Deactivate `landslide`; confirm it disappears from all 6 selectors' options for *new* entries, without affecting any already-saved data referencing it.

## Scenario 5 — Registry-unreachable fallback (User Story 3, SC-005)
1. Simulate the registry being unreachable (e.g. temporarily block the `hazard_types` request in browser devtools, or test on a fresh session before the store has loaded).
2. Confirm each of the 6 forms still shows a non-empty, usable hazard-type selector (the bundled fallback list), rather than an empty dropdown.
