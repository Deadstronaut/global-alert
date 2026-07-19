/**
 * Edge Function: import-hydrorivers
 * Source: HydroRIVERS (HydroSHEDS) — spec 041
 * Writes to: exposure_datasets / exposure_features
 *
 * Mirrors import-osm-roads/index.ts's structure exactly. Unlike Overpass,
 * HydroRIVERS has no per-country live query — hydroRiversFetch.ts downloads
 * a continent-scale shapefile and clips it to each requested country's
 * boundary. Given the large download sizes involved (tens to hundreds of MB
 * per continent) and this project's live-verified Supabase Edge Function
 * timeout/reachability constraints (spec 040 research.md findings 4-6), the
 * optional countryCode scoping below exists for the same reason it does for
 * roads — even though, in this session, the actual live loads were run via
 * local script rather than this deployed function (spec 041 tasks.md T018/
 * T019/T023/T024).
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchHydroRivers } from '../shared/hydroRiversFetch.ts'
import { partitionRiverRecords } from '../shared/riverImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'
import type { RiverRecord } from '../shared/riverRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('rivers', 'HydroRIVERS')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  let servedCountryCodes = await getServedCountryCodes()

  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

  let countryRecords: Map<string, RiverRecord[]>
  try {
    countryRecords = await fetchHydroRivers(servedCountryCodes)
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

    const { validRecords, rejectedRecords } = partitionRiverRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'rivers', reason, {
        countryCode: record.countryCode,
        hybasId: record.properties.hybasId,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      'hydrorivers',
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

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})
