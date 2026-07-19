import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validatePopulationRasterRecord } from './validatePopulationRasterRecord.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const SERVED = ['tr', 'mg']

function validRecord(overrides: Partial<PopulationRasterRecord> = {}): PopulationRasterRecord {
  return {
    geometry: { type: 'Polygon', coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.6], [27.1, 38.5]]] },
    populationCount: 1234,
    countryCode: 'tr',
    properties: { h3Cell: '870326233ffffff', source: 'worldpop' },
    ...overrides,
  }
}

Deno.test('validatePopulationRasterRecord: valid record passes', () => {
  assertEquals(validatePopulationRasterRecord(validRecord(), SERVED), { valid: true })
})

Deno.test('validatePopulationRasterRecord: zero population is accepted (legitimate value)', () => {
  assertEquals(validatePopulationRasterRecord(validRecord({ populationCount: 0 }), SERVED).valid, true)
})

Deno.test('validatePopulationRasterRecord: negative population is rejected', () => {
  assertEquals(validatePopulationRasterRecord(validRecord({ populationCount: -1 }), SERVED).valid, false)
})

Deno.test('validatePopulationRasterRecord: non-finite population is rejected', () => {
  assertEquals(validatePopulationRasterRecord(validRecord({ populationCount: NaN }), SERVED).valid, false)
})

Deno.test('validatePopulationRasterRecord: invalid geometry is rejected', () => {
  const result = validatePopulationRasterRecord(
    // deno-lint-ignore no-explicit-any
    validRecord({ geometry: { type: 'GeometryCollection', geometries: [] } as any }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validatePopulationRasterRecord: out-of-coverage country code is rejected', () => {
  assertEquals(validatePopulationRasterRecord(validRecord({ countryCode: 'fr' }), SERVED).valid, false)
})
