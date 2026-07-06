# Data Model: Per-Country WhatsApp Integration Credentials

## Entity: `whatsapp_integration_settings` (NEW table)

Represents one country's WhatsApp Business API integration *status* — never the credential
values themselves.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `country_code` | `VARCHAR(2)` | `PRIMARY KEY` | One row per country |
| `is_configured` | `BOOLEAN` | `NOT NULL DEFAULT false` | Set to `true` only by `save_whatsapp_credentials()` |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Maintained by `set_updated_at()` trigger (reused) |
| `updated_by` | `UUID` | `REFERENCES auth.users(id) ON DELETE SET NULL`, nullable | Who last saved credentials for this country |

**No credential columns exist on this table** — access token, phone number ID, and webhook
verification token live only in Supabase Vault, as a single JSON secret named
`whatsapp_creds_<country_code>` (research.md Decision 1), never queried directly by this table or
any RLS policy.

## RLS Policy Additions

| Policy | Effect |
|---|---|
| `super_admin_whatsapp_settings_all` | `current_profile_role() = 'super_admin'` may SELECT any row, any country (FR-004) |
| `country_scoped_whatsapp_settings_select` | `current_profile_role() IN ('country_admin','org_admin') AND country_code = current_profile_country_code()` may SELECT their own country's row (FR-004/FR-005) |

Note: there is deliberately no INSERT/UPDATE RLS policy on this table for any role — all writes
happen exclusively through `save_whatsapp_credentials()` (a `SECURITY DEFINER` function that
performs its own authorization check internally and upserts the row itself), so a normal
client-side `INSERT`/`UPDATE` against this table is rejected by RLS regardless of role, closing
off any path that could set `is_configured = true` without actually saving Vault credentials.

## New SQL function: `save_whatsapp_credentials()`

```sql
save_whatsapp_credentials(
  p_country_code TEXT,
  p_access_token TEXT,
  p_phone_number_id TEXT,
  p_webhook_verify_token TEXT
) RETURNS void
SECURITY DEFINER
```

Behavior:
1. **Normalizes case first**: `p_country_code := lower(p_country_code)` — every `country_code`
   column in this project (`profiles`, `contacts`, `shelters`) and `current_profile_country_code()`
   itself are always lowercase; without normalizing here, a differently-cased input could create a
   duplicate row for the same country or cause a legitimate admin's own-country check to fail.
2. Raises an exception unless the caller is `super_admin`, or is `country_admin`/`org_admin` AND
   `p_country_code = current_profile_country_code()` (FR-004/FR-005).
3. Raises an exception if any of the three credential arguments is null/empty (FR-003).
4. Builds a JSON payload `{"access_token": ..., "phone_number_id": ..., "webhook_verify_token": ...}`.
5. Looks up `vault.secrets` for a row named `whatsapp_creds_<p_country_code>`. If found, calls
   `vault.update_secret(id, payload)`; if not found, calls `vault.create_secret(payload, name)`
   (research.md Decision 2 — avoids the unique-constraint failure this project has already hit
   once, in spec 019, from blindly calling `create_secret` on an existing name).
6. Upserts `whatsapp_integration_settings` (`country_code`, `is_configured = true`,
   `updated_at = now()`, `updated_by = auth.uid()`) — `ON CONFLICT (country_code) DO UPDATE`.
7. Returns nothing — the decrypted or plaintext credential value is never part of this function's
   return value (FR-002).

## New pure function: `formatIntegrationStatus()`

```
formatIntegrationStatus(setting: { is_configured: boolean, updated_at: string } | null | undefined)
  : { configured: boolean, updatedAt: string | null }
```

Returns `{ configured: false, updatedAt: null }` if `setting` is `null`/`undefined` (no row yet —
this country has never saved credentials) or `setting.is_configured` is falsy; otherwise
`{ configured: true, updatedAt: setting.updated_at }`.
