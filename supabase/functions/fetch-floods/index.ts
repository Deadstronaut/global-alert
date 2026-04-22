/**
 * Edge Function: fetch-floods
 * Sources: GloFAS (Copernicus), ReliefWeb
 * Writes to: flood table | pg_cron: every 5 min
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'

async function fetchGloFAS() {
  const url = 'https://www.globalfloods.eu/glofas-forecasting/glofas-api/?format=json&alertlevel=1'
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`GloFAS HTTP ${res.status}`)
  const data: any[] = await res.json()
  return data.map(p => normalize({
    id: `glofas-${p.id ?? `${p.lat}-${p.lon}`}`,
    type: 'flood', lat: parseFloat(p.lat), lng: parseFloat(p.lon),
    magnitude: p.alert_level ? parseFloat(p.alert_level) : null,
    title: `Flood Alert — ${p.river_name ?? p.basin ?? 'Unknown Basin'}`,
    description: `Alert Level: ${p.alert_level ?? 'N/A'} | Discharge: ${p.discharge ?? 'N/A'} m³/s`,
    time: p.time ?? p.date, source: 'GloFAS/Copernicus', sourceUrl: 'https://www.globalfloods.eu/',
    extra: { alertLevel: p.alert_level, discharge: p.discharge, basin: p.basin },
  }))
}

async function fetchReliefWeb() {
  const url = 'https://api.reliefweb.int/v1/disasters?filter[field]=type.name&filter[value]=Flood&limit=50&fields[include][]=title&fields[include][]=date&fields[include][]=status&fields[include][]=country&fields[include][]=url_alias'
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`ReliefWeb HTTP ${res.status}`)
  const data = await res.json()
  return (data.data ?? []).map((r: any) => {
    const f = r.fields; const country = f.country?.[0] ?? {}
    return normalize({
      id: `rw-${r.id}`, type: 'flood',
      lat: country.location?.lat ?? 0, lng: country.location?.lon ?? 0,
      title: f.title ?? 'Flood Report',
      description: `${country.name ?? 'Unknown'} | Status: ${f.status ?? 'N/A'}`,
      time: f.date?.created, source: 'ReliefWeb',
      sourceUrl: f.url_alias ?? `https://reliefweb.int/node/${r.id}`,
      extra: { country: country.name, status: f.status },
    })
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; const all: any[] = []
  await Promise.allSettled([
    fetchGloFAS().then(r => all.push(...r)).catch(e => fetchErrors.push(`GloFAS: ${e.message}`)),
    fetchReliefWeb().then(r => all.push(...r)).catch(e => fetchErrors.push(`ReliefWeb: ${e.message}`)),
  ])
  const { inserted, errors: dbErrors } = await upsertEvents(all)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: all.length, inserted, fetchErrors, dbErrors },
    data: all,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
