import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { shouldAutoRetryNow, RetriableReceipt } from './dispatchBackoff.ts'

const now = new Date('2026-07-07T12:00:00.000Z')

function receipt(overrides: Partial<RetriableReceipt> = {}): RetriableReceipt {
  return { status: 'failed', retry_count: 0, last_attempted_at: '2026-07-07T11:00:00.000Z', ...overrides }
}

Deno.test('does not retry a receipt that is not in failed status', () => {
  assertEquals(shouldAutoRetryNow(receipt({ status: 'queued' }), now), false)
})

Deno.test('does not retry a receipt that has reached the max auto-retry count', () => {
  assertEquals(shouldAutoRetryNow(receipt({ retry_count: 4 }), now), false)
})

Deno.test('retries immediately when last_attempted_at is null (defensive default)', () => {
  assertEquals(shouldAutoRetryNow(receipt({ last_attempted_at: null }), now), true)
})

Deno.test('does not retry when the backoff window has not elapsed (retry_count=0, 5 minutes ago)', () => {
  assertEquals(shouldAutoRetryNow(receipt({ last_attempted_at: '2026-07-07T11:55:00.000Z' }), now), false)
})

Deno.test('retries when the backoff window has elapsed (retry_count=0, 16 minutes ago)', () => {
  assertEquals(shouldAutoRetryNow(receipt({ last_attempted_at: '2026-07-07T11:44:00.000Z' }), now), true)
})

Deno.test('computes a longer backoff for higher retry_count (retry_count=2 requires 60 minutes)', () => {
  const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60_000).toISOString()
  const sixtyOneMinutesAgo = new Date(now.getTime() - 61 * 60_000).toISOString()
  assertEquals(shouldAutoRetryNow(receipt({ retry_count: 2, last_attempted_at: fiftyNineMinutesAgo }), now), false)
  assertEquals(shouldAutoRetryNow(receipt({ retry_count: 2, last_attempted_at: sixtyOneMinutesAgo }), now), true)
})
