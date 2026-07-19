import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionPopulationRasterRecords } from './populationRasterImportPartition.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const SERVED = ['tr', 'mg']

function record(overrides: Partial<PopulationRasterRecord> = {}): PopulationRasterRecord {
  return {
    geometry: { type: 'Polygon', coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.6], [27.1, 38.5]]] },
    populationCount: 100,
    countryCode: 'tr',
    properties: { h3Cell: '870326233ffffff', source: 'worldpop' },
    ...overrides,
  }
}

Deno.test('partitionPopulationRasterRecords: all-valid batch returns no rejections', () => {
  const { validRecords, rejectedRecords } = partitionPopulationRasterRecords([record(), record()], SERVED)
  assertEquals(validRecords.length, 2)
  assertEquals(rejectedRecords.length, 0)
})

Deno.test('partitionPopulationRasterRecords: mixed batch separates valid from invalid', () => {
  const records = [record(), record({ populationCount: -1 }), record({ countryCode: 'fr' })]
  const { validRecords, rejectedRecords } = partitionPopulationRasterRecords(records, SERVED)
  assertEquals(validRecords.length, 1)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionPopulationRasterRecords: all-invalid batch returns zero valid without throwing', () => {
  const records = [record({ populationCount: -5 }), record({ countryCode: 'zz' })]
  const { validRecords, rejectedRecords } = partitionPopulationRasterRecords(records, SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionPopulationRasterRecords: empty batch returns empty results', () => {
  const { validRecords, rejectedRecords } = partitionPopulationRasterRecords([], SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 0)
})
