# Quickstart: Validating Partner Review Response Bundle

Prerequisites: local Supabase stack running (`supabase start`), frontend dev server running (`npm run dev`), logged in as a `super_admin` (or `country_admin`/`org_admin` where noted) test account for a country that has 2D map data.

## 1. Layer legend only when active (US1) + consolidated 2D panel (US2)

1. Open the 2D Map View for a country with hazard, shelter, and exposure layers configured.
2. Confirm Disaster Filters, Shelters, Wind & Current, and Exposure all appear as sections of one left-side panel, each collapsed by default.
3. Expand only the Disaster Filters section and toggle one hazard layer on.
4. **Expected**: that layer's legend and opacity/filter controls appear; no other layer shows legend/controls; the other three panel sections remain collapsed and the map remains the majority of the viewport.
5. Toggle the layer off. **Expected**: its legend/controls disappear immediately.
6. Open the 3D/Globe View. **Expected**: behavior is unchanged from before this feature (not consolidated, per explicit scope cut).

## 2. SOP document upload (US3)

1. As an authorized SOP editor, open SOP Documents → New.
2. Choose "Upload file" instead of typing body content; select a sample PDF under the size limit.
3. **Expected**: upload succeeds, entry is created with the file referenced.
4. Attempt to upload a `.zip` file. **Expected**: rejected client-side with a clear error, before any network call.
5. Attempt to upload a PDF larger than the configured limit. **Expected**: rejected with a clear error.
6. Trigger "Request AI Summary" on the uploaded-document entry. **Expected**: existing AI-summary review/approve/reject flow runs exactly as it does for typed entries today.

## 3. CAP warning radius (US4)

1. Open CAP Warnings → New Draft.
2. **Expected**: a "Warning Radius (km)" field is present and optional.
3. Enter a negative or zero value and attempt to save. **Expected**: validation error, save blocked.
4. Enter a valid positive value, save, reopen the draft. **Expected**: value persists and displays.
5. Publish the alert. **Expected**: radius is visible on the published alert view.
6. Leave radius blank and publish. **Expected**: publish succeeds (field remains optional).

## 4. District-level (ADM2) impact analysis (US5)

1. Open Impact Analyzer for a country with known district-level data (e.g., Turkey, Madagascar, or Malaysia per existing bundled datasets).
2. Switch the administrative-level selector from Province to District, pick a district.
3. **Expected**: the exposure/impact summary scopes to that district only (different, narrower numbers than the province-level view for the same location).
4. Switch to a country without district-level data. **Expected**: the district option is disabled or clearly marked unavailable, not silently returning province/country-level numbers mislabeled as district.

## 5. Contact Directory clarity (US6)

1. Open the admin navigation menu and locate the Contact Directory entry.
2. **Expected**: label and/or page header text make clear this manages alert-dissemination recipients, not a general public contact book.

## 6. Scenario Modeling relocation (US7, navigation only)

1. As a user who currently has access to Scenario Modeling (e.g., super_admin), open Impact Analyzer.
2. **Expected**: an "Advanced" mode/tab is present that opens Scenario Modeling, functionally identical to before.
3. Confirm Scenario Modeling no longer appears as a separate top-level item alongside other admin panels in `AdminView.vue`.
4. **Expected**: no access-level change — anyone who could reach Scenario Modeling before this change can still reach it after, and this release does not restrict it to specific roles (that's Story 7b, tracked separately, not implemented here).

## i18n check (cross-cutting)

For each of the above, switch the active locale through at least `en`, `tr`, and `ar` (RTL) and confirm all new/changed strings (panel section labels, upload control, radius field label, district selector option, Contact Directory copy, "Advanced" mode label) are translated (not falling back to raw keys) and RTL layout remains correct for Arabic.
