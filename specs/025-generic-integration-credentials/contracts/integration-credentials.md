# Contract: Generic Integration Credentials Management

## Write path

`integrationSettingsStore.saveCredentials(countryCode, integrationTypeCode, fieldsObject)` →
`supabase.rpc('save_integration_credentials', { p_country_code, p_integration_type_code, p_fields })`.

**Authorization** (unchanged from spec 022, generalized): super_admin any country; country_admin/
org_admin only their own country. Enforced entirely inside the SECURITY DEFINER function — no RLS
INSERT/UPDATE policy grants this to any role directly.

**Errors surfaced to the caller** (propagated as Postgres errors, displayed via the existing
`try/catch` → `error.value` pattern in `IntegrationsPanel.vue`, same as every other admin form in
this project):
- Authorization failure: `not authorized to configure integration credentials for country %`
- Empty/blank field: a clear validation exception naming the problem (no fields provided, or a
  specific field is blank)

**Never returned to the caller**: the actual field values — the RPC returns `void`.

## Read path

`integrationTypesStore.fetchIntegrationTypes()` → `SELECT * FROM integration_types WHERE
is_active` (RLS-filtered) — registry of available integration types + their field templates.

`integrationSettingsStore.fetchSettings(countryCode)` → `SELECT * FROM integration_settings WHERE
country_code = :countryCode` (RLS-filtered) — every integration type's configuration status for
that country, keyed by `integration_type_code`.

## UI contract: Integrations panel (`AdminView.vue` tab, admin-only — unchanged gate)

- Country selector: free-text (Super Admin, lowercased on input) or fixed to the admin's own
  country (Country/Org Admin) — identical behavior to `WhatsAppIntegrationPanel.vue`.
- Integration type selector: dropdown populated from `integrationTypesStore.activeIntegrationTypes`.
- On selecting a type: renders one password input per `field_template` entry, correctly labeled.
- "Add custom field" control: appends a `{name, value}` row not present in the template; the name
  is itself a text input (not a fixed label).
- Status display: configured/not-configured, `updated_at` if configured, and the list of
  `configured_field_keys` (field names only, never values).
- No field value is ever pre-filled from a previous save — matches spec 022's write-only
  precedent exactly.
