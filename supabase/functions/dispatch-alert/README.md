# dispatch-alert Edge Function

Two invocation modes — see `specs/009-dissemination-dispatch/contracts/dispatch-alert.md` for the full contract.

## ⚠️ Email provider credentials are NOT ours to provision

`RESEND_API_KEY`/`SENDGRID_API_KEY` are **customer-owned secrets, not something the platform team sets up centrally**.
Each country runs its own email sending (its own NMHS/ministry mail infrastructure or its own commercial
account) — the same way each country's `data_sources` are its own endpoints, not shared. Whichever
provider a given deployment/country actually uses, and the API key for it, is provided by that
country's own IT/admin (in this codebase's role terms: the `country_admin` for that tenant), during
their own onboarding — never hardcoded or pre-filled by us.

Until that secret is configured, this is NOT a silent failure: `handleAutoDispatch()` already detects
the missing-provider case and marks the `dispatch_jobs` row `failed` with `failure_reason = 'No email
provider configured'` (visible in the Dispatch panel), rather than pretending dispatch succeeded.

## Configuration reference (what the customer/country_admin sets via `supabase secrets set ...` or the dashboard)

- `EMAIL_PROVIDER` — `resend` (default) or `sendgrid`.
- `RESEND_API_KEY` — required when `EMAIL_PROVIDER=resend`.
- `RESEND_FROM_ADDRESS` — optional, defaults to `onboarding@resend.dev` (Resend's sandbox sender — replace with a verified domain sender before real use).
- `SENDGRID_API_KEY` / `SENDGRID_FROM_ADDRESS` — required only if `EMAIL_PROVIDER=sendgrid`.
- `PUBLIC_PORTAL_URL` — optional, included as a link in dispatched emails.
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — standard Supabase-provided Edge Function env vars, already present in every deployed function (this one IS platform-managed, not customer-provided).

## One-time database configuration (NOT part of any migration — contains secrets)

`ALTER DATABASE ... SET app.settings.*` requires database-superuser and is **not available on
Supabase-hosted projects** (`ERROR: 42501: permission denied to set parameter`, confirmed live).
Use Supabase Vault instead — the officially supported, non-superuser way to hand a secret to a
Postgres function. Run once against the project database (Supabase SQL editor, not checked into
version control), so the `trg_notify_dispatch_on_broadcast` trigger
(`20260707120200_cap_broadcast_dispatch_trigger.sql`) can actually reach this function:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'edge_function_base_url');
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Until both secrets exist, the trigger no-ops (`RAISE NOTICE`) instead of failing the CAP draft's status update.
