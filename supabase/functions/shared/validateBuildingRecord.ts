/**
 * Shared building-record validator, mirroring validateRoadRecord.ts's
 * convention exactly (spec 040) for the buildings import path (spec 044).
 * Runs BEFORE a record is written to exposure_features.
 */

import type { BuildingRecord } from './buildingRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

const VALID_CATEGORIES = new Set([
  'critical_infrastructure_health',
  'critical_infrastructure_education',
  'critical_infrastructure_emergency',
])

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateBuildingRecord(
  record: BuildingRecord,
  servedCountryCodes: string[],
): ValidationResult {
  if (record == null || typeof record !== 'object') {
    return { valid: false, reason: 'record is not an object' }
  }

  try {
    geometryToWkt(record.geometry)
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'invalid geometry'
    return { valid: false, reason }
  }

  if (!record.countryCode || !servedCountryCodes.includes(record.countryCode)) {
    return { valid: false, reason: `countryCode '${record.countryCode}' is not a served country` }
  }

  if (!record.assetCategory || !VALID_CATEGORIES.has(record.assetCategory)) {
    return { valid: false, reason: `assetCategory '${record.assetCategory}' is not a recognized critical-infrastructure category` }
  }

  if (!record.properties?.facilityType) {
    return { valid: false, reason: 'missing required field: properties.facilityType' }
  }

  return { valid: true }
}
