import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { computeNextState } from './sourceHealth.ts'

// computeNextState is the pure decision function extracted from recordFetchOutcome/
// setSourceActive so the state-machine rules can be unit tested without a live DB.

Deno.test('healthy -> healthy on success', () => {
  const next = computeNextState({
    currentState: 'healthy',
    consecutiveFailures: 0,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'healthy')
  assertEquals(next.consecutiveFailures, 0)
  assertEquals(next.transitioned, false)
})

Deno.test('healthy -> degraded on failure', () => {
  const next = computeNextState({
    currentState: 'healthy',
    consecutiveFailures: 0,
    outcome: 'failure',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'degraded')
  assertEquals(next.consecutiveFailures, 1)
  assertEquals(next.transitioned, true)
})

Deno.test('healthy -> degraded when stale even on success', () => {
  const next = computeNextState({
    currentState: 'healthy',
    consecutiveFailures: 0,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: true,
  })
  assertEquals(next.state, 'degraded')
})

Deno.test('degraded -> down after N consecutive failures', () => {
  const next = computeNextState({
    currentState: 'degraded',
    consecutiveFailures: 2,
    outcome: 'failure',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'down')
  assertEquals(next.consecutiveFailures, 3)
  assertEquals(next.transitioned, true)
})

Deno.test('degraded stays degraded before reaching failure threshold', () => {
  const next = computeNextState({
    currentState: 'degraded',
    consecutiveFailures: 1,
    outcome: 'failure',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'degraded')
  assertEquals(next.consecutiveFailures, 2)
  assertEquals(next.transitioned, false)
})

Deno.test('degraded -> healthy on success (recovery)', () => {
  const next = computeNextState({
    currentState: 'degraded',
    consecutiveFailures: 2,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'healthy')
  assertEquals(next.consecutiveFailures, 0)
  assertEquals(next.transitioned, true)
})

Deno.test('down -> healthy on success (recovery)', () => {
  const next = computeNextState({
    currentState: 'down',
    consecutiveFailures: 5,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'healthy')
  assertEquals(next.consecutiveFailures, 0)
  assertEquals(next.transitioned, true)
})

Deno.test('down stays down on further failure', () => {
  const next = computeNextState({
    currentState: 'down',
    consecutiveFailures: 4,
    outcome: 'failure',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'down')
  assertEquals(next.transitioned, false)
})

Deno.test('disabled source ignores fetch outcomes (no transition)', () => {
  const next = computeNextState({
    currentState: 'disabled',
    consecutiveFailures: 0,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'disabled')
  assertEquals(next.transitioned, false)
})

Deno.test('empty-but-successful fetch counts as success (stays healthy)', () => {
  const next = computeNextState({
    currentState: 'healthy',
    consecutiveFailures: 0,
    outcome: 'success',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'healthy')
  assertEquals(next.transitioned, false)
})

// spec 038 T031: computeNextState() never takes a hazard_type parameter at
// all — resolveSourceId()'s hazard_type filter is a separate DB lookup, not
// something this state machine branches on. This test is a no-op
// confirmation that a 'population' source's fetch outcomes go through the
// exact same rules as any other hazard type (degraded/down transition after
// consecutive failures), not a hidden special case.
Deno.test('degraded -> down after consecutive failures behaves identically for a population source', () => {
  const next = computeNextState({
    currentState: 'degraded',
    consecutiveFailures: 2,
    outcome: 'failure',
    downAfterConsecutiveFailures: 3,
    isStale: false,
  })
  assertEquals(next.state, 'down')
  assertEquals(next.transitioned, true)
})
