/**
 * Edge Function: fetch-earthquakes
 * Sources: USGS (GeoJSON), EMSC (FDSN), AFAD, Kandilli
 * Writes to: earthquake table
 * Called by: pg_cron every 1 minute
 */

import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

// ── Source fetchers ────────────────────────────────────────────────────────────

async function fetchUSGS(): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`USGS HTTP ${res.status}`)
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
      felt: f.properties.felt,
      tsunami: f.properties.tsunami,
      status: f.properties.status,
      net: f.properties.net,
    },
  }))
}

async function fetchEMSC(): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://www.seismicportal.eu/fdsnws/event/1/query?limit=100&format=json&minmagnitude=2.5'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
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

async function fetchAFAD(): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://deprem.afad.gov.tr/apiv2/event/filter?limit=100&orderby=timedesc'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`AFAD HTTP ${res.status}`)
  const data = await res.json()
  return (data ?? []).map((e: any) => normalize({
    id:          `afad-${e.eventID}`,
    type:        'earthquake',
    lat:         parseFloat(e.latitude),
    lng:         parseFloat(e.longitude),
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

async function fetchKandilli(): Promise<ReturnType<typeof normalize>[]> {
  const url = 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live'
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Kandilli HTTP ${res.status}`)
  const data = await res.json()
  return (data.result ?? []).map((e: any) => normalize({
    id:          `kandilli-${e.earthquake_id ?? e.hash ?? `${e.lat}-${e.lng}-${e.date}`}`,
    type:        'earthquake',
    lat:         parseFloat(e.geojson?.coordinates?.[1] ?? e.lat),
    lng:         parseFloat(e.geojson?.coordinates?.[0] ?? e.lng),
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

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sources: Record<string, ReturnType<typeof normalize>[]> = {}
  const fetchErrors: string[] = []

  await Promise.allSettled([
    fetchUSGS().then(r => { sources.USGS = r }).catch(e => fetchErrors.push(`USGS: ${e.message}`)),
    fetchEMSC().then(r => { sources.EMSC = r }).catch(e => fetchErrors.push(`EMSC: ${e.message}`)),
    fetchAFAD().then(r => { sources.AFAD = r }).catch(e => fetchErrors.push(`AFAD: ${e.message}`)),
    fetchKandilli().then(r => { sources.Kandilli = r }).catch(e => fetchErrors.push(`Kandilli: ${e.message}`)),
  ])

  const all = Object.values(sources).flat()
  // Tier-1 sources first (USGS > EMSC > AFAD > Kandilli) so dedup keeps the authoritative record
  all.sort((a, b) => {
    const order = ['USGS', 'EMSC', 'AFAD', 'Kandilli']
    return order.indexOf(a.source) - order.indexOf(b.source)
  })
  const events = deduplicate(all)

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: {
      status: dbErrors.length === 0 ? 'ok' : 'partial',
      fetched: all.length,
      deduplicated: events.length,
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
