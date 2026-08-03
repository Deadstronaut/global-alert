/**
 * Edge Function: ai-translate (spec 051, US1)
 * Human-triggered translation of alert/SOP text into another supported
 * locale. Never writes to cap_drafts/sop_documents/incidents itself — only
 * inserts a pending ai_suggestions row; the requesting client applies an
 * approved suggestion through that entity's own existing RLS-protected
 * update path (see src/stores/aiAssistance.js). Fails open (FR-008): any
 * provider/config problem returns { ok: false, reason } with HTTP 200, never
 * blocking the caller's manual editing flow.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { translateText } from '../shared/aiProvider.ts'
import { canRequestAiAssistance } from '../shared/aiSourcePermission.ts'

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  const admin = adminClient()
  const { data: callerAuth, error: callerAuthError } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
  if (callerAuthError || !callerAuth.user) return json({ error: 'Invalid session' }, 401)

  let body: {
    source_table?: string
    source_id?: string
    source_text?: string
    source_locale?: string
    target_locale?: string
    country_code?: string
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { source_table, source_id, source_text, source_locale, target_locale, country_code } = body
  if (!source_table || !source_id || !source_text || !source_locale || !target_locale || !country_code) {
    return json(
      { error: 'source_table, source_id, source_text, source_locale, target_locale, country_code are required' },
      400,
    )
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('role, country_code')
    .eq('id', callerAuth.user.id)
    .single()
  if (!profile) return json({ error: 'Profile not found' }, 401)

  const permission = canRequestAiAssistance(source_table, profile, country_code)
  if (!permission.ok) return json({ ok: false, reason: 'unauthorized' }, 403)

  const { data: config } = await admin
    .from('ai_capability_config')
    .select('enabled')
    .eq('country_code', country_code)
    .eq('capability', 'translate')
    .maybeSingle()
  if (!config?.enabled) return json({ ok: false, reason: 'capability_disabled' })

  const result = await translateText(source_text, source_locale, target_locale)
  if (!result.ok || !result.data) {
    // Logged as a terminal 'failed' suggestion for audit visibility, but the
    // caller only ever sees the generic unavailable outcome (FR-008).
    await admin.from('ai_suggestions').insert({
      capability: 'translate',
      country_code,
      source_table,
      source_id,
      target_locale,
      input_excerpt: { source_text, source_locale },
      status: 'failed',
      requested_by: callerAuth.user.id,
    })
    return json({ ok: false, reason: 'provider_unavailable' })
  }

  const { data: suggestion, error: insertError } = await admin
    .from('ai_suggestions')
    .insert({
      capability: 'translate',
      country_code,
      source_table,
      source_id,
      target_locale,
      input_excerpt: { source_text, source_locale },
      ai_output: { translated_text: result.data },
      status: 'pending',
      requested_by: callerAuth.user.id,
    })
    .select()
    .single()

  if (insertError) return json({ ok: false, reason: 'provider_unavailable' })

  return json({
    ok: true,
    suggestion_id: suggestion.id,
    status: 'pending',
    ai_output: { translated_text: result.data },
  })
})
