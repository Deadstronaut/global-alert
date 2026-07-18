import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRoadRecord } from './validateRoadRecord.ts'
import type { RoadRecord } from './roadRecord.ts'

const SERVED = ['TR', 'MG']

function validRecord(overrides: Partial<RoadRecord> = {}): RoadRecord {
  return {
    geometry: { type: 'LineString', coordinates: [[27.1, 38.5], [27.2, 38.6]] },
    lengthMeters: 120.5,
    countryCode: 'TR',
    properties: { highway: 'motorway', osmId: 12345 },
    ...overrides,
  }
}

Deno.test('validateRoadRecord: valid record passes', () => {
  const result = validateRoadRecord(validRecord(), SERVED)
  assertEquals(result, { valid: true })
})

Deno.test('validateRoadRecord: zero length is rejected', () => {
  const result = validateRoadRecord(validRecord({ lengthMeters: 0 }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: negative length is rejected', () => {
  const result = validateRoadRecord(validRecord({ lengthMeters: -5 }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: non-finite length is rejected', () => {
  const result = validateRoadRecord(validRecord({ lengthMeters: NaN }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: invalid/empty geometry is rejected', () => {
  const result = validateRoadRecord(
    validRecord({ geometry: { type: 'LineString', coordinates: [] } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: out-of-coverage country code is rejected', () => {
  const result = validateRoadRecord(validRecord({ countryCode: 'FR' }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: unsupported highway value is rejected', () => {
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'footway', osmId: 1 } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: out-of-MVP-scope highway value (e.g. primary) is rejected', () => {
  // MVP scope is motorway only (research.md §8 addendum, narrowed twice
  // after live Edge Function memory-limit findings) — trunk/primary and
  // below are out of scope for now, not merely "unsupported" in the generic
  // sense; this is a deliberate scope narrowing, not a bug.
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'primary', osmId: 2 } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: trunk is out of MVP scope and rejected', () => {
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'trunk', osmId: 3 } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateRoadRecord: MultiLineString geometry is accepted', () => {
  const result = validateRoadRecord(
    validRecord({ geometry: { type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]]] } }),
    SERVED,
  )
  assertEquals(result, { valid: true })
})
