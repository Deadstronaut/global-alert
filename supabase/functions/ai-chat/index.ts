/**
 * Edge Function: ai-chat (spec 051 addendum)
 * Free-form conversational Q&A with the shared AI provider, for the "talk
 * to it directly" mode of the floating assistant widget — distinct from
 * the entity-bound capabilities (translate/summarize/classify_photo),
 * which always produce a suggestion tied to a specific source_table/
 * source_id and require an explicit approve/reject (FR-004). A chat reply
 * changes nothing in the system (aiProvider.ts's CHAT_SYSTEM_PROMPT tells
 * the model it has no tools/actions), so there is nothing to approve and
 * no ai_suggestions row is written — this endpoint is pure request/response,
 * same "review required before any effect" guarantee trivially satisfied
 * because there is no effect to review.
 *
 * Gated by the existing translate/summarize capability toggles (whichever
 * is enabled) rather than a 5th capability, to avoid a schema/migration
 * change for a conversational mode layered on the same underlying model.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { chatReply, type ChatTurn } from '../shared/aiProvider.ts'

const MAX_HISTORY_TURNS = 20
const MAX_MESSAGE_LENGTH = 4000

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

  let body: { messages?: ChatTurn[]; country_code?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { messages, country_code } = body
  if (!Array.isArray(messages) || messages.length === 0 || !country_code) {
    return json({ error: 'messages (non-empty array) and country_code are required' }, 400)
  }
  if (messages.some((m) => !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > MAX_MESSAGE_LENGTH)) {
    return json({ error: 'invalid message shape or a message exceeds the length limit' }, 400)
  }

  // super_admin rule: always available, regardless of any country's toggle
  // state — every other role still requires at least one of translate/
  // summarize to be explicitly enabled for that country (FR-001).
  const { data: profile } = await admin.from('profiles').select('role').eq('id', callerAuth.user.id).single()
  if (profile?.role !== 'super_admin') {
    const { data: configs } = await admin
      .from('ai_capability_config')
      .select('capability, enabled')
      .eq('country_code', country_code)
      .in('capability', ['translate', 'summarize'])
    const anyEnabled = (configs ?? []).some((c) => c.enabled)
    if (!anyEnabled) return json({ ok: false, reason: 'capability_disabled' })
  }

  const trimmedHistory = messages.slice(-MAX_HISTORY_TURNS)
  const result = await chatReply(trimmedHistory)
  if (!result.ok || !result.data) return json({ ok: false, reason: 'provider_unavailable' })

  return json({ ok: true, reply: result.data })
})
