/**
 * Container entrypoint for OSM road network — moves import-osm-roads's
 * exact logic out of the Edge Function and into this container. Same
 * class of fix as import-osm-buildings.ts: no geotiff dependency, still
 * deploys fine, but live-verified 2026-07-23 that invoking it across all
 * served countries in one call doesn't return within 120s (a single
 * Overpass country query already took 60-90s+ per that Edge Function's
 * own header comment — this is exactly the timeout it was trying to work
 * around with per-country invocations, which a container doesn't need
 * since it has no request-lifetime ceiling at all).
 *
 * Run via `docker compose run --rm osm-roads-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchOsmRoads } from '../supabase/functions/shared/osmRoadsFetch.ts'
import { partitionRoadRecords } from '../supabase/functions/shared/roadImportPartition.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, logRejectedPayload, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { RoadRecord } from '../supabase/functions/shared/roadRecord.ts'

/** Runs the OSM roads import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runOsmRoadsImport(): Promise<void> {
  const sourceId = await resolveSourceId('roads', 'OpenStreetMap Roads')
  if (!(await isSourceActive(sourceId))) {
    console.log('OpenStreetMap Roads source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching OSM road network for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Map<string, RoadRecord[]>
  try {
    countryRecords = await fetchOsmRoads(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchOsmRoads failed: ${message}`)
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

    const { validRecords, rejectedRecords } = partitionRoadRecords(records, servedCountryCodes)
    rejected += rejectedRecords.length
    for (const { record, reason } of rejectedRecords) {
      await logRejectedPayload(sourceId, 'roads', reason, {
        countryCode: record.countryCode,
        osmId: record.properties.osmId,
        highway: record.properties.highway,
      })
    }

    if (validRecords.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'osm',
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

  // A run that completes — even with zero countries processed, or every
  // record rejected — is a success for health-tracking purposes; only an
  // upstream fetch failure (handled above) is a 'failure' outcome, matching
  // the original Edge Function's "zero valid records is not a failure"
  // convention.
  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} features, ${rejected} rejected ===`)
}

if (import.meta.main) {
  try {
    await runOsmRoadsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
