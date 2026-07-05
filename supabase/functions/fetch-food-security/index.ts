/**
 * Edge Function: fetch-food-security
 * Sources: WFP HungerMap, ReliefWeb (food security filter)
 * Writes to: food_security table | pg_cron: every 1 hour
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'

async function fetchWFPHungerMap(sourceId: string | null) {
  // WFP HungerMap LIVE — public API
  const url = 'https://api.hungermapdata.org/v2/info/country'
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`WFP HungerMap HTTP ${res.status}`)
  const data = await res.json()
  const countries: any[] = data.body?.countries ?? data.countries ?? []

  const out: ReturnType<typeof normalize>[] = []
  for (const c of countries.filter(c => c.fcsGraph?.fcsPrevalence > 15)) {
    const raw = {
      id: `wfp-${c.country?.iso3 ?? c.adm0_code}-${new Date().toISOString().slice(0, 10)}`,
      lat: c.lat ?? c.geometry?.coordinates?.[1] ?? 0,
      lng: c.lon ?? c.geometry?.coordinates?.[0] ?? 0,
      time: c.fcsGraph?.date ?? new Date().toISOString(),
      magnitude: c.ipcPhase ?? c.fcsGraph?.fcsPrevalence ?? null,
    }
    const validation = validatePayload(raw, 'food_security')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'food_security', validation.reason, c)
      continue
    }
    out.push(normalize({
      id: raw.id, type: 'food_security', lat: raw.lat, lng: raw.lng,
      magnitude: c.ipcPhase ?? c.fcsGraph?.fcsPrevalence ?? null,
      title: `Food Insecurity — ${c.country?.name ?? c.country_name ?? 'Unknown'}`,
      description: `FCS Prevalence: ${c.fcsGraph?.fcsPrevalence?.toFixed(1) ?? 'N/A'}% | People: ${c.fcsGraph?.fcsSum ?? 'N/A'}`,
      time: c.fcsGraph?.date ?? new Date().toISOString(),
      source: 'WFP HungerMap',
      sourceUrl: `https://hungermap.wfp.org/`,
      extra: {
        iso3: c.country?.iso3,
        fcsPrevalence: c.fcsGraph?.fcsPrevalence,
        fcsSum: c.fcsGraph?.fcsSum,
        ipcPhase: c.ipcPhase,
      },
    }))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; let events: any[] = []

  const sourceId = await resolveSourceId('food_security', 'WFP HungerMap')
  if (await isSourceActive(sourceId)) {
    await fetchWFPHungerMap(sourceId)
      .then(async r => {
        events = r
        if (sourceId) await recordFetchOutcome(sourceId, 'success')
      })
      .catch(async e => {
        fetchErrors.push(`WFP HungerMap: ${e.message}`)
        if (sourceId) await recordFetchOutcome(sourceId, 'failure', e.message)
      })
  }

  const { inserted, errors: dbErrors } = await upsertEvents(events)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
