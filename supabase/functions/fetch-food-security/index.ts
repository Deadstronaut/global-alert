/**
 * Edge Function: fetch-food-security
 * Source: WFP HungerMap (FCS — Food Consumption Score prevalence)
 * Writes to: hazard_events (magnitude=null — see below) | pg_cron: hourly
 * (20260725160000_wfp_hungermap_fetch_cron.sql)
 *
 * Rewritten 2026-07-25: the original scaffold (2026-07-05) was never
 * actually deployed or invoked and assumed a response shape
 * (`c.fcsGraph.fcsPrevalence`, `c.ipcPhase`, per-country lat/lng) that
 * doesn't exist on the real API — live-verified it silently "succeeded"
 * with 0 events every time. The real API is two calls:
 *   1. GET /v2/info/country       — country list + WFP's internal adm0 id
 *   2. GET /v2/adm0/{id}/countryData.json — per-country `fcs` (current %
 *      of population with poor/borderline food consumption)
 * No lat/lng on either endpoint, so this uses each served country's
 * boundary bbox center (country_boundaries, same source GDO's fetch
 * modules use — see gdoAnomalyFetch.ts's fetchCountryBoundary()) — only
 * ever loops this app's own served countries (getServedCountryCodes),
 * never the full ~230-country WFP list, keeping this to a handful of HTTP
 * calls per hourly run regardless of how large WFP's own country list is.
 *
 * magnitude is deliberately left null, NOT set to the raw `fcs` percentage:
 * hazard_thresholds' food_security row is an IPC-phase (0-5) scale (see
 * 20260706... seed), inherited from FEWS NET, this app's other
 * food_security source. Feeding a 0-100 FCS percentage through that same
 * evaluateBreakpoints() call would misclassify almost any measurable
 * reading as "critical" (any value >=5 hits the top breakpoint) — a false
 * critical alert for what might be a routine ~10-30% reading. FCS and IPC
 * phase are different methodologies; there's no principled way to convert
 * one to the other here, so this intentionally skips the severity
 * classifier (magnitude=null -> normalize()'s foodSeverity(0) ->
 * 'minimal') and instead surfaces the real fcs percentage in `extra` for
 * display/inspection, exactly like GDO SPI/soil-moisture/fAPAR keep their
 * own differently-scaled metrics out of the alertable severity path.
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServiceClient } from '../shared/upsert.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { ISO2_TO_ISO3 } from '../shared/iso3166.ts'
import bbox from 'https://esm.sh/@turf/bbox@7'

// Countries at or above this FCS-poor-or-borderline percentage are worth
// surfacing — matches the original scaffold's own >15 threshold.
const FCS_CONCERN_THRESHOLD = 15

interface WfpCountryListEntry {
  country: { id: number; name: string; iso3: string; iso2: string }
}

async function fetchWfpCountryList(): Promise<WfpCountryListEntry[]> {
  const res = await fetch('https://api.hungermapdata.org/v2/info/country', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`WFP HungerMap country list HTTP ${res.status}`)
  const data = await res.json()
  return data.body?.countries ?? data.countries ?? []
}

async function fetchWfpCountryFcs(adm0Id: number): Promise<{ fcs: number; latestDate: string | null } | null> {
  const res = await fetch(`https://api.hungermapdata.org/v2/adm0/${adm0Id}/countryData.json`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`WFP HungerMap countryData HTTP ${res.status} (adm0=${adm0Id})`)
  const data = await res.json()
  if (typeof data.fcs !== 'number') return null
  const graph = Array.isArray(data.fcsGraph) ? data.fcsGraph : []
  const latestDate = graph.length > 0 ? graph[graph.length - 1]?.x ?? null : null
  return { fcs: data.fcs, latestDate }
}

// Same country_boundaries -> bbox-center pattern used by gdoAnomalyFetch.ts
// (duplicated per-module by this codebase's own convention, not shared).
async function fetchCountryCenter(countryCode: string): Promise<[number, number] | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson')
    .eq('country_code', countryCode)
    .maybeSingle()
  if (error || !data) return null
  const geojson = data.geojson as { type: string; features?: { geometry: unknown }[]; geometry?: unknown }
  const geometry = geojson.type === 'FeatureCollection' && geojson.features
    ? { type: 'GeometryCollection', geometries: geojson.features.map((f) => f.geometry) }
    : geojson.type === 'Feature'
      ? (geojson as unknown as { geometry: unknown }).geometry
      : geojson
  // deno-lint-ignore no-explicit-any
  const [minLng, minLat, maxLng, maxLat] = bbox(geometry as any)
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2]
}

async function fetchWfpHungerMap(sourceId: string | null) {
  const servedCountryCodes = await getServedCountryCodes()
  const wfpCountries = await fetchWfpCountryList()
  const wfpByIso3 = new Map(wfpCountries.map((c) => [c.country.iso3?.toUpperCase(), c.country]))

  const out: ReturnType<typeof normalize>[] = []
  for (const countryCode of servedCountryCodes) {
    const iso3 = ISO2_TO_ISO3[countryCode.toUpperCase()]
    const wfpCountry = iso3 ? wfpByIso3.get(iso3) : undefined
    if (!wfpCountry) continue // WFP doesn't cover this served country — nothing to fetch

    const result = await fetchWfpCountryFcs(wfpCountry.id)
    if (!result || result.fcs < FCS_CONCERN_THRESHOLD) continue

    const center = await fetchCountryCenter(countryCode)
    if (!center) continue // no boundary on file yet — can't place this on the map

    const raw = {
      id: `wfp-${iso3}-${(result.latestDate ?? new Date().toISOString()).slice(0, 10)}`,
      lat: center[1],
      lng: center[0],
      time: result.latestDate ?? new Date().toISOString(),
    }
    const validation = validatePayload(raw, 'food_security')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'food_security', validation.reason, { countryCode, ...result })
      continue
    }
    out.push(normalize({
      id: raw.id,
      type: 'food_security',
      lat: raw.lat,
      lng: raw.lng,
      magnitude: null, // see header comment — FCS % is not an IPC phase, deliberately kept out of severity classification
      title: `Food Insecurity (FCS) — ${wfpCountry.name}`,
      description: `${result.fcs.toFixed(1)}% of population has poor/borderline food consumption (WFP HungerMap)`,
      time: raw.time,
      source: 'WFP HungerMap',
      sourceUrl: 'https://hungermap.wfp.org/',
      extra: { countryCode, iso3, fcsPercent: result.fcs },
    }))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; let events: any[] = []

  const sourceId = await resolveSourceId('food_security', 'WFP HungerMap')
  if (await isSourceActive(sourceId)) {
    await fetchWfpHungerMap(sourceId)
      .then(async (r) => {
        events = r
        if (sourceId) await recordFetchOutcome(sourceId, 'success')
      })
      .catch(async (e) => {
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
