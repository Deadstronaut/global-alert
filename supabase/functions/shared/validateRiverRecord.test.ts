import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateRiverRecord } from './validateRiverRecord.ts'
import type { RiverRecord } from './riverRecord.ts'

const SERVED = ['tr', 'mg']

function validRecord(overrides: Partial<RiverRecord> = {}): RiverRecord {
  return {
    geometry: { type: 'LineString', coordinates: [[27.1, 38.5], [27.2, 38.6]] },
    lengthMeters: 4200,
    countryCode: 'tr',
    properties: { hybasId: 2120003240 },
    ...overrides,
  }
}

Deno.test('validateRiverRecord: valid record passes', () => {
  assertEquals(validateRiverRecord(validRecord(), SERVED), { valid: true })
})

Deno.test('validateRiverRecord: zero length is rejected', () => {
  assertEquals(validateRiverRecord(validRecord({ lengthMeters: 0 }), SERVED).valid, false)
})

Deno.test('validateRiverRecord: negative length is rejected', () => {
  assertEquals(validateRiverRecord(validRecord({ lengthMeters: -1 }), SERVED).valid, false)
})

Deno.test('validateRiverRecord: non-finite length is rejected', () => {
  assertEquals(validateRiverRecord(validRecord({ lengthMeters: NaN }), SERVED).valid, false)
})

Deno.test('validateRiverRecord: invalid/empty geometry is rejected', () => {
  const result = validateRiverRecord(
    validRecord({ geometry: { type: 'LineString', coordinates: [] } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateRiverRecord: out-of-coverage country code is rejected', () => {
  assertEquals(validateRiverRecord(validRecord({ countryCode: 'fr' }), SERVED).valid, false)
})
