/**
 * Edge Function: import-ghsl-population
 * Source: GHSL (GHS-POP), 30-arcsecond global product — spec 044 (Data
 * Sources Inventory §8, "GHSL", moved from evaluated-but-not-integrated to
 * live)
 * Writes to: exposure_datasets / exposure_features
 *
 * Unlike the per-country imports (WorldPop, roads, buildings), this
 * downloads ONE global file per invocation and crops out every served
 * country from that single in-memory raster (see ghslFetch.ts) — so, unlike
 * import-osm-roads/import-osm-buildings, this is NOT invoked once per
 * country by its cron trigger; one call handles every served country.
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchGhslPopulation } from '../shared/ghslFetch.ts'
import { partitionPopulationRasterRecords } from '../shared/populationRasterImportPartition.ts'
import { writeExposureDataset } from '../shared/writeExposureDataset.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('population_raster', 'GHSL')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  const servedCountryCodes = await getServedCountryCodes()

  let countryRecords: Awaited<ReturnType<typeof fetchGhslPopulation>>
  try {
    countryRecords = await fetchGhslPopulation(servedCountryCodes)
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
      'ghsl',
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
