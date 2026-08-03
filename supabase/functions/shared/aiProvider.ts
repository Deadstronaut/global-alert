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
// This module is ONLY used by ai-translate, ai-summarize, and
// ai-classify-photo. ai-anomaly-check does NOT use it — that capability is
// deliberately pure statistics (research.md Decision 2), not an AI call.

const DEFAULT_TIMEOUT_MS = 10_000

export interface AiProviderResult<T> {
  ok: boolean
  data: T | null
  reason: 'provider_unavailable' | null
}

interface ChatCompletionChoice {
  message?: { content?: string }
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
