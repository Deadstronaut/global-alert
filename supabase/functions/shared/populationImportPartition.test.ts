import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionPopulationRecords } from './populationImportPartition.ts'
import type { PopulationRecord } from './populationRecord.ts'

const SERVED = ['tr', 'mg']

function validRecord(overrides: Partial<PopulationRecord> = {}): PopulationRecord {
  return {
    countryCode: 'tr',
    population: 100,
    geometry: { type: 'Polygon', coordinates: [[[29, 41], [29.1, 41], [29.1, 41.1], [29, 41.1], [29, 41]]] },
    ...overrides,
  } as PopulationRecord
}

Deno.test('partitionPopulationRecords: all-valid batch has no rejections', () => {
  const result = partitionPopulationRecords([validRecord(), validRecord()], SERVED)
  assertEquals(result.validRecords.length, 2)
  assertEquals(result.rejectedRecords.length, 0)
})

Deno.test('partitionPopulationRecords: a batch of exclusively invalid records rejects all, throws nothing', () => {
  const records = [
    validRecord({ population: -5 }),
    validRecord({ countryCode: 'us' }), // not a served country
  ]
  const result = partitionPopulationRecords(records, SERVED)
  assertEquals(result.validRecords.length, 0)
  assertEquals(result.rejectedRecords.length, 2)
  assertEquals(result.rejectedRecords[0].reason, 'population must not be negative')
})

Deno.test('partitionPopulationRecords: mixed batch keeps only the valid records, with reasons for the rest', () => {
  const records = [validRecord(), validRecord({ population: -1 })]
  const result = partitionPopulationRecords(records, SERVED)
  assertEquals(result.validRecords.length, 1)
  assertEquals(result.rejectedRecords.length, 1)
})

Deno.test('partitionPopulationRecords: empty input returns empty partitions', () => {
  const result = partitionPopulationRecords([], SERVED)
  assertEquals(result.validRecords, [])
  assertEquals(result.rejectedRecords, [])
})
