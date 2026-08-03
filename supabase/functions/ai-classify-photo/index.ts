/**
 * Edge Function: ai-classify-photo (spec 051, US2b)
 * Suggests a hazard_type for a community_reports photo, for moderator
 * triage only — never writes community_reports.hazard_type itself (FR-004,
 * data-model.md). Two callers:
 *  - submit-community-report, fire-and-forget, service-role auth
 *    (research.md Decision 3 — auto-triggered, never blocks submission)
 *  - a moderator manually re-requesting a suggestion, country_admin/
 *    super_admin JWT auth
 * Reporter identity/contact fields are never read or sent to the AI
 * provider (FR-010) — community_reports has none in the first place
 * (anonymous submissions), and only the photo bytes + hazard type options
 * are transmitted.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { classifyHazardPhoto } from '../shared/aiProvider.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const authHeader = req.headers.get('Authorization')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const admin = adminClient()
  const isServiceRoleCall = authHeader === `Bearer ${serviceKey}`

  let requestedBy: string | null = null
  if (!isServiceRoleCall) {
    const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', callerAuth.user.id).single()
    if (!profile || !['country_admin', 'super_admin'].includes(profile.role)) {
      return json({ ok: false, reason: 'unauthorized' }, 403)
    }
    requestedBy = callerAuth.user.id
  }

  let body: { source_table?: string; source_id?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { source_table, source_id } = body
  if (source_table !== 'community_reports' || !source_id) {
    return json({ error: 'source_table must be community_reports, source_id is required' }, 400)
  }

  const { data: report } = await admin
    .from('community_reports')
    .select('country_code, photo_path')
    .eq('id', source_id)
    .single()
  if (!report?.photo_path || !report.country_code) {
    // No photo, or country could not be resolved at submission time — nothing
    // to classify. Not an error: fire-and-forget callers must never fail the
    // submission over this (research.md Decision 3).
    return json({ ok: false, reason: 'nothing_to_classify' })
  }

  const { data: config } = await admin
    .from('ai_capability_config')
    .select('enabled')
    .eq('country_code', report.country_code)
    .eq('capability', 'classify_photo')
    .maybeSingle()
  if (!config?.enabled) return json({ ok: false, reason: 'capability_disabled' })

  const { data: hazardTypes } = await admin.from('hazard_types').select('code').eq('is_active', true)
  const hazardTypeOptions = (hazardTypes ?? []).map((h) => h.code)
  if (hazardTypeOptions.length === 0) return json({ ok: false, reason: 'provider_unavailable' })

  const { data: photoBlob, error: downloadError } = await admin.storage
    .from('community-report-photos')
    .download(report.photo_path)
  if (downloadError || !photoBlob) return json({ ok: false, reason: 'provider_unavailable' })

  const photoBase64 = bytesToBase64(new Uint8Array(await photoBlob.arrayBuffer()))
  const result = await classifyHazardPhoto(photoBase64, hazardTypeOptions)

  if (!result.ok || !result.data) {
    await admin.from('ai_suggestions').insert({
      capability: 'classify_photo',
      country_code: report.country_code,
      source_table: 'community_reports',
      source_id,
      input_excerpt: { hazard_type_options: hazardTypeOptions },
      status: 'failed',
      requested_by: requestedBy,
    })
    return json({ ok: false, reason: 'provider_unavailable' })
  }

  const { data: suggestion, error: insertError } = await admin
    .from('ai_suggestions')
    .insert({
      capability: 'classify_photo',
      country_code: report.country_code,
      source_table: 'community_reports',
      source_id,
      input_excerpt: { hazard_type_options: hazardTypeOptions },
      ai_output: result.data,
      status: 'pending',
      requested_by: requestedBy,
    })
    .select()
    .single()

  if (insertError) return json({ ok: false, reason: 'provider_unavailable' })

  return json({ ok: true, suggestion_id: suggestion.id, status: 'pending', ai_output: result.data })
})
