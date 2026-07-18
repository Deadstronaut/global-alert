/**
 * Edge Function: import-osm-roads
 * Source: OpenStreetMap via the Overpass API — spec 040
 * Writes to: exposure_datasets / exposure_features
 *
 * Not a hazard-event fetch — imports road-network exposure data per served
 * country, superseding each country's own prior OSM-sourced dataset. Unlike
 * import-kontur-population, there is no per-country dataset-resolution step
 * to read first: osmRoadsFetch.ts queries Overpass directly by country code
 * (research.md §5 — Overpass's ISO3166-1 area filter takes the code as a
 * query parameter, no persisted lookup needed).
 *
 * Accepts an optional { countryCode } in the request body to process a
 * single country only. Live-verified during implementation (research.md §8
 * addendum): a single Overpass country query takes 60-90s+ for a
 * medium-sized country, and Supabase Edge Functions enforce a 150s idle
 * timeout — processing multiple served countries in one invocation
 * (the original design) reliably exceeded that limit. trigger_osm_roads_
 * import() (the cron migration) now invokes this function once per served
 * country instead of once total, matching this parameter.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchOsmRoads } from '../shared/osmRoadsFetch.ts'
import { partitionRoadRecords } from '../shared/roadImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'
import type { RoadRecord } from '../shared/roadRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('roads', 'OpenStreetMap Roads')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  let servedCountryCodes = await getServedCountryCodes()

  // Optional single-country scoping (see header comment) — a request body of
  // {} (or no body) still processes every served country, for manual/ad-hoc
  // invocation.
  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

  let countryRecords: Map<string, RoadRecord[]>
  try {
    countryRecords = await fetchOsmRoads(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    return json({ error: message }, 502)
  }

  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let featuresImported = 0
  let rejected = 0

  for (const countryCode of servedCountryCodes) {
    const records = countryRecords.get(countryCode)
    if (!records || records.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { validRecords, rejectedRecords } = partitionRoadRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'roads', reason, {
        countryCode: record.countryCode,
        osmId: record.properties.osmId,
        highway: record.properties.highway,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      'osm',
      countryCode,
      'length_m',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.lengthMeters,
        properties: record.properties,
      })),
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  // A run that completes — even with zero countries processed, or every
  // record rejected — is a success for health-tracking purposes; only an
  // upstream fetch failure (handled above) is a 'failure' outcome, matching
  // import-kontur-population's "zero valid records is not a failure"
  // convention (research.md §5).
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})

