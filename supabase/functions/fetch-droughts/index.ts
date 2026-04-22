/**
 * Edge Function: fetch-droughts
 * Sources: FEWS NET, WFP VAM (GeoJSON endpoints)
 * Writes to: drought table | pg_cron: every 1 hour
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

async function fetchFEWSNET() {
  // FEWS NET IPC classifications — public GeoJSON
  const url = 'https://fdw.fews.net/api/ipcpackage/?country_code=&format=json&limit=200'
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`FEWS NET HTTP ${res.status}`)
  const data = await res.json()
  return (data.results ?? data ?? []).map((r: any, i: number) => normalize({
    id:          `fews-${r.id ?? `${r.country}-${i}`}`,
    type:        'drought',
    lat:         r.centroid?.coordinates?.[1] ?? r.lat ?? 0,
    lng:         r.centroid?.coordinates?.[0] ?? r.lon ?? 0,
    magnitude:   r.ipc_phase ? parseFloat(r.ipc_phase) : null,
    title:       `Food Insecurity — ${r.country_name ?? r.country ?? 'Unknown'} (IPC Phase ${r.ipc_phase ?? 'N/A'})`,
    description: `IPC Phase: ${r.ipc_phase ?? 'N/A'} | Population: ${r.population ?? 'N/A'} | Period: ${r.period_start ?? ''} – ${r.period_end ?? ''}`,
    time:        r.period_start ?? r.created,
    source:      'FEWS NET',
    sourceUrl:   `https://fews.net/`,
    extra: { country: r.country, ipcPhase: r.ipc_phase, population: r.population },
  }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; let events: any[] = []
  await fetchFEWSNET()
    .then(r => { events = r })
    .catch(e => fetchErrors.push(`FEWS NET: ${e.message}`))
  const { inserted, errors: dbErrors } = await upsertEvents(events)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
