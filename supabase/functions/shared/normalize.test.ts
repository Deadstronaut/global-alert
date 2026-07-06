import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { getCachedBreakpoints, applyFetchResult, __resetCacheForTest } from './hazardThresholdsCache.ts'
import { normalize, evaluateBreakpoints } from './normalize.ts'

// Cache/fallback behavior (contracts/hazard-thresholds-cache.md test table, spec 016)

Deno.test('cache: never fetched yet returns undefined for any hazard type', () => {
  __resetCacheForTest()
  assertEquals(getCachedBreakpoints('earthquake'), undefined)
})

Deno.test('cache: returns breakpoints for a hazard type present after a successful fetch', () => {
  __resetCacheForTest({
    thresholds: { earthquake: [{ min_value: 0, severity: 'minimal' }, { min_value: 6.0, severity: 'high' }] },
    fetchedAt: Date.now(),
  })
  assertEquals(getCachedBreakpoints('earthquake'), [
    { min_value: 0, severity: 'minimal' },
    { min_value: 6.0, severity: 'high' },
  ])
})

Deno.test('cache: returns undefined for a hazard type absent from a successfully fetched registry', () => {
  __resetCacheForTest({ thresholds: { earthquake: [{ min_value: 0, severity: 'low' }] }, fetchedAt: Date.now() })
  assertEquals(getCachedBreakpoints('wildfire'), undefined)
})

Deno.test('cache: applyFetchResult(current, null) returns current unchanged (refresh failure preserves cache)', () => {
  const current = { thresholds: { earthquake: [{ min_value: 0, severity: 'low' }] }, fetchedAt: 12345, refreshing: true }
  const next = applyFetchResult(current, null)
  assertEquals(next, current)
})

Deno.test('cache: applyFetchResult(current, rows) replaces thresholds and updates fetchedAt', () => {
  const current = { thresholds: {}, fetchedAt: 0, refreshing: true }
  const next = applyFetchResult(current, [{ hazard_type_code: 'flood', breakpoints: [{ min_value: 1, severity: 'low' }] }])
  assertEquals(next.thresholds, { flood: [{ min_value: 1, severity: 'low' }] })
  assertEquals(next.refreshing, false)
})

Deno.test('evaluateBreakpoints: uses customized registry breakpoints when present', () => {
  const breakpoints = [
    { min_value: 0, severity: 'minimal' },
    { min_value: 2.5, severity: 'low' },
    { min_value: 4.0, severity: 'moderate' },
    { min_value: 6.0, severity: 'high' },
    { min_value: 8.0, severity: 'critical' },
  ]
  assertEquals(evaluateBreakpoints(breakpoints, 5.7), 'moderate')
})

// normalize()-level tests (User Story 1)

Deno.test('normalize: uses a customized threshold when the registry has one for this hazard type', () => {
  __resetCacheForTest({
    thresholds: {
      earthquake: [
        { min_value: 0, severity: 'minimal' },
        { min_value: 2.5, severity: 'low' },
        { min_value: 4.0, severity: 'moderate' },
        { min_value: 6.0, severity: 'high' },
        { min_value: 7.5, severity: 'critical' },
      ],
    },
    fetchedAt: Date.now(),
  })
  const event = normalize({ id: '1', type: 'earthquake', lat: 0, lng: 0, magnitude: 5.7, source: 'test' })
  assertEquals(event.severity, 'moderate')
})

Deno.test('normalize: uncustomized hazard type falls back to the hardcoded map (zero regression)', () => {
  __resetCacheForTest()
  const event = normalize({ id: '2', type: 'wildfire', lat: 0, lng: 0, magnitude: 60, source: 'test' })
  assertEquals(event.severity, 'moderate')
})
