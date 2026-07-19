/**
 * Shared population-raster-record validator (spec 043 FR-008). Mirrors
 * validateRiverRecord.ts's convention exactly. The country-boundary
 * membership check itself already happened in rasterToHexagon.ts (a
 * hexagon outside the boundary never becomes a candidate record) — this
 * validator covers the record-shape contract only (data-model.md), not the
 * spatial contract.
 */

import type { PopulationRasterRecord } from './populationRasterRecord.ts'
import { geometryToWkt } from './geometryToWkt.ts'

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

export function validatePopulationRasterRecord(
  record: PopulationRasterRecord,
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

  if (typeof record.populationCount !== 'number' || !Number.isFinite(record.populationCount)) {
    return { valid: false, reason: 'populationCount must be a finite number' }
  }
  // Zero is a legitimate value (a hexagon that received at least one valid,
  // non-no-data pixel whose sum happened to be zero) — only negative
  // values are rejected.
  if (record.populationCount < 0) {
    return { valid: false, reason: 'populationCount must not be negative' }
  }

  if (!record.countryCode || !servedCountryCodes.includes(record.countryCode)) {
    return { valid: false, reason: `countryCode '${record.countryCode}' is not a served country` }
  }

  return { valid: true }
}
