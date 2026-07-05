# Quickstart: Audit & Compliance Viewer Validation

## Prerequisites

- Migration `<timestamp>_audit_log_hash_chain.sql` applied (adds `seq`, `chain_hash`, trigger,
  `verify_audit_chain()`).
- At least one super_admin test account, and one non-super_admin (e.g., country_admin) account.

## Scenario 1 — Browse and filter

1. Log in as super_admin, open the new Audit tab in AdminView.vue.
2. Perform an action that generates an audit entry (e.g., suspend a test user via spec 004's flow).
3. Filter by table name `profiles`.
4. **Expected**: the new entry appears; entries from other tables do not.

## Scenario 2 — Access restriction

1. Log in as country_admin or org_admin.
2. Attempt to open the Audit tab / query `audit_log` directly.
3. **Expected**: tab is not shown (or, if navigated to directly, returns zero rows per existing
   RLS) — no audit data is visible.

## Scenario 3 — Export

1. As super_admin, filter to a known small set of entries.
2. Export as CSV, then as JSON.
3. **Expected**: both files' row counts and content match the on-screen filtered list exactly.

## Scenario 4 — Export cap

1. As super_admin, clear all filters (or otherwise match more than 5,000 rows if the log is that
   large; in a smaller test log, temporarily lower the limit in a local test build to a small
   number to exercise the cap logic).
2. Trigger export.
3. **Expected**: export is capped and the UI indicates more rows existed than were exported.

## Scenario 5 — Integrity check (intact)

1. As super_admin, run the integrity check.
2. **Expected**: reports the chain intact (no broken row).

## Scenario 6 — Integrity check (tampered)

1. Directly (e.g., via the Supabase SQL editor, simulating an out-of-band tamper) modify one
   `audit_log` row's `new_data` for a row inserted after the migration (so it has a non-NULL
   `chain_hash`).
2. Run the integrity check again.
3. **Expected**: reports the exact `seq` of the tampered row as the first break.

## Scenario 7 — Single-record history

1. Make three changes to the same test profile (e.g., role change, then suspend, then reactivate).
2. Open that record's audit history view.
3. **Expected**: all three entries appear in chronological order with correct before/after values.

## Scenario 8 — i18n

1. Switch locale through all 7 supported languages and open the Audit tab.
2. **Expected**: no raw i18n keys or hardcoded text in any locale.
