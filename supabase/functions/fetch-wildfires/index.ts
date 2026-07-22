/**
 * Edge Function: fetch-wildfires
 * Sources: NASA FIRMS (VIIRS S-NPP)
 * Writes to: wildfire table
 * Called by: pg_cron every 15 minutes
 */

import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { fetchGdacsFeatures, toGdacsNormalized } from '../shared/gdacsFetch.ts'
import { gdacsSplit } from '../shared/gdacsSplit.ts'
import { deduplicateEvents } from '../shared/dedup.ts'

// Live-verified 2026-07-22: /api/area/json/ (the format this used before)
// returns NASA Earthdata's HTML login/redirect page instead of JSON for
// this MAP_KEY — HTTP 200 with an HTML body, or occasionally a bare 400,
// neither actually parseable. /api/area/csv/ works with the exact same
// key (confirmed via direct curl and inside server/'s container), matching
// server/src/sources/nasaFirms.js's already-proven approach — switched to
// match rather than debug the JSON endpoint's access requirements further.
async function fetchFIRMS(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const key = Deno.env.get('NASA_FIRMS_KEY')
  if (!key) throw new Error('NASA_FIRMS_KEY not set')

  // world/1 (last 1 day): live-verified 2026-07-22 that this can return
  // zero rows at a given instant (NASA's NRT pipeline has processing lag),
  // which is expected/normal for a polled "what's new" feed, not a bug —
  // world/2 has reliably more data but its ~147k-row CSV live-verified to
  // trip this Edge Function's WORKER_RESOURCE_LIMIT (same memory ceiling
  // as GHSL/GDO SPI's raster imports). Kept at world/1 here specifically
  // because of that constraint; server/'s copy (no such ceiling) uses
  // world/2 instead.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/1`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`NASA FIRMS HTTP ${res.status}`)
  const text = await res.text()
  const lines = text.split('\n').filter((l) => l.trim())
  const header = (lines.shift() ?? '').split(',').map((h) => h.trim())
  // latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
  const idx = (name: string) => header.indexOf(name)

  const out: ReturnType<typeof normalize>[] = []
  for (const [i, line] of lines.entries()) {
    const cols = line.split(',')
    const r = {
      latitude: cols[idx('latitude')],
      longitude: cols[idx('longitude')],
      acq_date: cols[idx('acq_date')],
      acq_time: cols[idx('acq_time')],
      satellite: cols[idx('satellite')],
      instrument: cols[idx('instrument')],
      confidence: cols[idx('confidence')],
      bright_ti4: cols[idx('bright_ti4')],
      frp: cols[idx('frp')],
      daynight: cols[idx('daynight')],
    }
    if (!r.latitude || !r.longitude) continue
    // Low confidence = high false-positive rate, same convention as server/'s adapter.
    if (r.confidence?.trim().toLowerCase() === 'l') continue

    const time = `${r.acq_date}T${String(r.acq_time ?? '0000').padStart(4, '0').replace(/(\d{2})(\d{2})/, '$1:$2')}:00Z`
    const raw = { id: `firms-${r.acq_date}-${r.acq_time}-${r.latitude}-${r.longitude}-${i}`, lat: parseFloat(r.latitude), lng: parseFloat(r.longitude), time, magnitude: r.frp ? parseFloat(r.frp) : null }
    const validation = validatePayload(raw, 'wildfire')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'wildfire', validation.reason, r)
      continue
    }
    out.push(normalize({
      id:          raw.id,
      type:        'wildfire',
      lat:         raw.lat,
      lng:         raw.lng,
      magnitude:   r.frp ? parseFloat(r.frp) : null,
      title:       `Active Fire — ${r.daynight === 'D' ? 'Daytime' : 'Nighttime'} (${r.instrument ?? 'VIIRS'})`,
      description: `FRP: ${r.frp ?? 'N/A'} MW | Confidence: ${r.confidence ?? 'N/A'} | Sat: ${r.satellite ?? 'N/A'}`,
      time,
      source:      `NASA FIRMS (${r.instrument ?? 'VIIRS'})`,
      sourceUrl:   'https://firms.modaps.eosdis.nasa.gov/',
      extra: {
        brightness: r.bright_ti4,
        frp: r.frp,
        confidence: r.confidence,
        instrument: r.instrument,
        satellite: r.satellite,
        daynight: r.daynight,
      },
    }))
  }
  return out
}

// GDACS (feature 003-gdacs-source) covers 4 hazard types from one endpoint; this
// is its wildfire contribution. Dropped out-of-scope categories (TC, VO) are not
// re-logged here — fetch-earthquakes already logs them once per poll cycle.
async function fetchGDACS(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const features = await fetchGdacsFeatures()
  const split = gdacsSplit(features)
  return toGdacsNormalized('wildfire', split.wildfire, sourceId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const fetchErrors: string[] = []
  const sources: Record<string, ReturnType<typeof normalize>[]> = {}

  const firmsId = await resolveSourceId('wildfire', 'NASA FIRMS')

  // CUTOVER-2026-07-22: GDACS's wildfire slice moved to server/ (already
  // dispatched there via configuredSources.js's gdacs_rest registry entry).
  // NASA FIRMS deliberately NOT moved — live-tested moving it: server/'s
  // Docker container gets ETIMEDOUT connecting to
  // firms.modaps.eosdis.nasa.gov specifically (DNS resolves fine, TCP
  // connect hangs) while the exact same request works instantly from the
  // host machine and from this Edge Function today — a Docker-networking-
  // level issue on this dev machine, not a code bug, but not something to
  // risk breaking the one currently-working wildfire path over. Revisit
  // once this can be tested on a real deployment VM.
  await Promise.allSettled([
    (async () => {
      if (!(await isSourceActive(firmsId))) return
      try {
        sources['NASA FIRMS'] = await fetchFIRMS(firmsId)
        if (firmsId) await recordFetchOutcome(firmsId, 'success')
      } catch (e) {
        fetchErrors.push(`NASA FIRMS: ${e.message}`)
        if (firmsId) await recordFetchOutcome(firmsId, 'failure', e.message)
      }
    })(),
    // GDACS wildfire (server-only now):
    // const gdacsId = await resolveSourceId('wildfire', 'GDACS')
    // (async () => {
    //   if (!(await isSourceActive(gdacsId))) return
    //   try {
    //     sources['GDACS'] = await fetchGDACS(gdacsId)
    //     if (gdacsId) await recordFetchOutcome(gdacsId, 'success')
    //   } catch (e) {
    //     fetchErrors.push(`GDACS: ${e.message}`)
    //     if (gdacsId) await recordFetchOutcome(gdacsId, 'failure', e.message)
    //   }
    // })(),
  ])

  // NASA FIRMS (dedicated satellite feed) is authoritative over GDACS (secondary,
  // supplementary source) on conflict — same source-priority convention as
  // fetch-earthquakes (research.md §5).
  const all = [...(sources['NASA FIRMS'] ?? []), ...(sources['GDACS'] ?? [])]
  const events = deduplicateEvents(all, 5) // 5km threshold per TECHNICAL.md §3

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
