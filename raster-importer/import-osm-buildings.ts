/**
 * Container entrypoint for OSM critical-facility buildings — moves
 * import-osm-buildings's exact logic out of the Edge Function and into
 * this container. Same class of fix as import-hydrobasins.ts/
 * import-hydrorivers.ts: no geotiff dependency, still deploys fine, but
 * live-verified 2026-07-23 that invoking it (one Overpass query per
 * served country, inside one invocation) doesn't return within 120s —
 * that Edge Function's own header comment already flagged this as a
 * 150s-idle-timeout risk. A container has no such ceiling.
 *
 * Run via `docker compose run --rm osm-buildings-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchOsmBuildings } from '../supabase/functions/shared/osmBuildingsFetch.ts'
import { partitionBuildingRecords } from '../supabase/functions/shared/buildingImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { BuildingRecord } from '../supabase/functions/shared/buildingRecord.ts'

/** Runs the OSM buildings import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runOsmBuildingsImport(): Promise<void> {
  const sourceId = await resolveSourceId('buildings', 'OpenStreetMap Buildings')
  if (!(await isSourceActive(sourceId))) {
    console.log('OpenStreetMap Buildings source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching OSM critical-facility buildings for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, BuildingRecord[]>
  try {
    countryRecords = await fetchOsmBuildings(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchOsmBuildings failed: ${message}`)
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

    const { validRecords, rejectedRecords } = partitionBuildingRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'buildings', reason, {
        countryCode: record.countryCode,
        osmId: record.properties.osmId,
        facilityType: record.properties.facilityType,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'osm-buildings',
      countryCode,
      'count',
      validRecords.map((record) => ({
        geometry: record.geometry,
        metricValue: 1,
        properties: record.properties,
        assetCategory: record.assetCategory,
      })),
    )
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  // Same "a completed run is a success even with zero features" convention
  // as the original Edge Function — only an upstream fetch failure is a
  // 'failure' outcome.
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} features, ${rejected} rejected ===`)
}

if (import.meta.main) {
  try {
    await runOsmBuildingsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
