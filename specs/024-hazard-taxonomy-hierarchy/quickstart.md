# Quickstart: Hazard Taxonomy Hierarchy & Encyclopedia

## Prerequisites

- Apply migration `supabase/migrations/20260708000000_hazard_taxonomy_hierarchy.sql` (user runs
  the Supabase CLI command themselves — never applied directly by the assistant).
- `npm install` / `npm run dev` running locally with a Super Admin and a Viewer test account.

## Scenario 1: Assign a valid parent (US1, SC-001)

1. Sign in as Super Admin → Admin → Hazard Taxonomy tab.
2. Edit hazard type "Flood" (or add a new "Flash Flood" type) and set its parent to "Flood".
3. Save. Expected: saved instantly, taxonomy table shows the parent for the edited row.

## Scenario 2: Reject self-reference (US1, SC-002)

1. Edit hazard type "Flood", attempt to set its own parent to "Flood".
2. Expected: save is rejected with a clear inline error, no row is changed.

## Scenario 3: Reject a cycle (US1, SC-002)

1. With "Flash Flood"'s parent already set to "Flood", edit "Flood" and attempt to set its parent
   to "Flash Flood".
2. Expected: save is rejected with a clear inline error (cycle), no row is changed.

## Scenario 4: Clear a parent (US1)

1. Edit "Flash Flood", clear the parent dropdown back to "(none)", save.
2. Expected: "Flash Flood" becomes top-level again.

## Scenario 5: Viewer browses the encyclopedia (US2, SC-003)

1. Sign in as a Viewer-role account (no admin access).
2. Navigate to `/hazards` (new sidebar link).
3. Expected: every active hazard type is listed with description, category, parent/children
   relationship (e.g., "Flash Flood — Part of: Flood"), and threshold breakpoints; no edit
   controls are visible anywhere on the page.

## Scenario 6: Deactivated hazard types excluded (US2, FR-009)

1. As Super Admin, deactivate any hazard type.
2. As Viewer, reload `/hazards`.
3. Expected: the deactivated hazard type no longer appears in the list.
