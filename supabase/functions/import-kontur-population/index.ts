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
import { aggregatePopulationRecordsToHexagons } from '../shared/populationCellAggregation.ts'
import { WORLDPOP_SOURCE_CONFIG } from '../shared/rasterSourceConfig.ts'
import type { PopulationRecord } from '../shared/populationRecord.ts'

// Kontur ships population pre-aggregated at its own native H3 resolution
// (~458K rows for Turkey) — far too many features for
// get_dataset_features_geojson to serialize within the DB statement
// timeout (live-verified during triage: >2 minutes, always fails).
// Aggregating to WorldPop's own resolution (7) was tried first but still
// produced 118,718 cells for Turkey (vs. WorldPop's 32K) and still timed
// out (live-verified: 22.7s, canceled by statement_timeout) — Kontur's
// native grid has near-complete land coverage, unlike WorldPop's raster
// which only yields a cell where at least one pixel has population, so the
// two sources need different target resolutions to land in the same
// query-time budget. One level coarser (6) is used instead.
const KONTUR_TARGET_RESOLUTION = WORLDPOP_SOURCE_CONFIG.h3Resolution - 1

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

  let servedCountryCodes = await getServedCountryCodes()

  // Optional per-country scoping (mirrors import-worldpop/index.ts) — each
  // country's ~90MB GeoPackage download + sql.js parse is memory-heavy
  // enough that processing all served countries in one invocation hits the
  // Edge Function's WORKER_RESOURCE_LIMIT (live-verified during triage,
  // 2026-07-19); invoking once per country keeps each run's footprint to a
  // single country's data.
  const body = await req.json().catch(() => ({}))
  const requestedCountryCode = typeof body?.countryCode === 'string' ? body.countryCode : undefined
  if (requestedCountryCode) {
    servedCountryCodes = servedCountryCodes.filter((c) => c === requestedCountryCode)
  }

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

    const aggregated = aggregatePopulationRecordsToHexagons(validRecords, KONTUR_TARGET_RESOLUTION)
    const { featureCount } = await writePopulationDataset('kontur', countryCode, aggregated)
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
