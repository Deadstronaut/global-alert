// Sandboxed AI Assistance (spec 051) — shared AI provider client.
//
// A thin fetch() wrapper around an OpenAI-compatible Chat/Vision Completions
// HTTP contract (research.md Decision 1). No vendor SDK dependency, so any
// OpenAI-compatible endpoint works: OpenAI itself, Azure OpenAI, or a
// self-hosted server (Ollama/vLLM/LiteLLM gateway) — required for the
// federation/self-host deployment model, where each country configures its
// own provider via env vars. Mirrors emailProviders/resend.ts's shape
// ({ ok, ...result, error }) and its "never throw, always return a result"
// convention, so callers can implement fail-open behavior (FR-008) without
// try/catch at every call site.
//
// Used by ai-translate, ai-summarize, ai-classify-photo, and ai-chat.
// ai-anomaly-check does NOT use it — that capability is deliberately pure
// statistics (research.md Decision 2), not an AI call.

const DEFAULT_TIMEOUT_MS = 10_000

export interface AiProviderResult<T> {
  ok: boolean
  data: T | null
  reason: 'provider_unavailable' | null
}

export interface ToolCall {
  id: string
  function: { name: string; arguments: string }
}

interface ChatCompletionChoice {
  message?: { content?: string; tool_calls?: ToolCall[] }
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[]
}

function providerConfig() {
  return {
    baseUrl: Deno.env.get('AI_PROVIDER_BASE_URL'),
    apiKey: Deno.env.get('AI_PROVIDER_API_KEY'),
    textModel: Deno.env.get('AI_PROVIDER_TEXT_MODEL') ?? 'gpt-4o-mini',
    visionModel: Deno.env.get('AI_PROVIDER_VISION_MODEL') ?? 'gpt-4o-mini',
    timeoutMs: Number(Deno.env.get('AI_PROVIDER_TIMEOUT_MS') ?? DEFAULT_TIMEOUT_MS),
  }
}

