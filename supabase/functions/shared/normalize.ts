/**
 * Shared normalizer for all Supabase Edge Functions.
 * Mirrors server/src/processors/normalizer.js — keep in sync.
 */

import { getCachedBreakpoints, type Breakpoint } from './hazardThresholdsCache.ts'

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'minimal'

export type DisasterType =
  | 'earthquake' | 'wildfire' | 'flood' | 'drought'
  | 'food_security' | 'tsunami' | 'cyclone' | 'volcano'
  | 'epidemic' | 'disaster'

export interface NormalizedEvent {
  id: string
  type: DisasterType
  lat: number
  lng: number
  severity: Severity
  magnitude: number | null
  depth: number | null
  title: string
  description: string
  time: string          // ISO 8601 UTC
  source: string
  source_url: string
  extra: Record<string, unknown>
  received_at: string   // ISO 8601 UTC
}

function eqSeverity(mag: number): Severity {
  if (mag >= 7.0) return 'critical'
  if (mag >= 5.5) return 'high'
  if (mag >= 4.0) return 'moderate'
  if (mag >= 2.5) return 'low'
  return 'minimal'
}

function fireSeverity(frp: number): Severity {
  if (frp >= 500) return 'critical'
  if (frp >= 200) return 'high'
  if (frp >= 50)  return 'moderate'
  if (frp >= 10)  return 'low'
  return 'minimal'
}

function floodSeverity(level: number): Severity {
  if (level >= 4) return 'critical'
  if (level >= 3) return 'high'
  if (level >= 2) return 'moderate'
  if (level >= 1) return 'low'
  return 'minimal'
}

function foodSeverity(phase: number): Severity {
  if (phase >= 5) return 'critical'
  if (phase >= 4) return 'high'
  if (phase >= 3) return 'moderate'
  if (phase >= 2) return 'low'
  return 'minimal'
}

// Pure evaluation of an ordered (ascending min_value) breakpoints array
// against a numeric value — a TS port of src/stores/hazardTypes.js's
// evaluateBreakpoints() (spec 016). Exported so normalize.test.ts can test
// it directly.
export function evaluateBreakpoints(breakpoints: Breakpoint[], value: number): Severity {
  if (!Array.isArray(breakpoints) || breakpoints.length === 0) return 'low'
  let result: Severity = 'low'
  for (const bp of breakpoints) {
    if (value >= bp.min_value) result = bp.severity as Severity
    else break
  }
  return result
}

const SEVERITY_FN: Record<string, (v: number) => Severity> = {
  earthquake:    eqSeverity,
  wildfire:      fireSeverity,
  flood:         floodSeverity,
  drought:       floodSeverity,
  food_security: foodSeverity,
  tsunami:       () => 'critical',
  cyclone:       (v) => v >= 4 ? 'critical' : v >= 3 ? 'high' : 'moderate',
  volcano:       () => 'high',
  epidemic:      () => 'high',
  disaster:      () => 'moderate',
}

export function normalize(params: {
  id: string
  type: DisasterType
  lat: number
  lng: number
  magnitude?: number | null
  depth?: number | null
  title?: string
  description?: string
  time?: string | number | null
  source: string
  sourceUrl?: string
  extra?: Record<string, unknown>
}): NormalizedEvent {
  const mag = params.magnitude ?? 0
  const severityFn = SEVERITY_FN[params.type] ?? (() => 'low' as Severity)
  const customBreakpoints = getCachedBreakpoints(params.type)
  const severity = customBreakpoints ? evaluateBreakpoints(customBreakpoints, mag) : severityFn(mag)

  return {
    id:           String(params.id),
    type:         params.type,
    lat:          Number(params.lat),
    lng:          Number(params.lng),
    severity,
    magnitude:    params.magnitude != null ? Number(params.magnitude) : null,
    depth:        params.depth != null ? Number(params.depth) : null,
    title:        String(params.title ?? '').slice(0, 200),
    description:  String(params.description ?? '').slice(0, 500),
    time:         params.time ? new Date(params.time).toISOString() : new Date().toISOString(),
    source:       String(params.source),
    source_url:   String(params.sourceUrl ?? ''),
    extra:        params.extra ?? {},
    received_at:  new Date().toISOString(),
  }
}
