import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mulberry32, bootstrapResample } from './seededRandom.ts'

Deno.test('mulberry32: same seed produces the same sequence', () => {
  const a = mulberry32(42)
  const b = mulberry32(42)
  const seqA = [a(), a(), a()]
  const seqB = [b(), b(), b()]
  assertEquals(seqA, seqB)
})

Deno.test('mulberry32: different seeds produce different sequences', () => {
  const a = mulberry32(1)
  const b = mulberry32(2)
  assertNotEquals(a(), b())
})

Deno.test('mulberry32: values are within [0, 1)', () => {
  const rng = mulberry32(7)
  for (let i = 0; i < 100; i++) {
    const v = rng()
    assertEquals(v >= 0 && v < 1, true)
  }
})

Deno.test('bootstrapResample: same seed reproduces identical resampled output', () => {
  const values = [10, 20, 30, 40, 50]
  const a = bootstrapResample(values, 20, 42)
  const b = bootstrapResample(values, 20, 42)
  assertEquals(a, b)
})

Deno.test('bootstrapResample: empty input returns empty output', () => {
  assertEquals(bootstrapResample([], 10, 1), [])
})
