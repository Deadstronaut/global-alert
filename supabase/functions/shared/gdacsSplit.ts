/**
 * Splits a raw GDACS GeoJSON FeatureCollection into per-hazard-type buckets.
 * Feature: 003-gdacs-source
 *
 * GDACS is the first source in this app that reports more than one hazard type
 * from a single endpoint (EQ/TC/FL/VO/DR/WF in one feed). Only EQ, WF, FL, DR map
 * onto this app's existing hazard_type set; TC and VO have no corresponding type
 * (Constitution Principle I — adding them is a separate, explicit decision, not a
 * side effect of wiring up this one source) and are routed to `dropped` instead.
 */

export interface GdacsFeature {
  geometry?: { coordinates?: [number, number, ...number[]] }
  properties?: {
    eventtype?: string
    eventid?: number | string
    name?: string
    alertlevel?: string
    country?: string
    fromdate?: string
    severitydata?: { severity?: number; severitytext?: string }
  }
}

export interface GdacsRawRecord {
  id: string
  lat: number
  lng: number
  time: string
  magnitude: number | null
  title: string
  description: string
  raw: GdacsFeature
}

const EVENTTYPE_TO_HAZARD: Record<string, 'earthquake' | 'wildfire' | 'flood' | 'drought'> = {
  EQ: 'earthquake',
  WF: 'wildfire',
  FL: 'flood',
  DR: 'drought',
}

function toRawRecord(f: GdacsFeature): GdacsRawRecord {
  const p = f.properties ?? {}
  const coords = f.geometry?.coordinates
  const lng = coords?.[0] ?? NaN
  const lat = coords?.[1] ?? NaN
  return {
    id: `gdacs-${p.eventtype ?? 'unknown'}-${p.eventid ?? `${lat}-${lng}-${p.fromdate}`}`,
    lat,
    lng,
    time: p.fromdate ?? '',
    magnitude: p.severitydata?.severity ?? null,
    title: p.name ?? `GDACS ${p.eventtype ?? 'event'}`,
    description: `${p.severitydata?.severitytext ?? ''} | ${p.country ?? ''} | Alert: ${p.alertlevel ?? 'N/A'}`.trim(),
    raw: f,
  }
}

export interface GdacsSplitResult {
  earthquake: GdacsRawRecord[]
  wildfire: GdacsRawRecord[]
  flood: GdacsRawRecord[]
  drought: GdacsRawRecord[]
  dropped: { eventtype: string; reason: string; raw: unknown }[]
}

/**
 * Pure — no I/O, does not mutate `features`, never throws.
 */
export function gdacsSplit(features: GdacsFeature[] | null | undefined): GdacsSplitResult {
  const result: GdacsSplitResult = {
    earthquake: [],
    wildfire: [],
    flood: [],
    drought: [],
    dropped: [],
  }

  for (const f of features ?? []) {
    const eventtype = f.properties?.eventtype ?? ''
    const hazardType = EVENTTYPE_TO_HAZARD[eventtype]
    if (!hazardType) {
      result.dropped.push({
        eventtype: eventtype || '(missing)',
        reason: `unsupported GDACS eventtype: ${eventtype || '(missing)'}`,
        raw: f,
      })
      continue
    }
    result[hazardType].push(toRawRecord(f))
  }

  return result
}
