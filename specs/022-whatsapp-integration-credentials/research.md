# Research: Per-Country WhatsApp Integration Credentials

## Decision 1: Metadata table + Vault split, not a single table with encrypted columns

**Decision**: `whatsapp_integration_settings` (country_code, is_configured, updated_at,
updated_by) holds zero credential material. The actual access token, phone number ID, and webhook
verification token are stored together as one JSON blob in a single Supabase Vault secret named
`whatsapp_creds_<country_code>` (lowercase country code).

**Rationale**: This project already has an established, audited pattern of using Supabase Vault
for exactly this kind of sensitive configuration value (spec 009's `service_role_key`/
`edge_function_base_url`, read via `vault.decrypted_secrets` in spec 019's
`trigger_compliance_report_generation()`). Reusing Vault means the credential values benefit from
Supabase's existing at-rest encryption and secret-access model without this project inventing its
own encryption scheme. Splitting status (queryable, RLS-governed) from the secret itself (only
ever touched through one SQL function) means the RLS policies that gate "who can see this
country's integration status" never need to reason about credential confidentiality at all — they
only ever see a boolean and a timestamp.

**Alternatives considered**: Storing encrypted credential columns directly on
`whatsapp_integration_settings` (e.g., using `pgcrypto`): rejected — this project would then own
the encryption key management, which Vault already solves; introducing a second, parallel secret
mechanism alongside Vault (already used for `service_role_key` etc.) would be an unjustified
increase in the number of ways secrets are handled in this codebase (YAGNI/simplicity).

## Decision 2: A single `SECURITY DEFINER` RPC function for both write and existence-check, no direct Vault table grants

**Decision**: `save_whatsapp_credentials(p_country_code TEXT, p_access_token TEXT,
p_phone_number_id TEXT, p_webhook_verify_token TEXT) RETURNS void` is the only way to write
credentials. It: (1) authorizes the caller (`current_profile_role() = 'super_admin'` OR
(`current_profile_role() IN ('country_admin','org_admin')` AND `country_code =
current_profile_country_code()`)), raising an exception otherwise; (2) checks
`vault.secrets` for an existing row named `whatsapp_creds_<country_code>` — calls
`vault.update_secret(id, new_json)` if found, `vault.create_secret(new_json, name)` if not (this
existence check is required because `vault.create_secret()` fails with a unique-constraint
violation on an already-existing name — a failure mode this project has already hit once in spec
019's `service_role_key` setup); (3) upserts `whatsapp_integration_settings` with
`is_configured = true`, `updated_at = now()`, `updated_by = auth.uid()`. No `SELECT` grant on
`vault.secrets`/`vault.decrypted_secrets` is given to any client role — the function's
`SECURITY DEFINER` privilege is the only path in, mirroring spec 019's read-only pattern exactly
but extended to a controlled, authorization-checked write.

**Rationale**: Centralizing both the authorization check and the create-vs-update branching in one
function means the client-facing contract is trivially simple (one RPC call, one set of
arguments) and there is exactly one place in the codebase that ever touches
`vault.create_secret`/`vault.update_secret` for this feature — auditable and easy to reason about.

**Alternatives considered**: Two separate RPCs (`create_whatsapp_credentials`/
`update_whatsapp_credentials`): rejected as needless API surface — the caller never needs to know
or care whether this is the country's first submission or a replacement (FR-006 treats both as
the same "save" action), so a single idempotent upsert-shaped function is simpler.

## Decision 3: No SELECT/read RPC for the credential values — status table read is enough

**Decision**: There is no function or policy that ever returns decrypted credential values to any
client. `fetchSettings()` (the store's read path) queries `whatsapp_integration_settings` directly
via normal RLS-governed `SELECT`, which only ever contains status/metadata.

**Rationale**: Directly implements FR-002/SC-002 ("never redisplay a previously entered credential
value... only whether it is configured and when it was last updated") at the strongest possible
layer — there is no code path capable of returning the secret even if a bug were introduced
elsewhere in the stack, since no query or function exists that reads
`vault.decrypted_secrets` for this feature at all outside the write function's own internal
existence check (which itself never returns the decrypted value, only branches on ID existence
via `vault.secrets`, the non-decrypted metadata view).

**Alternatives considered**: A masked-value read function (e.g., returning `****1234` style
partial reveals): rejected as unnecessary for this spec's stated requirement (FR-002 says never
redisplay, not partially redisplay) and would be additional, unrequested complexity.

## Decision 4: Admin-only feature, no viewer-accessible route (unlike spec 021)

**Decision**: The WhatsApp integration credentials UI lives entirely inside `AdminView.vue`'s
existing tab system, visible to `super_admin`/`country_admin`/`org_admin` only — no new route, no
`viewer` access path.

**Rationale**: Unlike spec 021's shelters (which needed viewer-visible availability data as a
life-safety concern, forcing a new `/shelters` route outside `/admin`'s viewer-blocking guard),
this feature has no legitimate non-admin use case — a Viewer has no reason to know whether a
country's WhatsApp integration is configured. The existing `/admin` route guard (which already
blocks `viewer`, per spec 004's tested guarantee) is therefore the correct and sufficient gate,
with zero new routing work needed.

**Alternatives considered**: None seriously — this is a straightforward application of the
existing admin-tab pattern with no access-model tension to resolve, unlike spec 021.

## Decision 5: `formatIntegrationStatus()` as the pure, tested function

**Decision**: Extract `formatIntegrationStatus(setting)` as a pure function in
`whatsappIntegration.js`, returning a small object (e.g. `{ configured: boolean, label: string }`)
from a raw `whatsapp_integration_settings` row (or `undefined`/`null` for "no row yet, i.e. never
configured"). This is the one piece of this feature's logic with a non-obvious edge case (a
country with no row at all vs. a row with `is_configured = false` vs. a configured row) worth
testing in isolation, matching the project's established extraction pattern.

**Rationale**: Same rationale as every prior spec's pure-function extraction (spec 010's
`evaluateBreakpoints`, spec 020's `resolveThresholds`, spec 021's `occupancyPercentage`) — this is
simple enough to be trivial, but has enough branching (absent row vs. explicit false vs. true) to
be worth a directly-testable, mock-free function rather than inlined template logic.

**Alternatives considered**: Inlining the configured/not-configured check directly in the Vue
template: rejected only because the "no row exists yet" case (a country that has never called the
save function at all) needs a defined, tested behavior distinct from "explicitly not configured,"
which is easy to get wrong inline.
