/**
 * Container entrypoint for HydroRIVERS — moves import-hydrorivers's exact
 * logic out of the Edge Function and into this always-more-headroom
 * container. Same reasoning as import-hydrobasins.ts: no geotiff
 * dependency, still deploys fine, but invoking it live-verified 2026-07-23
 * returns WORKER_RESOURCE_LIMIT (HTTP 546) — hydroRiversFetch.ts downloads
 * a continent-scale shapefile and clips it per served country inside one
 * invocation.
 *
 * Run via `docker compose run --rm hydrorivers-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchHydroRivers } from '../supabase/functions/shared/hydroRiversFetch.ts'
import { partitionRiverRecords } from '../supabase/functions/shared/riverImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { RiverRecord } from '../supabase/functions/shared/riverRecord.ts'

/** Runs the HydroRIVERS import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runHydroRiversImport(): Promise<void> {
  const sourceId = await resolveSourceId('rivers', 'HydroRIVERS')
  if (!(await isSourceActive(sourceId))) {
    console.log('HydroRIVERS source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching HydroRIVERS for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, RiverRecord[]>
  try {
    countryRecords = await fetchHydroRivers(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchHydroRivers failed: ${message}`)
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

    const { datasetId, featureCount } = await writeExposureDataset(
      'hydrorivers',
      countryCode,
      'length_m',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.lengthMeters,
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
    await runHydroRiversImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
