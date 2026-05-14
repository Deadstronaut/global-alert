/**
 * Edge Function: backfill-earthquakes
 * Fetches historical earthquake data from USGS FDSNWS API and upserts into DB.
 *
 * POST body:
 *   { starttime: "2023-02-01", endtime: "2023-02-28", minmagnitude: 5.0, limit: 1000 }
 *
 * Example (Hatay depremi):
 *   { starttime: "2023-02-06", endtime: "2023-02-07", minmagnitude: 5.0 }
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

async function fetchUSGSHistorical(params: {
  starttime: string
  endtime: string
  minmagnitude?: number
  limit?: number
}): Promise<ReturnType<typeof normalize>[]> {
  const url = new URL('https://earthquake.usgs.gov/fdsnws/event/1/query')
  url.searchParams.set('format', 'geojson')
  url.searchParams.set('starttime', params.starttime)
  url.searchParams.set('endtime', params.endtime)
  url.searchParams.set('minmagnitude', String(params.minmagnitude ?? 5.0))
  url.searchParams.set('limit', String(Math.min(params.limit ?? 1000, 20000)))
  url.searchParams.set('orderby', 'time-asc')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}: ${await res.text()}`)
  const data = await res.json()

  return (data.features ?? []).map((f: any) => normalize({
    id:          `usgs-${f.id}`,
    type:        'earthquake',
    lat:         f.geometry.coordinates[1],
    lng:         f.geometry.coordinates[0],
    magnitude:   f.properties.mag,
    depth:       f.geometry.coordinates[2],
    title:       f.properties.title ?? f.properties.place,
    description: `M${f.properties.mag} — ${f.properties.place ?? ''} | Depth: ${f.geometry.coordinates[2]}km`,
    time:        f.properties.time,
    source:      'USGS',
    sourceUrl:   f.properties.url ?? 'https://earthquake.usgs.gov',
    extra: {
      felt:    f.properties.felt,
      tsunami: f.properties.tsunami,
      status:  f.properties.status,
      net:     f.properties.net,
    },
  }))
}

async function fetchEMSCHistorical(params: {
  starttime: string
  endtime: string
  minmagnitude?: number
  limit?: number
}): Promise<ReturnType<typeof normalize>[]> {
  const url = new URL('https://www.seismicportal.eu/fdsnws/event/1/query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('start', params.starttime)
  url.searchParams.set('end', params.endtime)
  url.searchParams.set('minmag', String(params.minmagnitude ?? 5.0))
  url.searchParams.set('limit', String(Math.min(params.limit ?? 1000, 5000)))
  url.searchParams.set('orderby', 'time-asc')

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`EMSC HTTP ${res.status}`)
  const data = await res.json()

  return (data.features ?? []).map((f: any) => {
    const p = f.properties
    return normalize({
      id:          `emsc-${p.source_id ?? f.id}`,
      type:        'earthquake',
      lat:         f.geometry.coordinates[1],
      lng:         f.geometry.coordinates[0],
      magnitude:   p.mag,
      depth:       f.geometry.coordinates[2],
      title:       `M${p.mag} — ${p.flynn_region ?? 'Unknown'}`,
      description: `M${p.mag} — ${p.flynn_region ?? ''} | Depth: ${f.geometry.coordinates[2]}km`,
      time:        p.time ?? p.lastupdate,
      source:      'EMSC',
      sourceUrl:   `https://www.emsc-csem.org/Earthquake/earthquake.php?id=${p.source_id ?? ''}`,
      extra: { region: p.flynn_region, auth: p.auth },
    })
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let body: any = {}
  try { body = await req.json() } catch { /* no body */ }

  const starttime: string = body.starttime
  const endtime: string   = body.endtime
  const minmagnitude: number = body.minmagnitude ?? 5.0
  const limit: number        = body.limit ?? 1000
  const sources: string[]    = body.sources ?? ['usgs', 'emsc']

  if (!starttime || !endtime) {
    return new Response(JSON.stringify({
      error: 'starttime ve endtime zorunlu. Örn: { "starttime": "2023-02-01", "endtime": "2023-02-28" }'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
  }

  const fetchErrors: string[] = []
  let events: ReturnType<typeof normalize>[] = []

  const fetchers: Promise<void>[] = []

  if (sources.includes('usgs')) {
    fetchers.push(
      fetchUSGSHistorical({ starttime, endtime, minmagnitude, limit })
        .then(r => { events.push(...r) })
        .catch(e => fetchErrors.push(`USGS: ${e.message}`))
    )
  }

  if (sources.includes('emsc')) {
    fetchers.push(
      fetchEMSCHistorical({ starttime, endtime, minmagnitude, limit })
        .then(r => { events.push(...r) })
        .catch(e => fetchErrors.push(`EMSC: ${e.message}`))
    )
  }

  await Promise.allSettled(fetchers)

  // Deduplicate by proximity (same as live fetcher)
  const deduped: typeof events = []
  for (const ev of events) {
    const isDup = deduped.some(ex => {
      const dLat = (ev.lat - ex.lat) * 111
      const dLng = (ev.lng - ex.lng) * 111
      const distKm = Math.sqrt(dLat * dLat + dLng * dLng)
      const dtMs   = Math.abs(new Date(ev.time).getTime() - new Date(ex.time).getTime())
      return distKm < 20 && dtMs < 5 * 60_000
    })
    if (!isDup) deduped.push(ev)
  }

  const { inserted, errors: dbErrors } = await upsertEvents(deduped)

  return new Response(JSON.stringify({
    meta: {
      status:    dbErrors.length === 0 ? 'ok' : 'partial',
      params:    { starttime, endtime, minmagnitude, limit, sources },
      fetched:   events.length,
      deduped:   deduped.length,
      inserted,
      fetchErrors,
      dbErrors,
    },
    data: deduped,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
