/**
 * Container entrypoint for GHSL population — moves import-ghsl-population's
 * exact logic out of the Edge Function and into this always-more-headroom
 * container. Live-verified 2026-07-22: invoking the deployed
 * `import-ghsl-population` Edge Function still returns WORKER_RESOURCE_LIMIT
 * (HTTP 546) even after ghslFetch.ts was already rewritten to download only
 * small (~1.5MB) per-country tiles instead of the whole world file — so the
 * ceiling isn't the raster size, it's the combined per-invocation memory of
 * the geotiff+h3-js+supabase-js import graph plus looping over every served
 * country in one request (see rasterToHexagon.ts's own header comment on
 * this same import-graph cost). None of that is disk-streaming-shaped like
 * Meta/HDX's problem (see rasterToHexagonFile.ts) — GHSL's fix is just "run
 * outside the Edge Function's memory ceiling", so this reuses ghslFetch.ts
 * completely unmodified rather than rewriting it around
 * aggregateRasterToHexagonsFromFile.
 *
 * Two ways to run this (see docker-compose.yml):
 * - One-shot: `docker compose run --rm ghsl-importer` (this file directly).
 * - Scheduled: `ghsl-importer-scheduled` service runs cron.ts, which calls
 *   runGhslImport() below on a monthly Deno.cron trigger instead.
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchGhslPopulation } from '../supabase/functions/shared/ghslFetch.ts'
import { partitionPopulationRasterRecords } from '../supabase/functions/shared/populationRasterImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'

/** Runs the GHSL import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runGhslImport(): Promise<void> {
  const sourceId = await resolveSourceId('population_raster', 'GHSL')
  if (!(await isSourceActive(sourceId))) {
    console.log('GHSL source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching GHSL tiles for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Awaited<ReturnType<typeof fetchGhslPopulation>>
  try {
    countryRecords = await fetchGhslPopulation(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchGhslPopulation failed: ${message}`)
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
      'ghsl',
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
    await runGhslImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
