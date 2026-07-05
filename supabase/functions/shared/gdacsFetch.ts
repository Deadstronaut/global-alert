/**
 * Shared GDACS HTTP fetch, consumed by fetch-earthquakes/fetch-wildfires/
 * fetch-floods/fetch-droughts (feature 003-gdacs-source).
 *
 * GDACS covers 4 of this app's hazard types from one endpoint. Rather than a
 * standalone fetch-gdacs function (which would fetch GDACS in isolation from
 * every other source and defeat this app's existing per-hazard-type in-memory
 * deduplication), each of the 4 existing single-hazard fetch-* functions calls
 * this helper independently and folds GDACS's contribution into its own
 * existing multi-source batch before deduplicating — same pattern as any other
 * additional source for that hazard type.
 */

import type { GdacsFeature, GdacsRawRecord } from './gdacsSplit.ts'
import { normalize, type DisasterType } from './normalize.ts'
import { validatePayload } from './validatePayload.ts'
import { logRejectedPayload } from './sourceHealth.ts'

const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF'

export async function fetchGdacsFeatures(): Promise<GdacsFeature[]> {
  const res = await fetch(GDACS_URL, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`GDACS HTTP ${res.status}`)
  const data = await res.json()
  return (data?.features ?? []) as GdacsFeature[]
}

/**
 * Validates + normalizes one hazard type's bucket of GDACS records (already
 * routed by gdacsSplit()) into this app's shared NormalizedEvent shape —
 * identical validation/rejection handling as any other source's fetcher.
 */
export function toGdacsNormalized(
  hazardType: DisasterType,
  records: GdacsRawRecord[],
  sourceId: string | null,
): ReturnType<typeof normalize>[] {
  const out: ReturnType<typeof normalize>[] = []
  for (const r of records) {
    const raw = { id: r.id, lat: r.lat, lng: r.lng, time: r.time, magnitude: r.magnitude }
    const validation = validatePayload(raw, hazardType)
    if (!validation.valid) {
      logRejectedPayload(sourceId, hazardType, validation.reason, r.raw)
      continue
    }
    out.push(normalize({
      id: r.id,
      type: hazardType,
      lat: r.lat,
      lng: r.lng,
      magnitude: r.magnitude,
      title: r.title,
      description: r.description,
      time: r.time,
      source: 'GDACS',
      sourceUrl: 'https://www.gdacs.org',
      extra: { eventtype: hazardType },
    }))
  }
  return out
}
