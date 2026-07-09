/**
 * Shared population-record validator (spec 038 FR-004). Runs BEFORE a
 * record is written to exposure_features — rejects malformed individual
 * records without discarding the rest of a batch, matching this codebase's
 * existing validatePayload.ts convention for hazard events.
 */

import type { PopulationRecord } from './populationRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Validates a PopulationRecord before storage. MUST NOT throw — always
 * returns a discriminated result.
 */
export function validatePopulationRecord(
  record: PopulationRecord,
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

  if (typeof record.population !== 'number' || !Number.isFinite(record.population)) {
    return { valid: false, reason: 'population must be a finite number' }
  }
  if (record.population < 0) {
    return { valid: false, reason: 'population must not be negative' }
  }

  if (!record.countryCode || !servedCountryCodes.includes(record.countryCode)) {
    return { valid: false, reason: `countryCode '${record.countryCode}' is not a served country` }
  }

  return { valid: true }
}
