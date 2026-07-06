# Quickstart: Dissemination & Contact Directory

## Prerequisites
- Migrations applied: `contacts`, `dispatch_jobs`, `dispatch_receipts` tables + RLS + audit triggers + the `broadcast`-transition trigger + `pg_net` extension enabled.
- `dispatch-alert` Edge Function deployed with `EMAIL_PROVIDER` and the matching provider API key (e.g. `RESEND_API_KEY`) set as function secrets.
- At least one `super_admin` account (existing) and one `country_admin` account for a test country (e.g. `tr`).

## Scenario 1 — Contact directory scoping (User Story 2)
1. Log in as the `tr` country_admin. Open the new "İletişim Rehberi" (Contacts) admin tab.
2. Create a contact with `email`, `whatsapp_number` (E.164, e.g. `+905551234567`), `hazard_type_filter = earthquake`.
3. Confirm the saved row has `country_code = 'tr'` even if the form doesn't expose a country picker to this role.
4. Log in as a different country's country_admin; confirm the `tr` contact is not visible.
5. Log in as `super_admin`; confirm both countries' contacts are visible, and a new contact can be created for any country.

## Scenario 2 — Bulk CSV import (User Story 2)
1. As the `tr` country_admin, upload a CSV with 5 valid rows and 1 row with a malformed email.
2. Confirm 5 contacts are created and the 6th is reported with a row-specific error, without blocking the other 5.

## Scenario 3 — Automatic dispatch on broadcast (User Story 1, the core scenario)
1. Ensure at least 2 opted-in `tr` contacts exist with `hazard_type_filter` = `earthquake` or `NULL`, and 1 contact in a different country.
2. As a `tr` Operator/Approver, author a CAP draft (hazard_type = earthquake, country_code = tr) through `CapView.vue` and move it through `draft → pending_approval → approved → broadcast`.
3. Within a few minutes, confirm the 2 `tr` contacts received an email (check the email provider's dashboard/sandbox inbox), and the other-country contact did not.
4. Query `dispatch_jobs`/`dispatch_receipts` directly and confirm one `dispatch_jobs` row (`status = completed`) and one `dispatch_receipts` row per contact/channel, each `sent` or `delivered`.

## Scenario 4 — Batch continues past a single failure (User Story 1 edge case)
1. Repeat Scenario 3 but include one contact with an intentionally invalid/bounced test email address (per the provider's testing conventions, e.g. Resend's designated bounce-simulation address if available, or an unreachable domain).
2. Confirm the other contacts still receive their email, and the failing contact's `dispatch_receipts` row is `failed`/`bounced` with a `failure_reason`, while `dispatch_jobs.status` still reaches `completed` (not `failed`) since this was a per-recipient failure, not a provider-wide outage.

## Scenario 5 — Retry (User Story 3)
1. Using the failed receipt from Scenario 4, open the Dispatch panel as an Operator and click retry on that job.
2. Confirm only the previously-failed receipt is re-attempted (its `retry_count` increments); the already-successful receipts are untouched (no duplicate emails).
3. Log in as a `viewer`; confirm the Dispatch tab/panel is not accessible at all. Log in as a country_admin for a different country than the one Scenario 3 used; confirm that country's dispatch job is not visible and retrying it via the API returns HTTP 403.

## Scenario 6 — Zero-match dispatch is visible, not silent (edge case)
1. Author and broadcast a CAP draft for a country with no contacts at all.
2. Confirm a `dispatch_jobs` row is still created (`status = completed`, `matched_contact_count = 0`) and appears in the Dispatch panel — not silently dropped.

## Scenario 7 — Public Alert Portal (User Story 4)
1. From an incognito/unauthenticated browser session, open the Public Alert Portal route.
2. Confirm the broadcast alert from Scenario 3 is listed with headline, severity, area, and issue time.
3. Confirm a `draft`/`pending_approval`/`approved`-but-not-yet-broadcast alert is NOT listed.
4. Manually expire a broadcast alert (`expires_at` in the past) and confirm it disappears from the portal on next load.
