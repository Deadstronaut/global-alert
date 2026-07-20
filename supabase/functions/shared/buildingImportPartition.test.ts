import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { partitionBuildingRecords } from './buildingImportPartition.ts'
import type { BuildingRecord } from './buildingRecord.ts'

const SERVED = ['TR', 'MG']

function record(overrides: Partial<BuildingRecord> = {}): BuildingRecord {
  return {
    geometry: { type: 'Point', coordinates: [27.1, 38.5] },
    countryCode: 'TR',
    assetCategory: 'critical_infrastructure_health',
    properties: { facilityType: 'hospital', osmId: 1, osmType: 'node' },
    ...overrides,
  }
}

Deno.test('partitionBuildingRecords: all-valid batch returns no rejections', () => {
  const records = [record(), record({ properties: { facilityType: 'clinic', osmId: 2, osmType: 'node' } })]
  const { validRecords, rejectedRecords } = partitionBuildingRecords(records, SERVED)
  assertEquals(validRecords.length, 2)
  assertEquals(rejectedRecords.length, 0)
})

Deno.test('partitionBuildingRecords: mixed batch separates valid from invalid', () => {
  const records = [
    record(),
    record({ countryCode: 'FR' }),
    // deno-lint-ignore no-explicit-any
    record({ assetCategory: 'not_a_category' as any }),
  ]
  const { validRecords, rejectedRecords } = partitionBuildingRecords(records, SERVED)
  assertEquals(validRecords.length, 1)
  assertEquals(rejectedRecords.length, 2)
  assertEquals(typeof rejectedRecords[0].reason, 'string')
})

Deno.test('partitionBuildingRecords: all-invalid batch returns zero valid records without throwing', () => {
  const records = [record({ countryCode: 'FR' }), record({ countryCode: 'DE' })]
  const { validRecords, rejectedRecords } = partitionBuildingRecords(records, SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 2)
})

Deno.test('partitionBuildingRecords: empty batch returns empty results', () => {
  const { validRecords, rejectedRecords } = partitionBuildingRecords([], SERVED)
  assertEquals(validRecords.length, 0)
  assertEquals(rejectedRecords.length, 0)
})
