import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveWorldPopDownloadUrl } from './worldPopFetch.ts'

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  const original = globalThis.fetch
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((..._args: any[]) =>
    Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response)) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

Deno.test('resolveWorldPopDownloadUrl: picks the latest popyear entry', async () => {
  const restore = mockFetchOnce({
    data: [
      { popyear: '2000', files: ['https://example.com/2000.tif'] },
      { popyear: '2020', files: ['https://example.com/2020.tif'] },
      { popyear: '2010', files: ['https://example.com/2010.tif'] },
    ],
  })
  try {
    const url = await resolveWorldPopDownloadUrl('TUR')
    assertEquals(url, 'https://example.com/2020.tif')
  } finally {
    restore()
  }
})

Deno.test('resolveWorldPopDownloadUrl: returns null when a country has no coverage', async () => {
  const restore = mockFetchOnce({ data: [] })
  try {
    const url = await resolveWorldPopDownloadUrl('XYZ')
    assertEquals(url, null)
  } finally {
    restore()
  }
})

Deno.test('resolveWorldPopDownloadUrl: throws on a non-ok HTTP response', async () => {
  const restore = mockFetchOnce({}, false, 503)
  try {
    let threw = false
    try {
      await resolveWorldPopDownloadUrl('TUR')
    } catch {
      threw = true
    }
    assertEquals(threw, true)
  } finally {
    restore()
  }
})
