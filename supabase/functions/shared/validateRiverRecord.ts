/**
 * Shared river-record validator (spec 041 FR-007). Mirrors
 * validateRoadRecord.ts's convention exactly. No classification-scope
 * restriction (unlike roads' highway filter) — every clipped river reach is
 * in-scope.
 */

import type { RiverRecord } from './riverRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validateRiverRecord(
  record: RiverRecord,
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

  if (typeof record.lengthMeters !== 'number' || !Number.isFinite(record.lengthMeters)) {
    return { valid: false, reason: 'lengthMeters must be a finite number' }
  }
  if (record.lengthMeters <= 0) {
    return { valid: false, reason: 'lengthMeters must be greater than zero' }
  }

  if (!record.countryCode || !servedCountryCodes.includes(record.countryCode)) {
    return { valid: false, reason: `countryCode '${record.countryCode}' is not a served country` }
  }

  return { valid: true }
}
