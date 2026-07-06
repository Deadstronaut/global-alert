# Quickstart: Generic Integration Credentials Management

## Prerequisites

- Apply migration `supabase/migrations/20260708010000_generic_integration_credentials.sql` (user
  runs the Supabase CLI command themselves — never applied directly by the assistant).
- `npm run dev` running locally with a Super Admin and a Country Admin test account.

## Scenario 1: Configure a known integration type (US1, SC-001)

1. Sign in as Super Admin → Admin → Entegrasyonlar tab.
2. Select country, select "WhatsApp" from the integration type dropdown.
3. Expected: exactly 3 labeled fields appear (Access Token, Phone Number ID, Webhook Verify
   Token), all empty.
4. Fill all 3, save. Expected: status shows configured, with an updated-at timestamp.

## Scenario 2: Reject incomplete submission (US1, SC-003)

1. Select "WhatsApp" again, leave one field blank, attempt to save.
2. Expected: save rejected with a clear inline error; status unchanged.

## Scenario 3: Re-save replaces, doesn't duplicate (US1, FR-007)

1. With WhatsApp already configured for a country, re-submit all 3 fields with new values.
2. Expected: status still shows exactly one configured entry for (country, WhatsApp), with an
   updated `updated_at`.

## Scenario 4: Add a custom field beyond the template (US2, SC-002)

1. Select "WhatsApp", fill the 3 template fields, click "Add custom field", enter a name (e.g.
   `region`) and a value, save.
2. Expected: save succeeds; status's configured field list includes `region` alongside the 3
   template fields.

## Scenario 5: Reject a blank custom field (US2, FR-004)

1. Add a custom field, leave either its name or its value blank, attempt to save.
2. Expected: save rejected with a clear inline error.

## Scenario 6: Country-scoped admin sees only their own country

1. Sign in as a Country Admin (not Super Admin).
2. Expected: no free-text country input is shown — the panel operates on their own country only,
   matching spec 022's precedent.
