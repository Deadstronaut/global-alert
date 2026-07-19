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

Deno.test('validateRoadRecord: primary is in MVP scope and accepted', () => {
  // MVP scope widened 2026-07-19 to motorway|trunk|primary (Madagascar has
  // zero motorway-tagged OSM ways — see osmRoadsFetch.ts's HIGHWAY_FILTER
  // for the full history). secondary and below remain out of scope.
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'primary', osmId: 2 } }),
    SERVED,
  )
  assertEquals(result.valid, true)
})

Deno.test('validateRoadRecord: trunk is in MVP scope and accepted', () => {
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'trunk', osmId: 3 } }),
    SERVED,
  )
  assertEquals(result.valid, true)
})

Deno.test('validateRoadRecord: secondary is out of MVP scope and rejected', () => {
  const result = validateRoadRecord(
    validRecord({ properties: { highway: 'secondary', osmId: 4 } }),
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
