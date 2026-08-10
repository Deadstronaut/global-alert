/**
 * Edge Function: subscribe-push (spec 063)
 *
 * Public, unauthenticated (verify_jwt = false — see supabase/config.toml,
 * same treatment as unsubscribe/ack-dispatch) — a visitor on
 * PublicPortalView opts into browser push for their country/region/hazard
 * type without any account. Writes via service role since
 * push_subscriptions has no anon INSERT policy (see
 * 20260810126000_web_push_notifications.sql).
 *
 * POST body: { countryCode, regionCode?, hazardTypeFilter?, subscription:
 *   { endpoint, keys: { p256dh, auth } } }
 * DELETE (unsubscribe): { endpoint } — deactivates rather than deletes, so
 * a stale browser retry is idempotent.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => null)
  if (!body) return json({ error: 'Invalid request body' }, 400)

  if (req.method === 'DELETE' || body.action === 'unsubscribe') {
    const endpoint = body.endpoint
    if (!endpoint || typeof endpoint !== 'string') return json({ error: 'endpoint is required' }, 400)
    const { error } = await supabase.from('push_subscriptions').update({ is_active: false }).eq('endpoint', endpoint)
    if (error) return json({ error: error.message }, 500)
    return json({ unsubscribed: true })
  }

  const countryCode = typeof body.countryCode === 'string' ? body.countryCode.toLowerCase() : null
  const subscription = body.subscription
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const authKey = subscription?.keys?.auth

  if (!countryCode || countryCode.length !== 2) return json({ error: 'countryCode is required' }, 400)
  if (!endpoint || !p256dh || !authKey) return json({ error: 'subscription.endpoint/keys.p256dh/keys.auth are required' }, 400)

  const { error } = await supabase.from('push_subscriptions').upsert({
    country_code: countryCode,
    region_code: typeof body.regionCode === 'string' ? body.regionCode : null,
    hazard_type_filter: typeof body.hazardTypeFilter === 'string' ? body.hazardTypeFilter : null,
    endpoint,
    p256dh,
    auth_key: authKey,
    is_active: true,
  }, { onConflict: 'endpoint' })

  if (error) return json({ error: error.message }, 500)
  return json({ subscribed: true })
})
