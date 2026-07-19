/**
 * Edge Function: import-worldpop
 * Source: WorldPop — spec 043
 * Writes to: exposure_datasets / exposure_features
 *
 * Mirrors import-hydrorivers/index.ts's structure exactly. Given the large
 * GeoTIFF download sizes involved and this project's live-verified Supabase
 * Edge Function timeout/reachability constraints (spec 040 research.md
 * findings 4-6), the optional countryCode scoping below exists for the same
 * reason it does for roads/rivers/basins — even if the actual live loads
 * this session were run via local script rather than this deployed
 * function.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchWorldPopPopulation } from '../shared/worldPopFetch.ts'
import { partitionPopulationRasterRecords } from '../shared/populationRasterImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'
import type { PopulationRasterRecord } from '../shared/populationRasterRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('population_raster', 'WorldPop')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  let servedCountryCodes = await getServedCountryCodes()

  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

  let countryRecords: Map<string, PopulationRasterRecord[]>
  try {
    countryRecords = await fetchWorldPopPopulation(servedCountryCodes)
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

    const { validRecords, rejectedRecords } = partitionPopulationRasterRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'population_raster', reason, {
        countryCode: record.countryCode,
        h3Cell: record.properties.h3Cell,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writeExposureDataset(
      'worldpop',
      countryCode,
      'population_count',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.populationCount,
        properties: record.properties,
      })),
    )
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})
