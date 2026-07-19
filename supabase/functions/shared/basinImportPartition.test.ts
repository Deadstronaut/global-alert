import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionBasinRecords } from './basinImportPartition.ts'
import type { BasinRecord } from './basinRecord.ts'

const SERVED = ['tr', 'mg']

function record(overrides: Partial<BasinRecord> = {}): BasinRecord {
  return {
    geometry: { type: 'Polygon', coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.6], [27.1, 38.5]]] },
    areaKm2: 1000,
    countryCode: 'tr',
    properties: { hybasId: 1, pfafId: 1 },
    ...overrides,
  }
}

Deno.test('partitionBasinRecords: all-valid batch returns no rejections', () => {
  const { validRecords, rejectedRecords } = partitionBasinRecords([record(), record()], SERVED)
  assertEquals(validRecords.length, 2)
  assertEquals(rejectedRecords.length, 0)
})

Deno.test('partitionBasinRecords: mixed batch separates valid from invalid', () => {
  const records = [record(), record({ areaKm2: -1 }), record({ countryCode: 'fr' })]
  const { validRecords, rejectedRecords } = partitionBasinRecords(records, SERVED)
  assertEquals(validRecords.length, 1)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionBasinRecords: all-invalid batch returns zero valid without throwing', () => {
  const records = [record({ areaKm2: 0 }), record({ countryCode: 'zz' })]
  const { validRecords, rejectedRecords } = partitionBasinRecords(records, SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionBasinRecords: empty batch returns empty results', () => {
  const { validRecords, rejectedRecords } = partitionBasinRecords([], SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 0)
})
