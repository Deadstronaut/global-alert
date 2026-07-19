/**
 * Shared road-record validator (spec 040 FR-005). Runs BEFORE a record is
 * written to exposure_features — rejects malformed individual records
 * without discarding the rest of a batch, mirroring
 * validatePopulationRecord.ts's convention exactly (spec 038).
 */

import type { RoadRecord } from './roadRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

// MVP-scoped road hierarchy — widened 2026-07-19 to motorway|trunk|primary
// (Madagascar has zero motorway-tagged OSM ways; see osmRoadsFetch.ts's
// HIGHWAY_FILTER for the full history/trade-off). Kept in sync with that
// constant.
const IMPORTED_HIGHWAY_VALUES = new Set(['motorway', 'trunk', 'primary'])

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

/**
 * Validates a RoadRecord before storage. MUST NOT throw — always returns a
 * discriminated result.
 */
export function validateRoadRecord(
  record: RoadRecord,
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

  const highway = record.properties?.highway
  if (!highway || !IMPORTED_HIGHWAY_VALUES.has(highway)) {
    return { valid: false, reason: `highway value '${highway}' is not an imported road classification` }
  }

  return { valid: true }
}
