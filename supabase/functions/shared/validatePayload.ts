/**
 * Shared payload validator for all Supabase Edge Functions.
 * Runs BEFORE normalize() — rejects malformed individual records without
 * discarding the rest of a batch (spec FR-010, FR-011).
 */

import type { DisasterType } from './normalize.ts'

export type ValidationResult =
  | { valid: true }
  | { valid: false; reason: string }

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function toNumber(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Validates a raw (pre-normalization) record for a given hazard type.
 * MUST NOT throw — always returns a discriminated result.
 */
export function validatePayload(raw: unknown, hazardType: DisasterType): ValidationResult {
  if (raw == null || typeof raw !== 'object') {
    return { valid: false, reason: 'record is not an object' }
  }

  const rec = raw as Record<string, unknown>

  if (rec.id == null || String(rec.id).trim() === '') {
    return { valid: false, reason: 'missing required field: id' }
  }

  const lat = toNumber(rec.lat)
  if (lat === null) {
    return { valid: false, reason: 'missing required field: lat' }
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, reason: `lat out of range: ${lat}` }
  }

  const lng = toNumber(rec.lng)
  if (lng === null) {
    return { valid: false, reason: 'missing required field: lng' }
  }
  if (lng < -180 || lng > 180) {
    return { valid: false, reason: `lng out of range: ${lng}` }
  }

  if (rec.time == null) {
    return { valid: false, reason: 'missing required field: time' }
  }
  const parsedTime = new Date(rec.time as string | number)
  if (Number.isNaN(parsedTime.getTime())) {
    return { valid: false, reason: `unresolvable timestamp: ${String(rec.time)}` }
  }

  // Numeric fields, when present, must be actual numbers (or numeric strings)
  if (rec.magnitude != null && !isFiniteNumber(toNumber(rec.magnitude))) {
    return { valid: false, reason: `magnitude is not numeric: ${String(rec.magnitude)}` }
  }
  if (rec.depth != null && !isFiniteNumber(toNumber(rec.depth))) {
    return { valid: false, reason: `depth is not numeric: ${String(rec.depth)}` }
  }

  // hazardType is accepted as a parameter for future per-type rule branching;
  // all current hazard types share the same base shape checks above.
  void hazardType

  return { valid: true }
}
