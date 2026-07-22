/**
 * Edge Function: fetch-floods
 * Sources: GloFAS (Copernicus), ReliefWeb
 * Writes to: flood table | pg_cron: every 5 min
 */
import { corsHeaders } from '../shared/cors.ts'
import { normalize } from '../shared/normalize.ts'
import { upsertEvents } from '../shared/upsert.ts'
import { validatePayload } from '../shared/validatePayload.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { fetchGdacsFeatures, toGdacsNormalized } from '../shared/gdacsFetch.ts'
import { gdacsSplit } from '../shared/gdacsSplit.ts'
import { deduplicateEvents } from '../shared/dedup.ts'

async function fetchGloFAS(sourceId: string | null) {
  const url = 'https://www.globalfloods.eu/glofas-forecasting/glofas-api/?format=json&alertlevel=1'
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`GloFAS HTTP ${res.status}`)
  const data: any[] = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const p of data) {
    const raw = { id: `glofas-${p.id ?? `${p.lat}-${p.lon}`}`, lat: parseFloat(p.lat), lng: parseFloat(p.lon), time: p.time ?? p.date, magnitude: p.alert_level ? parseFloat(p.alert_level) : null }
    const validation = validatePayload(raw, 'flood')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'flood', validation.reason, p)
      continue
    }
    out.push(normalize({
      id: raw.id, type: 'flood', lat: raw.lat, lng: raw.lng,
      magnitude: p.alert_level ? parseFloat(p.alert_level) : null,
      title: `Flood Alert — ${p.river_name ?? p.basin ?? 'Unknown Basin'}`,
      description: `Alert Level: ${p.alert_level ?? 'N/A'} | Discharge: ${p.discharge ?? 'N/A'} m³/s`,
      time: p.time ?? p.date, source: 'GloFAS/Copernicus', sourceUrl: 'https://www.globalfloods.eu/',
      extra: { alertLevel: p.alert_level, discharge: p.discharge, basin: p.basin },
    }))
  }
  return out
}

async function fetchReliefWeb(sourceId: string | null) {
  const url = 'https://api.reliefweb.int/v1/disasters?filter[field]=type.name&filter[value]=Flood&limit=50&fields[include][]=title&fields[include][]=date&fields[include][]=status&fields[include][]=country&fields[include][]=url_alias'
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`ReliefWeb HTTP ${res.status}`)
  const data = await res.json()

  const out: ReturnType<typeof normalize>[] = []
  for (const r of data.data ?? []) {
    const f = r.fields; const country = f.country?.[0] ?? {}
    const raw = { id: `rw-${r.id}`, lat: country.location?.lat ?? 0, lng: country.location?.lon ?? 0, time: f.date?.created }
    const validation = validatePayload(raw, 'flood')
    if (!validation.valid) {
      await logRejectedPayload(sourceId, 'flood', validation.reason, r)
      continue
    }
    out.push(normalize({
      id: raw.id, type: 'flood',
      lat: raw.lat, lng: raw.lng,
      title: f.title ?? 'Flood Report',
      description: `${country.name ?? 'Unknown'} | Status: ${f.status ?? 'N/A'}`,
      time: f.date?.created, source: 'ReliefWeb',
      sourceUrl: f.url_alias ?? `https://reliefweb.int/node/${r.id}`,
      extra: { country: country.name, status: f.status },
    }))
  }
  return out
}

// GDACS (feature 003-gdacs-source) covers 4 hazard types from one endpoint; this
// is its flood contribution. Dropped out-of-scope categories (TC, VO) are not
// re-logged here — fetch-earthquakes already logs them once per poll cycle.
async function fetchGDACS(sourceId: string | null) {
  const features = await fetchGdacsFeatures()
  const split = gdacsSplit(features)
  return toGdacsNormalized('flood', split.flood, sourceId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const fetchErrors: string[] = []; const all: any[] = []

  const glofasId = await resolveSourceId('flood', 'GloFAS/Copernicus')
  const reliefwebId = await resolveSourceId('flood', 'ReliefWeb')

  await Promise.allSettled([
    (async () => {
      if (!(await isSourceActive(glofasId))) return
      try {
        all.push(...await fetchGloFAS(glofasId))
        if (glofasId) await recordFetchOutcome(glofasId, 'success')
      } catch (e) {
        fetchErrors.push(`GloFAS: ${e.message}`)
        if (glofasId) await recordFetchOutcome(glofasId, 'failure', e.message)
      }
    })(),
    (async () => {
      if (!(await isSourceActive(reliefwebId))) return
      try {
        all.push(...await fetchReliefWeb(reliefwebId))
        if (reliefwebId) await recordFetchOutcome(reliefwebId, 'success')
      } catch (e) {
        fetchErrors.push(`ReliefWeb: ${e.message}`)
        if (reliefwebId) await recordFetchOutcome(reliefwebId, 'failure', e.message)
      }
    })(),
    // CUTOVER-2026-07-22: GDACS's flood slice moved to server/ (already
    // dispatched there via configuredSources.js's gdacs_rest registry
    // entry). Rollback: uncomment + redeploy.
    // (async () => {
    //   const gdacsId = await resolveSourceId('flood', 'GDACS')
    //   if (!(await isSourceActive(gdacsId))) return
    //   try {
    //     all.push(...await fetchGDACS(gdacsId))
    //     if (gdacsId) await recordFetchOutcome(gdacsId, 'success')
    //   } catch (e) {
    //     fetchErrors.push(`GDACS: ${e.message}`)
    //     if (gdacsId) await recordFetchOutcome(gdacsId, 'failure', e.message)
    //   }
    // })(),
  ])

  // Dedup pass kept even with GDACS removed — GloFAS/ReliefWeb can still
  // overlap on the same real-world flood event.
  const events = deduplicateEvents(all, 20) // 20km threshold per TECHNICAL.md §3

  const { inserted, errors: dbErrors } = await upsertEvents(events)
  return new Response(JSON.stringify({
    meta: { status: dbErrors.length === 0 ? 'ok' : 'partial', fetched: events.length, inserted, fetchErrors, dbErrors },
    data: events,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
})
