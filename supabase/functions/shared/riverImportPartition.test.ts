import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionRiverRecords } from './riverImportPartition.ts'
import type { RiverRecord } from './riverRecord.ts'

const SERVED = ['tr', 'mg']

function record(overrides: Partial<RiverRecord> = {}): RiverRecord {
  return {
    geometry: { type: 'LineString', coordinates: [[27.1, 38.5], [27.2, 38.6]] },
    lengthMeters: 100,
    countryCode: 'tr',
    properties: { hybasId: 1 },
    ...overrides,
  }
}

Deno.test('partitionRiverRecords: all-valid batch returns no rejections', () => {
  const { validRecords, rejectedRecords } = partitionRiverRecords([record(), record()], SERVED)
  assertEquals(validRecords.length, 2)
  assertEquals(rejectedRecords.length, 0)
})

Deno.test('partitionRiverRecords: mixed batch separates valid from invalid', () => {
  const records = [record(), record({ lengthMeters: -1 }), record({ countryCode: 'fr' })]
  const { validRecords, rejectedRecords } = partitionRiverRecords(records, SERVED)
  assertEquals(validRecords.length, 1)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionRiverRecords: all-invalid batch returns zero valid without throwing', () => {
  const records = [record({ lengthMeters: 0 }), record({ countryCode: 'zz' })]
  const { validRecords, rejectedRecords } = partitionRiverRecords(records, SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionRiverRecords: empty batch returns empty results', () => {
  const { validRecords, rejectedRecords } = partitionRiverRecords([], SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 0)
})
