/**
 * Container entrypoint for Kontur Population — moves
 * import-kontur-population's exact logic out of the Edge Function and into
 * this always-more-headroom container, matching import-worldpop.ts's
 * precedent. The Edge Function's own header comment already documents why
 * it invokes itself once per country (each ~90MB GeoPackage download +
 * sql.js parse hits the Edge Function's WORKER_RESOURCE_LIMIT) — a
 * container has none of that ceiling, so this loops every served country
 * in one process like the other Docker importers.
 *
 * Run via `docker compose run --rm kontur-population-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchKonturPopulation } from '../supabase/functions/shared/konturFetch.ts'
import { partitionPopulationRecords } from '../supabase/functions/shared/populationImportPartition.ts'
import { writePopulationDataset } from '../supabase/functions/shared/supersedeExposureDataset.ts'
import { aggregatePopulationRecordsToHexagons } from '../supabase/functions/shared/populationCellAggregation.ts'
import { WORLDPOP_SOURCE_CONFIG } from '../supabase/functions/shared/rasterSourceConfig.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { PopulationRecord } from '../supabase/functions/shared/populationRecord.ts'

// Same coarser-than-WorldPop resolution as the Edge Function, for the same
// reason (see import-kontur-population/index.ts's header comment): Kontur's
// native grid has near-complete land coverage, so even WorldPop's own
// resolution produces too many features for a single query to serialize
// within the DB statement timeout.
const KONTUR_TARGET_RESOLUTION = WORLDPOP_SOURCE_CONFIG.h3Resolution - 1

/** Runs the Kontur Population import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runKonturPopulationImport(): Promise<void> {
  const sourceId = await resolveSourceId('population', 'Kontur Population')
  if (!(await isSourceActive(sourceId))) {
    console.log('Kontur Population source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching Kontur Population for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, PopulationRecord[]>
  try {
    countryRecords = await fetchKonturPopulation(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchKonturPopulation failed: ${message}`)
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
    const { datasetId, featureCount } = await writePopulationDataset('kontur', countryCode, aggregated)
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  // A run that completes — even with zero countries processed, or every
  // record rejected — is a success for health-tracking purposes; only an
  // upstream fetch/download failure (handled above) is a 'failure' outcome
  // (research.md §3's "zero valid records is not a failure" convention).
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} features, ${rejected} rejected ===`)
}

if (import.meta.main) {
  try {
    await runKonturPopulationImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
