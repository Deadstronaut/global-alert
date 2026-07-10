/**
 * Small seeded PRNG (mulberry32) so a given seed always reproduces the
 * identical sample sequence — no dependency, no fitted statistical model
 * (research.md §6). Used by compute-risk-exceedance-curve to bootstrap-
 * resample an area's real historical hazard records reproducibly.
 */

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return function next(): number {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Bootstrap-sample `count` items (with replacement) from `values` using a seeded RNG. */
export function bootstrapResample<T>(values: T[], count: number, seed: number): T[] {
  if (values.length === 0) return []
  const rng = mulberry32(seed)
  const result: T[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * values.length)
    result.push(values[index])
  }
  return result
}
