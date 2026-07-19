import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateBasinRecord } from './validateBasinRecord.ts'
import type { BasinRecord } from './basinRecord.ts'

const SERVED = ['tr', 'mg']

function validRecord(overrides: Partial<BasinRecord> = {}): BasinRecord {
  return {
    geometry: { type: 'Polygon', coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.6], [27.1, 38.5]]] },
    areaKm2: 23745.5,
    countryCode: 'tr',
    properties: { hybasId: 2120003240, pfafId: 211203 },
    ...overrides,
  }
}

Deno.test('validateBasinRecord: valid record passes', () => {
  assertEquals(validateBasinRecord(validRecord(), SERVED), { valid: true })
})

Deno.test('validateBasinRecord: zero area is rejected', () => {
  assertEquals(validateBasinRecord(validRecord({ areaKm2: 0 }), SERVED).valid, false)
})

Deno.test('validateBasinRecord: negative area is rejected', () => {
  assertEquals(validateBasinRecord(validRecord({ areaKm2: -1 }), SERVED).valid, false)
})

Deno.test('validateBasinRecord: non-finite area is rejected', () => {
  assertEquals(validateBasinRecord(validRecord({ areaKm2: NaN }), SERVED).valid, false)
})

Deno.test('validateBasinRecord: unsupported geometry type is rejected', () => {
  // geometryToWkt's Polygon case doesn't itself reject empty coordinate
  // arrays (a pre-existing characteristic, not introduced by this feature —
  // spec 040's own validator tests hit the same situation and use an
  // unsupported type instead, e.g. GeometryCollection, which does throw).
  const result = validateBasinRecord(
    // deno-lint-ignore no-explicit-any
    validRecord({ geometry: { type: 'GeometryCollection', coordinates: [] } as any }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateBasinRecord: out-of-coverage country code is rejected', () => {
  assertEquals(validateBasinRecord(validRecord({ countryCode: 'fr' }), SERVED).valid, false)
})
