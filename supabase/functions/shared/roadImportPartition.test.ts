import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionRoadRecords } from './roadImportPartition.ts'
import type { RoadRecord } from './roadRecord.ts'

const SERVED = ['TR', 'MG']

function record(overrides: Partial<RoadRecord> = {}): RoadRecord {
  return {
    geometry: { type: 'LineString', coordinates: [[27.1, 38.5], [27.2, 38.6]] },
    lengthMeters: 100,
    countryCode: 'TR',
    properties: { highway: 'motorway', osmId: 1 },
    ...overrides,
  }
}

Deno.test('partitionRoadRecords: all-valid batch returns no rejections', () => {
  const records = [record(), record({ properties: { highway: 'trunk', osmId: 2 } })]
  const { validRecords, rejectedRecords } = partitionRoadRecords(records, SERVED)
  assertEquals(validRecords.length, 2)
  assertEquals(rejectedRecords.length, 0)
})

Deno.test('partitionRoadRecords: mixed batch separates valid from invalid', () => {
  const records = [
    record(),
    record({ lengthMeters: -1 }),
    record({ countryCode: 'FR' }),
  ]
  const { validRecords, rejectedRecords } = partitionRoadRecords(records, SERVED)
  assertEquals(validRecords.length, 1)
  assertEquals(rejectedRecords.length, 2)
  assertEquals(typeof rejectedRecords[0].reason, 'string')
})

Deno.test('partitionRoadRecords: all-invalid batch returns zero valid records without throwing', () => {
  const records = [record({ lengthMeters: 0 }), record({ properties: { highway: 'footway', osmId: 3 } })]
  const { validRecords, rejectedRecords } = partitionRoadRecords(records, SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionRoadRecords: empty batch returns empty results', () => {
  const { validRecords, rejectedRecords } = partitionRoadRecords([], SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 0)
})
