/**
 * Container entrypoint for HydroBASINS — moves import-hydrobasins's exact
 * logic out of the Edge Function and into this always-more-headroom
 * container. Live-verified 2026-07-23: unlike WorldPop/GHSL, this function
 * has no geotiff dependency (pure vector/GeoJSON data) so it DOES still
 * deploy fine — but invoking the deployed function returns
 * WORKER_RESOURCE_LIMIT (HTTP 546) regardless, same class of problem as
 * GHSL's (looping every served country's fetch+partition+write inside one
 * Edge Function invocation), just triggered by data volume instead of the
 * geotiff import graph. The real exposure_datasets rows already in
 * production for this source were written some other way (a manual/local
 * run) before this container existed, never by a deployed invocation.
 *
 * Run via `docker compose run --rm hydrobasins-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchHydroBasins } from '../supabase/functions/shared/hydroBasinsFetch.ts'
import { partitionBasinRecords } from '../supabase/functions/shared/basinImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { BasinRecord } from '../supabase/functions/shared/basinRecord.ts'

/** Runs the HydroBASINS import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runHydroBasinsImport(): Promise<void> {
  const sourceId = await resolveSourceId('basins', 'HydroBASINS')
  if (!(await isSourceActive(sourceId))) {
    console.log('HydroBASINS source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching HydroBASINS for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, BasinRecord[]>
  try {
    countryRecords = await fetchHydroBasins(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchHydroBasins failed: ${message}`)
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

    const { validRecords, rejectedRecords } = partitionBasinRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'basins', reason, {
        countryCode: record.countryCode,
        hybasId: record.properties.hybasId,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'hydrobasins',
      countryCode,
      'area_km2',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: record.areaKm2,
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
    await runHydroBasinsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
