import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validatePopulationRecord } from './validatePopulationRecord.ts'
import type { PopulationRecord } from './populationRecord.ts'

const SERVED = ['TR', 'MY']

function validRecord(overrides: Partial<PopulationRecord> = {}): PopulationRecord {
  return {
    geometry: { type: 'Point', coordinates: [27.1, 38.5] },
    population: 120,
    countryCode: 'TR',
    properties: {},
    ...overrides,
  }
}

Deno.test('validatePopulationRecord: valid record passes', () => {
  const result = validatePopulationRecord(validRecord(), SERVED)
  assertEquals(result.valid, true)
})

Deno.test('validatePopulationRecord: population === 0 is valid, not rejected', () => {
  const result = validatePopulationRecord(validRecord({ population: 0 }), SERVED)
  assertEquals(result.valid, true)
})

Deno.test('validatePopulationRecord: negative population is rejected', () => {
  const result = validatePopulationRecord(validRecord({ population: -5 }), SERVED)
  assertEquals(result.valid, false)
  if (!result.valid) assertEquals(result.reason.includes('negative'), true)
})

Deno.test('validatePopulationRecord: non-numeric population is rejected', () => {
  const result = validatePopulationRecord(
    validRecord({ population: Number.NaN }),
    SERVED,
  )
  assertEquals(result.valid, false)
  if (!result.valid) assertEquals(result.reason.includes('finite number'), true)
})

Deno.test('validatePopulationRecord: invalid/empty geometry is rejected', () => {
  const result = validatePopulationRecord(
    // deno-lint-ignore no-explicit-any
    validRecord({ geometry: { type: 'LineString' as any, coordinates: [] } }),
    SERVED,
  )
  assertEquals(result.valid, false)
  if (!result.valid) assertEquals(result.reason.includes('Unsupported geometry type'), true)
})

Deno.test('validatePopulationRecord: out-of-coverage country code is rejected', () => {
  const result = validatePopulationRecord(validRecord({ countryCode: 'MG' }), SERVED)
  assertEquals(result.valid, false)
  if (!result.valid) assertEquals(result.reason.includes('not a served country'), true)
})
