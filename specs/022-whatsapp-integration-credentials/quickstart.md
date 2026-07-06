# Quickstart: Per-Country WhatsApp Integration Credentials

## Prerequisites

- Migration `20260707240000_whatsapp_integration_settings.sql` applied.
- A test Country Admin account for one country (`XX`), and the Super Admin test account.

## Scenario 1 — Configure credentials for the first time (US1, FR-001)

1. Log in as a Country Admin (country `XX`); open the admin panel's new "WhatsApp Entegrasyonu"
   tab.
2. Enter an access token, phone number ID, and webhook verification token; save.
3. **Expected**: the tab now shows "Configured" with a last-updated timestamp close to now.

## Scenario 2 — Credential values are never redisplayed (FR-002, SC-002)

1. Reload the WhatsApp Entegrasyonu tab (or log out and back in) as the same Country Admin.
2. **Expected**: the form fields are empty — no previously entered value is shown, only the
   "Configured (last updated: ...)" status.

## Scenario 3 — Reject an incomplete submission (FR-003)

1. Attempt to save with the webhook verification token field left blank.
2. **Expected**: rejected, with a clear validation message; the country's status is unaffected
   (still whatever it was before this attempt).

## Scenario 4 — Cross-country access rejection (FR-004/FR-005)

1. As the Country Admin from country `XX`, attempt to save or view credentials/status for a
   different country `YY` (e.g. via a direct Supabase client call bypassing the UI's own country
   lock).
2. **Expected**: rejected — by the RPC function's internal check for a save attempt, by RLS for a
   read attempt.

## Scenario 5 — Replace existing credentials (US2, FR-006)

1. As the Country Admin, save new credential values over the ones from Scenario 1.
2. **Expected**: the status's last-updated timestamp changes to reflect the new save; no error
   about a duplicate/existing configuration.

## Scenario 6 — Zero regression on WhatsApp dispatch (FR-007, SC-004)

1. With country `XX` now "configured" (Scenario 1), dispatch a CAP alert to a WhatsApp-opted-in
   contact in that country (existing dispatch flow, unrelated to this feature).
2. **Expected**: identical behavior to before this feature existed — the existing simulated/mock
   WhatsApp delivery still runs exactly as it did previously; saving credentials does not trigger,
   enable, or alter any dispatch behavior in this iteration.

## Validation commands

```sh
npm run test   # existing suite + new whatsappIntegrationStatus.test.js must pass
npm run build  # clean build
```
