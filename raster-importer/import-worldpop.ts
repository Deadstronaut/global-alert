/**
 * Container entrypoint for WorldPop population — moves import-worldpop's
 * exact logic out of the Edge Function and into this always-more-headroom
 * container, matching import-ghsl.ts's precedent. Live-verified 2026-07-23:
 * the deployed `import-worldpop` function can't even be redeployed right
 * now (worldPopFetch.ts -> rasterToHexagon.ts -> geotiff.js hits the same
 * platform-wide bundler regression documented in NEW_GAME_PLAN.md §4.7),
 * so this container is not just a performance fix but the only currently-
 * working path for this source.
 *
 * Run via `docker compose run --rm worldpop-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchWorldPopPopulation } from '../supabase/functions/shared/worldPopFetch.ts'
import { partitionPopulationRasterRecords } from '../supabase/functions/shared/populationRasterImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { PopulationRasterRecord } from '../supabase/functions/shared/populationRasterRecord.ts'

/** Runs the WorldPop import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runWorldPopImport(): Promise<void> {
  const sourceId = await resolveSourceId('population_raster', 'WorldPop')
  if (!(await isSourceActive(sourceId))) {
    console.log('WorldPop source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching WorldPop rasters for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, PopulationRasterRecord[]>
  try {
    countryRecords = await fetchWorldPopPopulation(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchWorldPopPopulation failed: ${message}`)
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

    const { datasetId, featureCount } = await writeExposureDataset(
      'worldpop',
      countryCode,
      'population_count',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.populationCount,
        properties: record.properties,
      })),
    )
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} features, ${rejected} rejected ===`)
}

if (import.meta.main) {
  try {
    await runWorldPopImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
