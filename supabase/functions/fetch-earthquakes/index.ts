/**
 * Edge Function: fetch-earthquakes
 * Sources: USGS (GeoJSON), EMSC (FDSN), AFAD, Kandilli
 * Writes to: earthquake table
 * Called by: pg_cron every 1 minute
 */

import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents, getServiceClient } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { fetchGdacsFeatures, toGdacsNormalized } from '../shared/gdacsFetch.ts'
import { gdacsSplit } from '../shared/gdacsSplit.ts'

// ── Source fetchers ────────────────────────────────────────────────────────────
// Each fetcher validates each raw record via validatePayload() before normalize();
// invalid records are logged to rejected_payloads and excluded from the batch
// (spec FR-010–FR-013 — partial-batch tolerance, malformed records never persisted).

async function fetchUSGS(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
  const data = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const f of data.features ?? []) {
    const raw = { id: `usgs-${f.id}`, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], time: f.properties.time, magnitude: f.properties.mag, depth: f.geometry.coordinates[2] }
    const validation = validatePayload(raw, 'earthquake')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'earthquake', validation.reason, f)
      continue
    }
    out.push(normalize({
      id:          raw.id,
      type:        'earthquake',
      lat:         raw.lat,
      lng:         raw.lng,
      magnitude:   f.properties.mag,
      depth:       f.geometry.coordinates[2],
      title:       f.properties.title ?? f.properties.place,
      description: `M${f.properties.mag} — ${f.properties.place ?? ''} | Depth: ${f.geometry.coordinates[2]}km`,
      time:        f.properties.time,
      source:      'USGS',
      sourceUrl:   f.properties.url ?? 'https://earthquake.usgs.gov',
      extra: {
        felt: f.properties.felt,
        tsunami: f.properties.tsunami,
        status: f.properties.status,
        net: f.properties.net,
      },
    }))
  }
  return out
}

async function fetchEMSC(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://www.seismicportal.eu/fdsnws/event/1/query?limit=100&format=json&minmagnitude=2.5'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`EMSC HTTP ${res.status}`)
  const data = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const f of data.features ?? []) {
    const p = f.properties
    const raw = { id: `emsc-${p.source_id ?? f.id}`, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], time: p.time ?? p.lastupdate, magnitude: p.mag, depth: f.geometry.coordinates[2] }
    const validation = validatePayload(raw, 'earthquake')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'earthquake', validation.reason, f)
      continue
    }
    out.push(normalize({
      id:          raw.id,
      type:        'earthquake',
      lat:         raw.lat,
      lng:         raw.lng,
      magnitude:   p.mag,
      depth:       f.geometry.coordinates[2],
      title:       `M${p.mag} — ${p.flynn_region ?? 'Unknown'}`,
      description: `M${p.mag} — ${p.flynn_region ?? ''} | Depth: ${f.geometry.coordinates[2]}km`,
      time:        p.time ?? p.lastupdate,
      source:      'EMSC',
      sourceUrl:   `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${p.source_id ?? ''}`,
      extra: { region: p.flynn_region, auth: p.auth },
    }))
  }
  return out
}

async function fetchAFAD(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://deprem.afad.gov.tr/apiv2/event/filter?limit=100&orderby=timedesc'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`AFAD HTTP ${res.status}`)
  const data = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const e of data ?? []) {
    const raw = { id: `afad-${e.eventID}`, lat: parseFloat(e.latitude), lng: parseFloat(e.longitude), time: e.eventDate, magnitude: parseFloat(e.magnitude), depth: parseFloat(e.depth ?? '0') }
    const validation = validatePayload(raw, 'earthquake')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'earthquake', validation.reason, e)
      continue
    }
    out.push(normalize({
      id:          raw.id,
      type:        'earthquake',
      lat:         raw.lat,
      lng:         raw.lng,
      magnitude:   parseFloat(e.magnitude),
      depth:       parseFloat(e.depth ?? '0'),
      title:       `M${e.magnitude} — ${e.location}`,
      description: `${e.location} | AFAD`,
      time:        e.eventDate,
      source:      'AFAD',
      sourceUrl:   'https://deprem.afad.gov.tr',
      extra: { location: e.location, type: e.type },
    }))
  }
  return out
}

