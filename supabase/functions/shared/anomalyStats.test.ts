import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { checkAnomaly } from './anomalyStats.ts'

Deno.test('checkAnomaly: insufficient history never flags', () => {
  const result = checkAnomaly([1, 2, 3], 100)
  assertEquals(result.isAnomaly, false)
  assertEquals(result.zScore, null)
})

Deno.test('checkAnomaly: value within normal range is not flagged', () => {
  const history = [4.0, 4.1, 4.2, 3.9, 4.0, 4.1, 4.0]
  const result = checkAnomaly(history, 4.15)
  assertEquals(result.isAnomaly, false)
})

Deno.test('checkAnomaly: value far outside history is flagged', () => {
  const history = [4.0, 4.1, 4.2, 3.9, 4.0, 4.1, 4.0]
  const result = checkAnomaly(history, 9.5)
  assertEquals(result.isAnomaly, true)
  assertEquals(typeof result.zScore, 'number')
})

Deno.test('checkAnomaly: zero-variance history flags any deviation without a z-score', () => {
  const history = [5, 5, 5, 5, 5]
  const flagged = checkAnomaly(history, 6)
  assertEquals(flagged.isAnomaly, true)
  assertEquals(flagged.zScore, null)

  const notFlagged = checkAnomaly(history, 5)
  assertEquals(notFlagged.isAnomaly, false)
})

Deno.test('checkAnomaly: custom threshold is respected', () => {
  const history = [4.0, 4.1, 4.2, 3.9, 4.0, 4.1, 4.0]
  const value = 4.5
  const strict = checkAnomaly(history, value, 1)
  const lenient = checkAnomaly(history, value, 10)
  assertEquals(strict.isAnomaly, true)
  assertEquals(lenient.isAnomaly, false)
})
