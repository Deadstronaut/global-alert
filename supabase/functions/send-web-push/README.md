# send-web-push Edge Function

Sends a browser Web Push notification to every active `push_subscriptions` row matching a broadcast
CAP draft's country/region/hazard type. Companion to `subscribe-push` (opt-in) and
`20260810126000_web_push_notifications.sql` (schema + broadcast trigger). See spec 063.

## No third-party account is required

Unlike email (Resend/SendGrid account) or WhatsApp (Meta Business account), Web Push routes through
each browser vendor's own push service (Google/Mozilla/Apple) using only the subscription's own
`endpoint` URL — this application never talks to a push-provider API directly. The only thing this
deployment provides is a VAPID key pair it generates itself, once.

## One-time setup (per deployment, NOT part of any migration — contains a secret)

1. Generate a VAPID key pair (run locally, requires Node):
   ```sh
   npx web-push generate-vapid-keys
   ```
   This prints a `publicKey` and `privateKey` — a self-generated identity for this deployment, not
   an account with any provider.
2. Set them as Edge Function secrets:
   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=<publicKey>
   supabase secrets set VAPID_PRIVATE_KEY=<privateKey>
   supabase secrets set VAPID_SUBJECT=mailto:admin@yourdeployment.example
   ```
3. The frontend (`src/utils/webPush.js`) needs the **public** key only, exposed as the Vite env var
   `VITE_VAPID_PUBLIC_KEY` (safe to be public — it identifies the sender, not a secret).

Until `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` are set, this function no-ops (`meta.status: 'skipped'`)
rather than failing the CAP broadcast transition — identical treatment to `dispatch-alert`'s missing
email-provider case.

## Same Vault step as dispatch-alert

`trg_notify_web_push_on_broadcast` needs the same two Vault secrets `dispatch-alert/README.md`
already documents (`edge_function_base_url`, `service_role_key`) — if those are already configured
for email/WhatsApp dispatch, no additional Vault setup is needed for push.
