import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { translateText, summarizeText } from './aiProvider.ts'

function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  const previous: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = Deno.env.get(k)
    Deno.env.set(k, v)
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) Deno.env.delete(k)
      else Deno.env.set(k, v)
    }
  })
}

function stubFetch(impl: typeof fetch) {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return () => {
    globalThis.fetch = original
  }
}

Deno.test('translateText: returns provider_unavailable when AI_PROVIDER_BASE_URL/API_KEY are unset', async () => {
  await withEnv({ AI_PROVIDER_BASE_URL: '', AI_PROVIDER_API_KEY: '' }, async () => {
    Deno.env.delete('AI_PROVIDER_BASE_URL')
    Deno.env.delete('AI_PROVIDER_API_KEY')
    const result = await translateText('Merhaba', 'tr', 'en')
    assertEquals(result.ok, false)
    assertEquals(result.reason, 'provider_unavailable')
  })
})

Deno.test('translateText: returns translated text on a successful provider response', async () => {
  const restore = stubFetch(async () =>
    new Response(JSON.stringify({ choices: [{ message: { content: 'Hello' } }] }), { status: 200 }),
  )
  try {
    await withEnv(
      { AI_PROVIDER_BASE_URL: 'https://example.test', AI_PROVIDER_API_KEY: 'test-key' },
      async () => {
        const result = await translateText('Merhaba', 'tr', 'en')
        assertEquals(result.ok, true)
        assertEquals(result.data, 'Hello')
      },
    )
  } finally {
    restore()
  }
})

Deno.test('summarizeText: returns provider_unavailable on a non-OK HTTP response', async () => {
  const restore = stubFetch(async () => new Response('server error', { status: 500 }))
  try {
    await withEnv(
      { AI_PROVIDER_BASE_URL: 'https://example.test', AI_PROVIDER_API_KEY: 'test-key' },
      async () => {
        const result = await summarizeText('Uzun bir SOP metni...')
        assertEquals(result.ok, false)
        assertEquals(result.reason, 'provider_unavailable')
      },
    )
  } finally {
    restore()
  }
})

Deno.test('summarizeText: returns provider_unavailable when fetch throws (network error/timeout)', async () => {
  const restore = stubFetch(async () => {
    throw new Error('network down')
  })
  try {
    await withEnv(
      { AI_PROVIDER_BASE_URL: 'https://example.test', AI_PROVIDER_API_KEY: 'test-key' },
      async () => {
        const result = await summarizeText('Uzun bir SOP metni...')
        assertEquals(result.ok, false)
        assertEquals(result.reason, 'provider_unavailable')
      },
    )
  } finally {
    restore()
  }
})
