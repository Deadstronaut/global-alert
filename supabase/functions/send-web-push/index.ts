/**
 * Edge Function: send-web-push (spec 063)
 *
 * Service-role only, triggered by trg_notify_web_push_on_broadcast
 * (20260810126000_web_push_notifications.sql) the moment a cap_drafts row
 * broadcasts — same trigger shape as notify_dispatch_on_broadcast, but a
 * fully independent code path from dispatch-alert/dispatch_jobs (push
 * subscribers are anonymous browser subscriptions, not named contacts).
 *
 * Requires a VAPID key pair this deployment generates itself once — see
 * README.md. No third-party push-provider account is ever needed: the Web
 * Push standard routes through each browser vendor's own push service
 * using only the subscription's own endpoint URL.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno'
import { corsHeaders } from '../shared/cors.ts'

function regionMatches(subRegion: string | null, draftRegion: string | null): boolean {
  const a = (subRegion ?? '').trim().toLowerCase()
  const b = (draftRegion ?? '').trim().toLowerCase()
  if (a === '' || b === '') return true
  return a === b
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ meta: { status: 'skipped', reason: 'VAPID keys not configured (see README.md)' } })
  }

  const { draft_id: draftId } = await req.json().catch(() => ({}))
  if (!draftId) return json({ error: 'draft_id is required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: draft } = await supabase.from('cap_drafts').select('*').eq('id', draftId).maybeSingle()
  if (!draft || draft.status !== 'broadcast') {
    return json({ meta: { status: 'skipped', reason: 'draft not found or not broadcast' } })
  }

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('is_active', true)
    .eq('country_code', draft.country_code)

  const matched = (subscriptions ?? []).filter((s: Record<string, unknown>) =>
    (s.hazard_type_filter == null || s.hazard_type_filter === draft.hazard_type)
    && regionMatches(s.region_code as string | null, draft.region_code),
  )

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const payload = JSON.stringify({
    title: draft.title,
    body: draft.description ?? '',
    severity: draft.severity,
    hazardType: draft.hazard_type,
    draftId: draft.id,
  })

  let sent = 0
  let failed = 0
  let deactivated = 0

  for (const sub of matched) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload,
      )
      sent++
      await supabase.from('push_subscriptions').update({ last_notified_at: new Date().toISOString() }).eq('id', sub.id)
    } catch (e) {
      failed++
      const statusCode = (e as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) {
        // Push service confirms this subscription is gone — deactivate so
        // future broadcasts stop retrying it (matches browsers' own
        // recommended handling for the Web Push protocol's gone/expired case).
        await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', sub.id)
        deactivated++
      }
    }
  }

  return json({ matched: matched.length, sent, failed, deactivated })
})
