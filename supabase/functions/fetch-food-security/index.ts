/**
 * Edge Function: fetch-food-security
 * Sources: WFP HungerMap, ReliefWeb (food security filter)
 * Writes to: food_security table | pg_cron: every 1 hour
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

async function fetchWFPHungerMap() {
  // WFP HungerMap LIVE — public API
  const url = 'https://api.hungermapdata.org/v2/info/country'
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`WFP HungerMap HTTP ${res.status}`)
  const data = await res.json()
  const countries: any[] = data.body?.countries ?? data.countries ?? []

  return countries
    .filter(c => c.fcsGraph?.fcsPrevalence > 15) // >15% food insecure
    .map(c => normalize({
      id:          `wfp-${c.country?.iso3 ?? c.adm0_code}-${new Date().toISOString().slice(0,10)}`,
      type:        'food_security',
      lat:         c.lat ?? c.geometry?.coordinates?.[1] ?? 0,
      lng:         c.lon ?? c.geometry?.coordinates?.[0] ?? 0,
      magnitude:   c.ipcPhase ?? c.fcsGraph?.fcsPrevalence ?? null,
      title:       `Food Insecurity — ${c.country?.name ?? c.country_name ?? 'Unknown'}`,
      description: `FCS Prevalence: ${c.fcsGraph?.fcsPrevalence?.toFixed(1) ?? 'N/A'}% | People: ${c.fcsGraph?.fcsSum ?? 'N/A'}`,
      time:        c.fcsGraph?.date ?? new Date().toISOString(),
      source:      'WFP HungerMap',
      sourceUrl:   `https://hungermap.wfp.org/`,
      extra: {
        iso3: c.country?.iso3,
        fcsPrevalence: c.fcsGraph?.fcsPrevalence,
        fcsSum: c.fcsGraph?.fcsSum,
        ipcPhase: c.ipcPhase,
      },
    }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; let events: any[] = []
  await fetchWFPHungerMap()
    .then(r => { events = r })
    .catch(e => fetchErrors.push(`WFP HungerMap: ${e.message}`))
  const { inserted, errors: dbErrors } = await upsertEvents(events)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
