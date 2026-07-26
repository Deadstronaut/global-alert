/**
 * Container entrypoint for CHIRPS monthly rainfall — follows import-ghsl.ts's
 * exact pattern (see that file's header for why raster imports run here
 * rather than in an Edge Function). Simpler than GHSL: CHIRPS is a single
 * global file, not a tile grid, so there's no per-tile loop/border-merge
 * step — chirpsFetch.ts handles the whole download+per-country crop itself.
 *
 * Two ways to run this (see docker-compose.yml):
 * - One-shot: `docker compose run --rm chirps-importer` (this file directly).
 * - Scheduled: `chirps-importer-scheduled` service runs cron.ts, which calls
 *   runChirpsImport() below on a monthly Deno.cron trigger instead.
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchChirpsRainfall } from '../supabase/functions/shared/chirpsFetch.ts'
import { partitionPopulationRasterRecords } from '../supabase/functions/shared/populationRasterImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'

/** Runs the CHIRPS import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runChirpsImport(): Promise<void> {
  const sourceId = await resolveSourceId('rainfall', 'CHIRPS')
  if (!(await isSourceActive(sourceId))) {
    console.log('CHIRPS source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching CHIRPS rainfall for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Awaited<ReturnType<typeof fetchChirpsRainfall>>
  try {
    countryRecords = await fetchChirpsRainfall(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchChirpsRainfall failed: ${message}`)
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
      await logRejectedPayload(sourceId, 'rainfall', reason, {
        countryCode: record.countryCode,
        h3Cell: record.properties.h3Cell,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'chirps',
      countryCode,
      'rainfall_mm',
      validRecords.map((record) => ({
        geometry: record.geometry,
        // populationCount is the shared record type's generic value field
        // (see populationRasterRecord.ts) — holds rainfall mm here, not a
        // headcount, per CHIRPS_SOURCE_CONFIG's pixelValueMeaning='mean'.
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
    await runChirpsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
