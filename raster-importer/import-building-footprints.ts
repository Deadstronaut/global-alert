/**
 * Container entrypoint for building footprints (spec 050 US3) — downloads
 * Microsoft Global ML Building Footprints tiles per served country
 * (buildingFootprintsFetch.ts) and writes per-hexagon building counts as
 * the 'building_footprints' exposure source. Same manual, run-to-completion
 * shape as import-dem-slope.ts — no /rasters or manifest.json mount
 * needed, just outbound network access and Supabase credentials.
 *
 * Run via `docker compose run --rm --name mhews-building-footprints-importer building-footprints-importer`.
 * Turkey alone is ~1.7GB compressed across 266 tiles — this will take a
 * while; consider running per-country if the whole-country_codes sweep
 * proves too slow in one sitting (see fetchBuildingFootprints's per-country
 * isolation — one country's failure never blocks the others).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchBuildingFootprints } from '../supabase/functions/shared/buildingFootprintsFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'

/** Runs the building-footprints import once. Throws (does not Deno.exit) on failure, so a caller sees it instead of the whole process silently dying. */
export async function runBuildingFootprintsImport(): Promise<void> {
  const sourceId = await resolveSourceId('building_footprints', 'Microsoft Global ML Building Footprints')
  if (!(await isSourceActive(sourceId))) {
    console.log('Microsoft Global ML Building Footprints source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching building footprints for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Awaited<ReturnType<typeof fetchBuildingFootprints>>
  try {
    countryRecords = await fetchBuildingFootprints(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchBuildingFootprints failed: ${message}`)
  }

  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let featuresImported = 0

  for (const countryCode of servedCountryCodes) {
    const records = countryRecords.get(countryCode)
    if (!records || records.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'building_footprints',
      countryCode,
      'building_count',
      records.map((record) => ({
        geometry: record.geometry,
        metricValue: record.populationCount,
        properties: record.properties,
      })),
    )
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} hexagons)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} hexagons ===`)
}

if (import.meta.main) {
  try {
    await runBuildingFootprintsImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
