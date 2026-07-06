import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeResponseTimeSeconds, computeAckRate } from './drillMetrics.ts'

Deno.test('computeResponseTimeSeconds: returns null when no alert was ever issued', () => {
  assertEquals(computeResponseTimeSeconds('2026-07-06T10:00:00Z', null), null)
})

Deno.test('computeResponseTimeSeconds: returns the elapsed seconds between start and first alert', () => {
  assertEquals(computeResponseTimeSeconds('2026-07-06T10:00:00Z', '2026-07-06T10:05:00Z'), 300)
})

Deno.test('computeAckRate: returns null when nothing was sent', () => {
  assertEquals(computeAckRate(0, 0), null)
})

Deno.test('computeAckRate: returns sent/acknowledged counts unchanged', () => {
  assertEquals(computeAckRate(5, 3), { sent: 5, acknowledged: 3 })
})

Deno.test('computeAckRate: zero acknowledgments with a nonzero sent count is a valid, displayable rate', () => {
  assertEquals(computeAckRate(5, 0), { sent: 5, acknowledged: 0 })
})
