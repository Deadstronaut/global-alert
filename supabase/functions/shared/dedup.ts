/**
 * Shared spatial-temporal deduplication for fetch-* functions with more than
 * one upstream source for the same hazard type. Extracted from the pattern
 * already used in fetch-earthquakes/index.ts (feature 003-gdacs-source —
 * wildfire/flood/drought each gained a second source, GDACS, and previously
 * had no dedup step since they only ever had one source before).
 *
 * Distance thresholds match TECHNICAL.md §3's existing per-hazard-type table.
 */

import type { normalize } from './normalize.ts'

type Event = ReturnType<typeof normalize>

/**
 * `events` should already be ordered by source priority (most authoritative
 * first) — the first record seen for a given location/time cluster wins.
 */
export function deduplicateEvents(events: Event[], distanceKm: number, windowMinutes = 5): Event[] {
  const result: Event[] = []
  for (const ev of events) {
    const isDup = result.some((ex) => {
      const dLat = (ev.lat - ex.lat) * 111
      const dLng = (ev.lng - ex.lng) * 111
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng)
      const dtMs = Math.abs(new Date(ev.time).getTime() - new Date(ex.time).getTime())
      return distKm < distanceKm && dtMs < windowMinutes * 60_000
    })
    if (!isDup) result.push(ev)
  }
  return result
}
