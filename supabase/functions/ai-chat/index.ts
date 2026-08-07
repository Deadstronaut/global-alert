/**
 * Edge Function: ai-chat (spec 051 addendum)
 * Free-form conversational Q&A with the shared AI provider, for the "talk
 * to it directly" mode of the floating assistant widget — distinct from
 * the entity-bound capabilities (translate/summarize/classify_photo),
 * which always produce a suggestion tied to a specific source_table/
 * source_id and require an explicit approve/reject (FR-004). A chat reply
 * changes nothing in the system, so there is nothing to approve and no
 * ai_suggestions row is written — this endpoint is pure request/response,
 * same "review required before any effect" guarantee trivially satisfied
 * because there is no effect to review.
 *
 * Grounding addendum: the model may call ONE read-only tool
 * (get_recent_hazard_events, aiHazardQueryTool.ts) to answer questions
 * about real, current hazard data instead of guessing — e.g. "is there an
 * earthquake near Istanbul". The tool can only SELECT from a fixed
 * whitelist of hazard tables (never an arbitrary table the model names)
 * and never writes anything; this stays within the same "informational
 * only, never an action" boundary as the rest of spec 051 (FR-002).
 *
 * Gated by the existing translate/summarize capability toggles (whichever
 * is enabled) rather than a 5th capability, to avoid a schema/migration
 * change for a conversational mode layered on the same underlying model.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { corsHeaders } from '../shared/cors.ts'
import { chatReplyWithTools, buildUserContext, type ChatTurn } from '../shared/aiProvider.ts'
import { HAZARD_QUERY_TOOL_DEFINITION, resolveHazardQuery, MAX_ROWS } from '../shared/aiHazardQueryTool.ts'

const MAX_HISTORY_TURNS = 20
const MAX_MESSAGE_LENGTH = 4000

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(url, key)
}

// deno-lint-ignore no-explicit-any
async function executeHazardQueryTool(admin: any, name: string, args: Record<string, unknown>): Promise<string> {
  if (name !== 'get_recent_hazard_events') {
    return JSON.stringify({ error: `unknown tool: ${name}` })
  }
  const resolved = resolveHazardQuery(args)
  if (!resolved.ok) return JSON.stringify({ error: resolved.error })

  let query = admin
    .from(resolved.table)
    .select('id, title, magnitude, severity, lat, lng, time, country_code, source')
    .gte('time', resolved.sinceIso)
    .order('time', { ascending: false })
    .limit(MAX_ROWS)
  if (resolved.countryCode) query = query.eq('country_code', resolved.countryCode)

  const { data, error } = await query
  if (error) return JSON.stringify({ error: error.message })
  return JSON.stringify({ table: resolved.table, since: resolved.sinceIso, count: (data ?? []).length, events: data ?? [] })
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
  const { data: profile } = await admin
    .from('profiles')
    .select('role, full_name, email, country_code')
    .eq('id', callerAuth.user.id)
    .single()
  if (!profile) return json({ error: 'Profile not found' }, 401)

  if (profile.role !== 'super_admin') {
    const { data: configs } = await admin
      .from('ai_capability_config')
      .select('capability, enabled')
      .eq('country_code', country_code)
      .in('capability', ['translate', 'summarize'])
    const anyEnabled = (configs ?? []).some((c) => c.enabled)
    if (!anyEnabled) return json({ ok: false, reason: 'capability_disabled' })
  }

  // Identity/role context is always built from the caller's OWN
  // authenticated profile (never from anything in the request body) so it
  // cannot be spoofed by a client claiming to be someone else.
  const userContext = buildUserContext(profile)

  const trimmedHistory = messages.slice(-MAX_HISTORY_TURNS)
  const result = await chatReplyWithTools(
    trimmedHistory,
    userContext,
    [HAZARD_QUERY_TOOL_DEFINITION],
    (name, toolArgs) => executeHazardQueryTool(admin, name, toolArgs),
  )
  if (!result.ok || !result.data) return json({ ok: false, reason: 'provider_unavailable' })

  return json({ ok: true, reply: result.data })
})
