/**
 * Shared basin-record validator (spec 041 FR-007). Mirrors
 * validatePopulationRecord.ts's polygon-geometry convention.
 */

import type { BasinRecord } from './basinRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateBasinRecord(
  record: BasinRecord,
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

  if (typeof record.areaKm2 !== 'number' || !Number.isFinite(record.areaKm2)) {
    return { valid: false, reason: 'areaKm2 must be a finite number' }
  }
  if (record.areaKm2 <= 0) {
    return { valid: false, reason: 'areaKm2 must be greater than zero' }
  }

  if (!record.countryCode || !servedCountryCodes.includes(record.countryCode)) {
    return { valid: false, reason: `countryCode '${record.countryCode}' is not a served country` }
  }

  return { valid: true }
}