async function chatCompletion(messages: unknown[], model: string): Promise<AiProviderResult<string>> {
  const { baseUrl, apiKey, timeoutMs } = providerConfig()
  if (!baseUrl || !apiKey) {
    return { ok: false, data: null, reason: 'provider_unavailable' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature: 0.2 }),
      signal: controller.signal,
    })

    if (!res.ok) {
      return { ok: false, data: null, reason: 'provider_unavailable' }
    }

    const json = (await res.json().catch(() => null)) as ChatCompletionResponse | null
    const content = json?.choices?.[0]?.message?.content
    if (!content) {
      return { ok: false, data: null, reason: 'provider_unavailable' }
    }

    return { ok: true, data: content, reason: null }
  } catch {
    // Network error, abort/timeout, or malformed response — all fold into
    // the same "unavailable" outcome so callers have exactly one failure
    // branch to handle (FR-008: fail open to the manual workflow).
    return { ok: false, data: null, reason: 'provider_unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}

// Same wire contract as chatCompletion() but returns the full assistant
// message (content AND any tool_calls) instead of collapsing straight to a
// content string — needed for the tool-calling loop in chatReplyWithTools.
async function chatCompletionRaw(
  messages: unknown[],
  model: string,
  tools?: unknown[],
): Promise<AiProviderResult<{ content: string | null; tool_calls?: ToolCall[] }>> {
  const { baseUrl, apiKey, timeoutMs } = providerConfig()
  if (!baseUrl || !apiKey) {
    return { ok: false, data: null, reason: 'provider_unavailable' }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const body: Record<string, unknown> = { model, messages, temperature: 0.2 }
    if (tools?.length) {
      body.tools = tools
      body.tool_choice = 'auto'
    }
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) return { ok: false, data: null, reason: 'provider_unavailable' }

    const json = (await res.json().catch(() => null)) as ChatCompletionResponse | null
    const message = json?.choices?.[0]?.message
    if (!message || (!message.content && !message.tool_calls?.length)) {
      return { ok: false, data: null, reason: 'provider_unavailable' }
    }

    return { ok: true, data: { content: message.content ?? null, tool_calls: message.tool_calls }, reason: null }
  } catch {
    return { ok: false, data: null, reason: 'provider_unavailable' }
  } finally {
    clearTimeout(timeout)
  }
}

export async function translateText(
  text: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<AiProviderResult<string>> {
  const { textModel } = providerConfig()
  return chatCompletion(
    [
      {
        role: 'system',
        content:
          `You translate disaster-alert and SOP text from ${sourceLocale} to ${targetLocale}. ` +
          'Reply with ONLY the translated text, no explanation, no markdown.',
      },
      { role: 'user', content: text },
    ],
    textModel,
  )
}

export async function summarizeText(text: string): Promise<AiProviderResult<string>> {
  const { textModel } = providerConfig()
  return chatCompletion(
    [
      {
        role: 'system',
        content:
          'You summarize disaster-response SOP documents and incident reports concisely, ' +
          'preserving all safety-critical instructions. Reply with ONLY the summary text.',
      },
      { role: 'user', content: text },
    ],
    textModel,
  )
}

// Static project briefing baked directly into the system prompt rather than
// wired up as retrieval/RAG over the repo's docs — the assistant only needs
// to answer "what is this platform / how does X work" style questions, a
// short fixed summary is enough and needs no vector DB, embedding pipeline,
// or file-ingestion step (Principle VIII — simplest thing that satisfies
// the requirement; a real RAG setup would be pure complexity here since the
// platform's shape doesn't change turn to turn).
const PROJECT_BRIEFING =
  'Context about the platform you are embedded in: this is "Global Alert / GEWS" (also called MHEWS, ' +
  'Multi-Hazard Early Warning System), a real-time multi-hazard monitoring and early-warning platform. ' +
  'It aggregates live disaster data — earthquakes, wildfires, floods, droughts, food security crises, ' +
  'tsunamis, epidemics — from sources like USGS, GDACS, NASA FIRMS, GloFAS, ReliefWeb, WHO, and national ' +
  'agencies (AFAD, Kandilli), shown on an interactive 3D globe and 2D map. Key modules: CAP-compliant ' +
  'alert authoring with a four-eyes approval workflow and dispatch via Email/WhatsApp/public portal; an ' +
  'INFORM-style composite risk index (hazard x exposure x vulnerability x coping capacity) computed ' +
  'deterministically, never by AI; cascading-hazard risk rules; incident tracking with timelines; an SOP ' +
  '(Standard Operating Procedure) document repository; shelter management; community-submitted hazard ' +
  'reports (citizens can report a hazard with an optional photo, moderated by admins before it appears on ' +
  'the map); drill/exercise mode for testing response readiness; and country-scoped role-based access ' +
  '(super_admin, country_admin, org_admin, viewer). The platform is deployed per-country/federated — each ' +
  'country can self-host its own instance. You (this chat) are one small, deliberately sandboxed piece of ' +
  'it: an assistant for translation, summarization, and general Q&A — you never touch risk scores, alerts, ' +
  'or dispatch, and every AI suggestion elsewhere in the app requires human review before it has any effect.'

const CHAT_SYSTEM_PROMPT =
  'You are a helpful assistant embedded in a multi-hazard early warning platform used by ' +
  'disaster-response operators. Answer questions and hold a conversation concisely and helpfully. ' +
  'You may have access to a read-only lookup tool for recent hazard/disaster events (if offered to you in ' +
  'this request) — use it whenever a question depends on current, real data (e.g. "is there an earthquake ' +
  'near X", "what floods happened recently") rather than guessing or relying on general knowledge, and base ' +
  'your answer only on what the tool actually returns; say so plainly if it returns nothing relevant. Beyond ' +
  'that one lookup, you have no other tool, database, or system action — you cannot change any record, send ' +
  'any alert, or take any action; you can only reply with text. If asked to do something that requires taking ' +
  'an action, explain that you can only talk, not act, and suggest the operator use the appropriate screen in ' +
  'the app instead.\n\n' +
  PROJECT_BRIEFING

// Fixed role reference so the model can reason about what's actually
// relevant to mention for the specific person it's talking to, without
// ever being told (or able) to perform any of it itself — this is
// descriptive context for tailoring answers, not a grant of capability.
const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: 'unrestricted access across every country: can manage users/organizations, author and approve ' +
    'CAP alerts, configure every admin setting (including this AI assistant\'s per-country toggles), and see ' +
    'everything.',
  country_admin: 'scoped to their own country only: can author and approve CAP alerts, moderate community hazard ' +
    'reports, manage that country\'s SOP documents/incidents/shelters/drills, and manage org_admin/viewer ' +
    'accounts within that country.',
  org_admin: 'scoped to their own organization within their country: mostly read-only visibility into hazard ' +
    'reports assigned to their organization; cannot approve alerts or change country-wide configuration.',
  viewer: 'read-only access: can see the live hazard map, alerts, and public information, but cannot author, ' +
    'approve, or moderate anything.',
}

// Per-request identity context — who is actually asking, so "who am I" and
// role-appropriate guidance ("what can I do here") work naturally. Built
// fresh per request (not cached) by ai-chat/index.ts from the caller's own
// authenticated profile, never from anything the user can type themselves.
export function buildUserContext(profile: {
  full_name: string | null
  email: string | null
  role: string
  country_code: string | null
}): string {
  const name = profile.full_name || profile.email || '(name not set)'
  const roleDesc = ROLE_DESCRIPTIONS[profile.role] ?? 'an unrecognized role'
  const countryLine = profile.country_code
    ? `scoped to country "${profile.country_code}"`
    : profile.role === 'super_admin'
      ? 'not scoped to a single country (super_admin sees all countries)'
      : 'no country assigned'
  return (
    `The person you are talking to right now: name/handle "${name}", role "${profile.role}" (${roleDesc}), ${countryLine}. ` +
    'Use this to answer identity questions ("who am I") directly, and to tailor guidance to what this specific ' +
    'person is actually authorized to do — e.g. do not suggest actions their role cannot perform, and mention ' +
    'the relevant screen/permission boundary when relevant. You still cannot perform any action yourself, only ' +
    'describe/guide.'
  )
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

// Free-form conversational reply — used by ai-chat. Unlike translate/
// summarize/classify_photo, a chat reply is never written to any entity and
// never requires approval (FR-004 only applies to suggestions that could
// become persisted content); it is purely informational, which is why it
// carries no source_table/source_id and is not logged as an ai_suggestions
// row (research.md addendum — see ai-chat/index.ts header comment).
export async function chatReply(history: ChatTurn[], userContext?: string): Promise<AiProviderResult<string>> {
  const { textModel } = providerConfig()
  const systemMessages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }]
  if (userContext) systemMessages.push({ role: 'system', content: userContext })
  return chatCompletion([...systemMessages, ...history], textModel)
}

