import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  submitEwdsJob,
  getEwdsJobStatus,
  waitForEwdsJob,
  getEwdsJobAsset,
} from './ewdsClient.ts'

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  let call = 0
  const original = globalThis.fetch
  const urls: string[] = []
  const headers: Headers[] = []
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((url: string, init?: any) => {
    urls.push(String(url))
    headers.push(new Headers(init?.headers ?? {}))
    const r = responses[Math.min(call, responses.length - 1)]
    call += 1
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }))
  }) as typeof fetch
  return { urls, headers, restore: () => { globalThis.fetch = original } }
}

Deno.test('submitEwdsJob: sends PRIVATE-TOKEN header (not Bearer/Basic) and returns jobID', async () => {
  const mock = mockFetch([{ status: 201, body: { jobID: 'job-123', status: 'accepted' } }])
  try {
    const jobId = await submitEwdsJob('cems-glofas-forecast', { variable: 'river_discharge_in_the_last_24_hours' }, 'my-token')
    assertEquals(jobId, 'job-123')
    assertEquals(mock.urls[0], 'https://ewds.climate.copernicus.eu/api/retrieve/v1/processes/cems-glofas-forecast/execution')
    assertEquals(mock.headers[0].get('PRIVATE-TOKEN'), 'my-token')
  } finally {
    mock.restore()
  }
})

Deno.test('submitEwdsJob: throws with response body on non-ok status', async () => {
  const mock = mockFetch([{ status: 401, body: { detail: 'authentication required' } }])
  try {
    await assertRejects(() => submitEwdsJob('cems-glofas-forecast', {}, 'bad-token'), Error, 'HTTP 401')
  } finally {
    mock.restore()
  }
})

Deno.test('getEwdsJobStatus: reads status field from job GET', async () => {
  const mock = mockFetch([{ status: 200, body: { status: 'running' } }])
  try {
    const status = await getEwdsJobStatus('job-123', 'my-token')
    assertEquals(status, 'running')
  } finally {
    mock.restore()
  }
})

Deno.test('waitForEwdsJob: polls until successful', async () => {
  const mock = mockFetch([
    { status: 200, body: { status: 'accepted' } },
    { status: 200, body: { status: 'running' } },
    { status: 200, body: { status: 'successful' } },
  ])
  try {
    await waitForEwdsJob('job-123', 'my-token', { pollIntervalMs: 1 })
  } finally {
    mock.restore()
  }
})

Deno.test('waitForEwdsJob: throws on failed status instead of returning silently', async () => {
  const mock = mockFetch([{ status: 200, body: { status: 'failed' } }])
  try {
    await assertRejects(() => waitForEwdsJob('job-123', 'my-token', { pollIntervalMs: 1 }), Error, 'failed')
  } finally {
    mock.restore()
  }
})

Deno.test('getEwdsJobAsset: extracts asset.value from results response', async () => {
  const asset = { type: 'application/x-grib2', href: 'https://example.com/file.grib2', 'file:checksum': 'abc', 'file:size': 123, 'file:local_path': 'file.grib2' }
  const mock = mockFetch([{ status: 200, body: { asset: { value: asset } } }])
  try {
    const result = await getEwdsJobAsset('job-123', 'my-token')
    assertEquals(result.href, 'https://example.com/file.grib2')
  } finally {
    mock.restore()
  }
})
