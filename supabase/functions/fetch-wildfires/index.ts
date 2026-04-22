/**
 * Edge Function: fetch-wildfires
 * Sources: NASA FIRMS (VIIRS S-NPP)
 * Writes to: wildfire table
 * Called by: pg_cron every 15 minutes
 */

import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

async function fetchFIRMS(): Promise<ReturnType<typeof normalize>[]> {
  const key = Deno.env.get('NASA_FIRMS_KEY')
  if (!key) throw new Error('NASA_FIRMS_KEY not set')

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/json/${key}/VIIRS_SNPP_NRT/world/1`
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`NASA FIRMS HTTP ${res.status}`)
  const records: any[] = await res.json()

  return records.map((r, i) => normalize({
    id:          `firms-${r.acq_date}-${r.latitude}-${r.longitude}-${i}`,
    type:        'wildfire',
    lat:         parseFloat(r.latitude),
    lng:         parseFloat(r.longitude),
    magnitude:   r.frp ? parseFloat(r.frp) : null,
    title:       `Active Fire — ${r.daynight === 'D' ? 'Daytime' : 'Nighttime'} (${r.instrument ?? 'VIIRS'})`,
    description: `FRP: ${r.frp ?? 'N/A'} MW | Confidence: ${r.confidence ?? 'N/A'} | Sat: ${r.satellite ?? 'N/A'}`,
    time:        `${r.acq_date}T${String(r.acq_time ?? '0000').padStart(4,'0').replace(/(\d{2})(\d{2})/,'$1:$2')}:00Z`,
    source:      `NASA FIRMS (${r.instrument ?? 'VIIRS'})`,
    sourceUrl:   'https://firms.modaps.eosdis.nasa.gov/',
    extra: {
      brightness: r.bright_ti4 ?? r.brightness,
      frp: r.frp,
      confidence: r.confidence,
      instrument: r.instrument,
      satellite: r.satellite,
      daynight: r.daynight,
    },
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const fetchErrors: string[] = []
  let events: ReturnType<typeof normalize>[] = []

  await fetchFIRMS()
    .then(r => { events = r })
    .catch(e => fetchErrors.push(`NASA FIRMS: ${e.message}`))

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
