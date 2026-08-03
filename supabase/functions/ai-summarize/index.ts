/**
 * Edge Function: ai-summarize (spec 051, US2a)
 * Human-triggered summary draft of an SOP document or incident report.
 * Same permission/config-gating and fail-open shape as ai-translate — see
 * that function's header comment for the shared design rationale.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { summarizeText } from '../shared/aiProvider.ts'
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

  let body: { source_table?: string; source_id?: string; source_text?: string; country_code?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { source_table, source_id, source_text, country_code } = body
  if (!source_table || !source_id || !source_text || !country_code) {
    return json({ error: 'source_table, source_id, source_text, country_code are required' }, 400)
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
    .eq('capability', 'summarize')
    .maybeSingle()
  if (!config?.enabled) return json({ ok: false, reason: 'capability_disabled' })

  const result = await summarizeText(source_text)
  if (!result.ok || !result.data) {
    await admin.from('ai_suggestions').insert({
      capability: 'summarize',
      country_code,
      source_table,
      source_id,
      input_excerpt: { source_text },
      status: 'failed',
      requested_by: callerAuth.user.id,
    })
    return json({ ok: false, reason: 'provider_unavailable' })
  }

  const { data: suggestion, error: insertError } = await admin
    .from('ai_suggestions')
    .insert({
      capability: 'summarize',
      country_code,
      source_table,
      source_id,
      input_excerpt: { source_text },
      ai_output: { summary_text: result.data },
      status: 'pending',
      requested_by: callerAuth.user.id,
    })
    .select()
    .single()

  if (insertError) return json({ ok: false, reason: 'provider_unavailable' })

  return json({ ok: true, suggestion_id: suggestion.id, status: 'pending', ai_output: { summary_text: result.data } })
})
