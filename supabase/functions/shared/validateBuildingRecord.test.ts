import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateBuildingRecord } from './validateBuildingRecord.ts'
import type { BuildingRecord } from './buildingRecord.ts'

const SERVED = ['TR', 'MG']

function validRecord(overrides: Partial<BuildingRecord> = {}): BuildingRecord {
  return {
    geometry: { type: 'Polygon', coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.5]]] },
    countryCode: 'TR',
    assetCategory: 'critical_infrastructure_health',
    properties: { facilityType: 'hospital', osmId: 12345, osmType: 'way' },
    ...overrides,
  }
}

Deno.test('validateBuildingRecord: valid record passes', () => {
  const result = validateBuildingRecord(validRecord(), SERVED)
  assertEquals(result, { valid: true })
})

Deno.test('validateBuildingRecord: Point geometry (bare node) is accepted', () => {
  const result = validateBuildingRecord(
    validRecord({ geometry: { type: 'Point', coordinates: [27.1, 38.5] } }),
    SERVED,
  )
  assertEquals(result, { valid: true })
})

Deno.test('validateBuildingRecord: invalid/empty geometry is rejected', () => {
  const result = validateBuildingRecord(
    validRecord({ geometry: { type: 'Polygon', coordinates: [] } }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateBuildingRecord: out-of-coverage country code is rejected', () => {
  const result = validateBuildingRecord(validRecord({ countryCode: 'FR' }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateBuildingRecord: unrecognized assetCategory is rejected', () => {
  // deno-lint-ignore no-explicit-any
  const result = validateBuildingRecord(validRecord({ assetCategory: 'not_a_category' as any }), SERVED)
  assertEquals(result.valid, false)
})

Deno.test('validateBuildingRecord: missing facilityType is rejected', () => {
  const result = validateBuildingRecord(
    // deno-lint-ignore no-explicit-any
    validRecord({ properties: { osmId: 1, osmType: 'way' } as any }),
    SERVED,
  )
  assertEquals(result.valid, false)
})

Deno.test('validateBuildingRecord: education category is accepted', () => {
  const result = validateBuildingRecord(
    validRecord({ assetCategory: 'critical_infrastructure_education', properties: { facilityType: 'school', osmId: 2, osmType: 'way' } }),
    SERVED,
  )
  assertEquals(result, { valid: true })
})

Deno.test('validateBuildingRecord: emergency category is accepted', () => {
  const result = validateBuildingRecord(
    validRecord({ assetCategory: 'critical_infrastructure_emergency', properties: { facilityType: 'police', osmId: 3, osmType: 'node' } }),
    SERVED,
  )
  assertEquals(result, { valid: true })
})