// Same conversational contract as chatReply, but the model may call one of
// `tools` to ground its answer in real data instead of guessing. Strictly
// read-only by construction: `executeTool` is supplied by the caller
// (ai-chat/index.ts) and is the ONLY thing that ever touches the database —
// this function just relays whatever executeTool returns back to the model
// as a tool result message. The model can never write/mutate anything
// through this path; it can only ask a question and get a JSON answer back,
// same "informational only" guarantee as plain chatReply (FR-002).
export async function chatReplyWithTools(
  history: ChatTurn[],
  userContext: string | undefined,
  tools: unknown[],
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>,
): Promise<AiProviderResult<string>> {
  const { textModel } = providerConfig()
  const systemMessages = [{ role: 'system', content: CHAT_SYSTEM_PROMPT }]
  if (userContext) systemMessages.push({ role: 'system', content: userContext })

  const messages: Array<Record<string, unknown>> = [...systemMessages, ...history]

  const first = await chatCompletionRaw(messages, textModel, tools)
  if (!first.ok || !first.data) return { ok: false, data: null, reason: 'provider_unavailable' }

  if (!first.data.tool_calls?.length) {
    return first.data.content ? { ok: true, data: first.data.content, reason: null } : { ok: false, data: null, reason: 'provider_unavailable' }
  }

  // Model asked for data — run each requested (read-only) lookup, feed the
  // results back, and ask once more for the actual natural-language answer.
  messages.push({ role: 'assistant', content: first.data.content ?? null, tool_calls: first.data.tool_calls })
  for (const call of first.data.tool_calls) {
    let args: Record<string, unknown> = {}
    try {
      args = JSON.parse(call.function.arguments || '{}')
    } catch {
      // malformed arguments from the model — hand back an error string so
      // the model can recover in its final answer rather than us erroring out
    }
    const resultText = await executeTool(call.function.name, args).catch((e) => `error: ${e?.message ?? 'tool failed'}`)
    messages.push({ role: 'tool', tool_call_id: call.id, content: resultText })
  }

  const second = await chatCompletionRaw(messages, textModel)
  if (!second.ok || !second.data?.content) return { ok: false, data: null, reason: 'provider_unavailable' }
  return { ok: true, data: second.data.content, reason: null }
}

export async function classifyHazardPhoto(
  photoBase64: string,
  hazardTypeOptions: string[],
): Promise<AiProviderResult<{ suggested_hazard_type: string; confidence: number }>> {
  const { visionModel } = providerConfig()
  const result = await chatCompletion(
    [
      {
        role: 'system',
        content:
          `Classify the hazard shown in this photo into exactly one of: ${hazardTypeOptions.join(', ')}. ` +
          'Reply with ONLY compact JSON: {"suggested_hazard_type": "<one of the options>", "confidence": <0..1>}. ' +
          'Do not include any other text.',
      },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoBase64}` } },
        ],
      },
    ],
    visionModel,
  )

  if (!result.ok || !result.data) {
    return { ok: false, data: null, reason: 'provider_unavailable' }
  }

  try {
    const parsed = JSON.parse(result.data)
    if (typeof parsed?.suggested_hazard_type !== 'string' || typeof parsed?.confidence !== 'number') {
      return { ok: false, data: null, reason: 'provider_unavailable' }
    }
    return { ok: true, data: parsed, reason: null }
  } catch {
    return { ok: false, data: null, reason: 'provider_unavailable' }
  }
}
