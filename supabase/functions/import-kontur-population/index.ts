/**
 * Edge Function: import-kontur-population
 * Source: Kontur Population (HDX, GeoPackage) — spec 038
 * Writes to: exposure_datasets / exposure_features
 *
 * Not a hazard-event fetch — imports population exposure data per served
 * country, superseding each country's own prior Kontur-sourced dataset.
 * Per-country dataset resolution is read from population_source_country_datasets
 * (set once at onboarding by resolveHdxCountryDataset.ts) — this function
 * never queries HDX's search API itself (contracts/import-population-source.md).
 */
import { corsHeaders } from '../shared/cors.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../shared/sourceHealth.ts'
import { getServedCountryCodes } from '../shared/servedCountries.ts'
import { fetchKonturPopulation } from '../shared/konturFetch.ts'
import { partitionPopulationRecords } from '../shared/populationImportPartition.ts'
import { writePopulationDataset } from '../shared/supersedeExposureDataset.ts'
import type { PopulationRecord } from '../shared/populationRecord.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    })

  const sourceId = await resolveSourceId('population', 'Kontur Population')
  if (!(await isSourceActive(sourceId))) {
    return json({ meta: { status: 'skipped', reason: 'source inactive' } })
  }

  const servedCountryCodes = await getServedCountryCodes()

  let countryRecords: Map<string, PopulationRecord[]>
  try {
    countryRecords = await fetchKonturPopulation(servedCountryCodes)
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

    const { validRecords, rejectedRecords } = partitionPopulationRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'population', reason, {
        countryCode: record.countryCode,
        population: record.population,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { featureCount } = await writePopulationDataset('kontur', countryCode, validRecords)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  // A run that completes — even with zero countries processed, or every
  // record rejected — is a success for health-tracking purposes; only an
  // upstream fetch/download failure (handled above) is a 'failure' outcome
  // (research.md §3's "zero valid records is not a failure" convention).
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  return json({ countriesProcessed, countriesSkipped, featuresImported, rejected })
})
