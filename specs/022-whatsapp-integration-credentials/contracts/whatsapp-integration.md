# Contract: WhatsApp Integration Credentials

No new REST API layer — the write path goes through a single Supabase RPC call; the read path
goes through the standard RLS-protected `whatsapp_integration_settings` table, same pattern as
every other admin entity in this project.

## Save (create or replace) credentials

**Operation**: `supabase.rpc('save_whatsapp_credentials', { p_country_code, p_access_token,
p_phone_number_id, p_webhook_verify_token })`

| Caller | Target `country_code` | Result |
|---|---|---|
| super_admin | any | Allowed |
| country_admin or org_admin | their own country | Allowed |
| country_admin or org_admin | a *different* country | Rejected — function raises an exception (FR-005) |
| viewer | any | Rejected — function raises an exception (no role match) |
| any role | any, with one or more of the three credential fields blank | Rejected — function raises an exception (FR-003) |

The function's return value is always empty/void — no credential value, decrypted or otherwise,
is ever part of the response (FR-002).

## Read integration status

**Operation**: `supabase.from('whatsapp_integration_settings').select('*').eq('country_code', cc)`

| Caller | Target `country_code` | Result |
|---|---|---|
| super_admin | any | Allowed |
| country_admin or org_admin | their own country | Allowed |
| country_admin or org_admin | a *different* country | Rejected by RLS (no matching policy) |
| viewer | any | Rejected — no RLS policy grants viewer access; the feature has no viewer surface at all (research.md Decision 4) |

The row returned (if any) contains only `country_code`, `is_configured`, `updated_at`,
`updated_by` — never a credential value, since none exist on this table.

## Effect on `formatIntegrationStatus()`

| Scenario | Result |
|---|---|
| No row exists for the country (never configured) | `{ configured: false, updatedAt: null }` |
| Row exists, `is_configured = false` | `{ configured: false, updatedAt: null }` |
| Row exists, `is_configured = true` | `{ configured: true, updatedAt: <timestamp> }` |

## Effect on `dispatch-alert`'s existing WhatsApp dispatch

| Scenario | Result |
|---|---|
| A country has saved credentials via this feature | No change — `dispatch-alert`'s existing mock adapter still runs unchanged (FR-007); a comment/TODO notes where a future iteration would branch to a real API call |
| A country has never saved credentials | No change — identical to today's behavior |
