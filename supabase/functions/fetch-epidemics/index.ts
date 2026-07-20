/**
 * Edge Function: fetch-epidemics
 * Source: WHO (World Health Organization) — Disease Outbreak News
 * Writes to: epidemic table
 * Called by: pg_cron every 30 minutes (see 20260720130000_ptwc_who_fetch_cron.sql)
 *
 * Ported from server/src/sources/who.js — the old always-on Node aggregator
 * (server/) had this fetch logic working correctly (verified: real rows in
 * the epidemic table up to 2026-07-03, e.g. who-/2026-DON612), it just never
 * got moved to this repo's stateless Edge Function + pg_cron pattern.
 *
 * WHO's outbreak feed carries no coordinates at all — the old code's
 * approximate country-name → centroid lookup is kept as-is (no better free
 * alternative without a geocoding call per record). One behavior change:
 * the original silently defaulted to (0,0) when no country name matched;
 * here validatePayload() rejects that record instead of plotting it at
 * Null Island (same fix as fetch-tsunamis).
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'

const FEED_URL = 'https://www.who.int/api/emergencies/diseaseoutbreaknews'

// Country name → approximate centroid. Mirrors server/src/sources/who.js's
// COUNTRY_COORDS exactly (kept in sync manually, same convention as this
// repo's other ported tables).
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Afghanistan': [33.9391, 67.7100], 'Angola': [-11.2027, 17.8739],
  'Bangladesh': [23.6850, 90.3563], 'Brazil': [-14.2350, -51.9253],
  'Cambodia': [12.5657, 104.9910], 'Cameroon': [3.8480, 11.5021],
  'Chad': [15.4542, 18.7322], 'China': [35.8617, 104.1954],
  'Colombia': [4.5709, -74.2973], 'Congo': [-0.2280, 15.8277],
  'Democratic Republic of the Congo': [-4.0383, 21.7587],
  'Egypt': [26.8206, 30.8025], 'Ethiopia': [9.1450, 40.4897],
  'Ghana': [7.9465, -1.0232], 'Guinea': [9.9456, -11.3247],
  'Haiti': [18.9712, -72.2852], 'India': [20.5937, 78.9629],
  'Indonesia': [-0.7893, 113.9213], 'Iraq': [33.2232, 43.6793],
  'Jordan': [30.5852, 36.2384], 'Kenya': [-0.0236, 37.9062],
  'Lebanon': [33.8547, 35.8623], 'Libya': [26.3351, 17.2283],
  'Madagascar': [-18.7669, 46.8691], 'Malawi': [-13.2543, 34.3015],
  'Mali': [17.5707, -3.9962], 'Mauritania': [21.0079, -10.9408],
  'Mexico': [23.6345, -102.5528], 'Mozambique': [-18.6657, 35.5296],
  'Myanmar': [21.9162, 95.9560], 'Nepal': [28.3949, 84.1240],
  'Niger': [17.6078, 8.0817], 'Nigeria': [9.0820, 8.6753],
  'Pakistan': [30.3753, 69.3451], 'Philippines': [12.8797, 121.7740],
  'Saudi Arabia': [23.8859, 45.0792], 'Senegal': [14.4974, -14.4524],
  'Sierra Leone': [8.4606, -11.7799], 'Somalia': [5.1521, 46.1996],
  'South Sudan': [6.8770, 31.3070], 'Sudan': [12.8628, 30.2176],
  'Syria': [34.8021, 38.9968], 'Tanzania': [-6.3690, 34.8888],
  'Thailand': [15.8700, 100.9925], 'Turkiye': [38.9637, 35.2433],
  'Uganda': [1.3733, 32.2903], 'Ukraine': [48.3794, 31.1656],
  'United States': [37.0902, -95.7129], 'Venezuela': [6.4238, -66.5897],
  'Vietnam': [14.0583, 108.2772], 'Yemen': [15.5527, 48.5164],
  'Zambia': [-13.1339, 27.8493], 'Zimbabwe': [-19.0154, 29.1549],
}

interface WHOItem {
  Title?: string
  OverrideTitle?: string
  UseOverrideTitle?: boolean
  FormattedDate?: string
  PublicationDateAndTime?: string
  ItemDefaultUrl?: string
}

function resolveCountry(title: string, desc: string): { lat: number; lng: number; country: string } | null {
  for (const [name, coords] of Object.entries(COUNTRY_COORDS)) {
    if (title.includes(name) || desc.includes(name)) {
      return { lat: coords[0], lng: coords[1], country: name }
    }
  }
  return null
}

async function fetchWHO(sourceId: string | null): Promise<ReturnType<typeof normalize>[]> {
  const url = new URL(FEED_URL)
  url.searchParams.set('sf_provider', 'dynamicProvider372')
  url.searchParams.set('sf_culture', 'en')
  url.searchParams.set('$orderby', 'PublicationDateAndTime desc')
  url.searchParams.set('$expand', 'EmergencyEvent')
  url.searchParams.set(
    '$select',
    'Title,TitleSuffix,OverrideTitle,UseOverrideTitle,regionscountries,ItemDefaultUrl,FormattedDate,PublicationDateAndTime',
  )

  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'GlobalAlert/1.0 (disaster monitoring)' },
  })
  if (!res.ok) throw new Error(`WHO HTTP ${res.status}`)
  const data = await res.json()
  const items: WHOItem[] = Array.isArray(data?.value) ? data.value : []

  const out: ReturnType<typeof normalize>[] = []
  for (const item of items) {
    const id = `who-${item.ItemDefaultUrl || item.Title || item.PublicationDateAndTime}`
    const title = ((item.UseOverrideTitle ? item.OverrideTitle : item.Title) || item.Title || 'Disease Outbreak').slice(0, 200)
    const desc = (item.FormattedDate || '').trim()
    const located = resolveCountry(title, desc)

    const raw = {
      id,
      lat: located?.lat ?? null,
      lng: located?.lng ?? null,
      time: item.PublicationDateAndTime,
      magnitude: 1,
    }
    const validation = validatePayload(raw, 'epidemic')
    if (!validation.valid) {
      // Most rejections here are "no country name matched" (lat/lng null) —
      // expected for global/regional bulletins with no single country in the title.
      await logRejectedPayload(sourceId, 'epidemic', validation.reason, item)
      continue
    }
    out.push(normalize({
      id,
      type: 'epidemic',
      lat: located!.lat,
      lng: located!.lng,
      magnitude: 1,
      depth: 0,
      title,
      description: (desc || title).slice(0, 500),
      time: item.PublicationDateAndTime ? new Date(item.PublicationDateAndTime).toISOString() : new Date().toISOString(),
      source: 'WHO',
      sourceUrl: item.ItemDefaultUrl
        ? `https://www.who.int${item.ItemDefaultUrl}`
        : 'https://www.who.int/emergencies/disease-outbreak-news',
      extra: { country: located!.country },
    }))
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const fetchErrors: string[] = []
  let events: ReturnType<typeof normalize>[] = []

  const whoId = await resolveSourceId('epidemic', 'WHO')

  if (await isSourceActive(whoId)) {
    try {
      events = await fetchWHO(whoId)
      if (whoId) await recordFetchOutcome(whoId, 'success')
    } catch (e) {
      fetchErrors.push(`WHO: ${e.message}`)
      if (whoId) await recordFetchOutcome(whoId, 'failure', e.message)
    }
  }

  const { inserted, errors: dbErrors } = await upsertEvents(events)

  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})