async function fetchKandilli(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Kandilli HTTP ${res.status}`)
  const data = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const e of data.result ?? []) {
    const raw = {
      id: `kandilli-${e.earthquake_id ?? e.hash ?? `${e.lat}-${e.lng}-${e.date}`}`,
      lat: parseFloat(e.geojson?.coordinates?.[1] ?? e.lat),
      lng: parseFloat(e.geojson?.coordinates?.[0] ?? e.lng),
      time: e.date,
      magnitude: e.mag,
      depth: e.depth,
    }
    const validation = validatePayload(raw, 'earthquake')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'earthquake', validation.reason, e)
      continue
    }
    out.push(normalize({
      id:          raw.id,
      type:        'earthquake',
      lat:         raw.lat,
      lng:         raw.lng,
      magnitude:   e.mag,
      depth:       e.depth,
      title:       e.title ?? `M${e.mag} — ${e.location_properties?.closestCity?.name ?? ''}`,
      description: `${e.location_properties?.closestCity?.name ?? e.title} | Kandilli`,
      time:        e.date,
      source:      'Kandilli',
      sourceUrl:   'http://www.koeri.boun.edu.tr/sismo/2/latest-earthquakes/',
      extra: { location: e.title, closestCity: e.location_properties?.closestCity },
    }))
  }
  return out
}

// GDACS (feature 003-gdacs-source) covers 4 hazard types from one endpoint; this
// is its earthquake contribution. Logs GDACS's out-of-scope categories (TC, VO)
// here only — fetch-wildfires/fetch-floods/fetch-droughts also pull GDACS but
// skip re-logging the same dropped categories to avoid 4x-redundant log noise.
async function fetchGDACS(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const features = await fetchGdacsFeatures()
  const split = gdacsSplit(features)
  for (const d of split.dropped) {
    console.log(`[fetch-earthquakes] GDACS dropped out-of-scope record: ${d.reason}`)
  }
  return toGdacsNormalized('earthquake', split.earthquake, sourceId)
}

// ── Spatial-temporal deduplication ────────────────────────────────────────────

function deduplicate(events: ReturnType<typeof normalize>[]) {
  const result: typeof events = []
  for (const ev of events) {
    const isDup = result.some(ex => {
      const dLat = (ev.lat - ex.lat) * 111
      const dLng = (ev.lng - ex.lng) * 111
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng)
      const dtMs   = Math.abs(new Date(ev.time).getTime() - new Date(ex.time).getTime())
      return distKm < 20 && dtMs < 5 * 60_000
    })
    if (!isDup) result.push(ev)
  }
  return result
}

// ── Cross-process dedup against the live table ────────────────────────────────
// deduplicate() above only compares events within THIS invocation's own batch —
// it has no idea what server/'s separately-running aggregator (EMSC/USGS/AFAD/
// Kandilli/GEOFON, moved there 2026-07-22 for sub-minute latency + P-wave) has
// already written to `earthquake` moments ago from its own process. GDACS is the
// one source staying in this Edge Function alongside those five now-external
// sources, so its events are the ones that can arrive "late" relative to
// server/'s faster path and land as an avoidable duplicate row. Tolerances match
// server/src/processors/deduplicator.js's earthquake constants (25km/5min)
// exactly, so "is this a duplicate" means the same thing on both sides — plus a
// magnitude tolerance here since two independently-reported magnitudes for the
// same physical event are rarely bit-identical.
const CROSS_PROCESS_RADIUS_KM = 25
const CROSS_PROCESS_TIME_MS = 5 * 60_000
const CROSS_PROCESS_MAG_TOLERANCE = 0.3

async function filterAgainstLiveEarthquakes(
  events: ReturnType<typeof normalize>[],
): Promise<ReturnType<typeof normalize>[]> {
  if (events.length === 0) return events
  const supabase = getServiceClient()
  const sinceIso = new Date(Date.now() - CROSS_PROCESS_TIME_MS).toISOString()
  const { data: recent, error } = await supabase
    .from('earthquake')
    .select('lat, lng, time, magnitude')
    .gte('time', sinceIso)
  if (error || !recent) {
    // Fail open (keep the events) — a dedup-check failure must not silently
    // drop real earthquake data; a rare duplicate row is far cheaper than a
    // missed one.
    console.warn(`[fetch-earthquakes] Live dedup check failed, proceeding without it: ${error?.message}`)
    return events
  }

  return events.filter((ev) => {
    const isDup = recent.some((ex) => {
      if (ex.magnitude != null && Math.abs(ev.magnitude! - ex.magnitude) > CROSS_PROCESS_MAG_TOLERANCE) return false
      const dLat = (ev.lat - ex.lat) * 111
      const dLng = (ev.lng - ex.lng) * 111
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng)
      const dtMs = Math.abs(new Date(ev.time).getTime() - new Date(ex.time).getTime())
      return distKm < CROSS_PROCESS_RADIUS_KM && dtMs < CROSS_PROCESS_TIME_MS
    })
    return !isDup
  })
}

// ── Health tracking (feature 001-data-ingestion-monitoring) ───────────────────
// Each upstream fetcher is tracked against its data_sources row (looked up by
// hazard_type + name). Sources not yet registered in data_sources resolve to
// null and are skipped gracefully (resolveSourceId/recordFetchOutcome never throw).
// A source with is_active = false is skipped entirely (spec FR-006, FR-016).
async function trackedFetch(
  name: string,
  fetcher: (sourceId: string | null) => Promise<ReturnType<typeof normalize>[]>,
): Promise<{ name: string; events: ReturnType<typeof normalize>[]; error?: string; skipped?: boolean }> {
  const sourceId = await resolveSourceId('earthquake', name)
  if (!(await isSourceActive(sourceId))) {
    return { name, events: [], skipped: true }
  }
  try {
    const events = await fetcher(sourceId)
    if (sourceId) await recordFetchOutcome(sourceId, 'success')
    return { name, events }
  } catch (e) {
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', e.message)
    return { name, events: [], error: e.message }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sources: Record<string, ReturnType<typeof normalize>[]> = {}
  const fetchErrors: string[] = []

  // CUTOVER-2026-07-22: USGS/EMSC/AFAD/Kandilli moved to the always-on
  // server/ aggregator (see docker-compose.yml's `aggregator` service) —
  // it polls each at 15-20s (pg_cron's syntax floor is 1 minute, so this
  // Edge Function could never match that latency) and holds EMSC's
  // WebSocket open (structurally impossible for a stateless Edge
  // Function). This can't be flipped via data_sources.is_active — that
  // row is shared with server/'s own configuredSources.js poll-list
  // check, so disabling it here would ALSO stop server/'s polling.
  // Rollback: uncomment these four lines and redeploy (no DB change
  // needed) — cheap and fast, matches server/index.js's own
  // comment-not-delete precedent for the mirror-image cutover.
  //
  // trackedFetch('USGS', fetchUSGS),
  // trackedFetch('EMSC', fetchEMSC),
  // trackedFetch('AFAD', fetchAFAD),
  // trackedFetch('Kandilli', fetchKandilli),
  //
  // CUTOVER-2026-07-22 (same day, revised decision): GDACS also moved to
  // server-only — it was already running there unavoidably (registered in
  // configuredSources.js's SOURCE_REGISTRY), so keeping this Edge Function
  // path alive was pure duplication, not genuine redundancy. Its
  // fetch-gdacs-earthquakes pg_cron job (added earlier today) was
  // unscheduled the same day this comment was added.
  // trackedFetch('GDACS', fetchGDACS),
  const results = await Promise.all<{ name: string; events: ReturnType<typeof normalize>[]; error?: string; skipped?: boolean }>([])
  for (const r of results) {
    sources[r.name] = r.events
    if (r.error) fetchErrors.push(`${r.name}: ${r.error}`)
  }

  const all = Object.values(sources).flat()
  // Tier-1 sources first (USGS > EMSC > AFAD > Kandilli > GDACS) so dedup keeps the
  // authoritative record — GDACS is a supplementary/secondary source layered on top
  // of these dedicated feeds (research.md §5), so it yields to all of them on conflict.
  all.sort((a, b) => {
    const order = ['USGS', 'EMSC', 'AFAD', 'Kandilli', 'GDACS']
    return order.indexOf(a.source) - order.indexOf(b.source)
  })
  const batchDeduped = deduplicate(all)
  const events = await filterAgainstLiveEarthquakes(batchDeduped)

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: {
      status: dbErrors.length === 0 ? 'ok' : 'partial',
      fetched: all.length,
      deduplicated: events.length,
      crossProcessDuplicatesSkipped: batchDeduped.length - events.length,
      inserted,
      fetchErrors,
      dbErrors,
    },
    data: events,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
