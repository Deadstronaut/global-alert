# Data Model: Generic Integration Credentials Management

## Entity: `integration_types` (new table)

| Column | Type | Notes |
|---|---|---|
| `code` | TEXT PRIMARY KEY | e.g. `'whatsapp'` |
| `display_name` | TEXT NOT NULL | e.g. `'WhatsApp'` |
| `field_template` | JSONB NOT NULL DEFAULT `'[]'` | array of `{key, label}` — the known fields for this integration type |
| `is_active` | BOOLEAN NOT NULL DEFAULT true | |
| `created_at`/`updated_at` | TIMESTAMPTZ | `set_updated_at()` trigger, same as `hazard_types` |

**RLS**: super_admin full access (write); every authenticated user can read active rows — same
shape as `hazard_types`' `super_admin_hazard_types_all` / `read_active_hazard_types` policies.

**Seed data**: one row, `code = 'whatsapp'`, `field_template = [{"key":"access_token","label":"Access Token"},{"key":"phone_number_id","label":"Phone Number ID"},{"key":"webhook_verify_token","label":"Webhook Verify Token"}]`.

## Entity: `integration_settings` (new table, replaces `whatsapp_integration_settings`)

| Column | Type | Notes |
|---|---|---|
| `country_code` | TEXT | part of composite PK, lowercase (existing project convention) |
| `integration_type_code` | TEXT REFERENCES integration_types(code) | part of composite PK |
| `is_configured` | BOOLEAN NOT NULL DEFAULT false | |
| `configured_field_keys` | JSONB NOT NULL DEFAULT `'[]'` | array of field-name strings that were set — never values |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| `updated_by` | UUID REFERENCES auth.users(id) ON DELETE SET NULL | |

`PRIMARY KEY (country_code, integration_type_code)`.

**RLS**: super_admin full SELECT; country-scoped SELECT (own country only, mirrors
`country_scoped_whatsapp_settings_select`). No INSERT/UPDATE policy for any role — all writes go
exclusively through `save_integration_credentials()` (SECURITY DEFINER), exactly as spec 022's
`whatsapp_integration_settings` had no direct write policy either.

## New SECURITY DEFINER function: `save_integration_credentials()`

```
save_integration_credentials(
  p_country_code TEXT,
  p_integration_type_code TEXT,
  p_fields JSONB   -- e.g. {"access_token": "xxx", "phone_number_id": "yyy", "region": "eu-west"}
) RETURNS void
```

Behavior (generalizes `save_whatsapp_credentials()`):
1. `p_country_code := lower(p_country_code)` (existing case-normalization convention, spec 022
   fix I1 — preserved here from the start, not a later fix).
2. Authorization: `super_admin` OR (`country_admin`/`org_admin` AND own country) — identical check
   to spec 022's.
3. Validation: `p_fields` must be a non-empty JSON object; every value must be non-null and
   non-blank after trimming; reject with a clear exception otherwise (FR-004/FR-005).
4. Vault write: secret name `'integration_creds_' || p_country_code || '_' || p_integration_type_code`;
   look up existing secret by name, `vault.update_secret()` if found else `vault.create_secret()`
   — identical lookup-then-upsert pattern to spec 019/022.
5. Upsert `integration_settings`: `is_configured = true`, `configured_field_keys =` the JSON keys
   of `p_fields`, `updated_at = NOW()`, `updated_by = auth.uid()`.

## Removed (hard cutover, Decision 4)

- `whatsapp_integration_settings` table — dropped.
- `save_whatsapp_credentials()` function — dropped.
- Existing Vault secrets named `whatsapp_creds_<country_code>` (if any exist from earlier manual
  testing) are orphaned but not deleted by this migration — they simply become unreferenced; no
  production code reads them (confirmed: `dispatch-alert`'s WhatsApp path is still a mock).

## UI-facing shape (derived, not stored)

```text
// per (country, integration type) pair shown in IntegrationsPanel.vue
{
  integrationType: { code, display_name, field_template: [{key, label}] },
  status: { configured: boolean, updatedAt: string | null, configuredFieldKeys: string[] },
  formFields: [{ key, label, value, isCustom: boolean }]   // template fields + admin-added custom rows
}
```
