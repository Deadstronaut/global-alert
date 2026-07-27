/**
 * Container entrypoint for DEM slope (landslide susceptibility) —
 * downloads Copernicus GLO-30 elevation tiles per served country
 * (demSlopeFetch.ts), computes slope, and writes only the steep-terrain
 * hexagons (>= LANDSLIDE_SLOPE_THRESHOLD_DEG) as the 'dem_slope' exposure
 * source. Same manual, run-to-completion shape as import-ghsl.ts — no
 * /rasters or manifest.json mount needed, just outbound network access and
 * Supabase credentials.
 *
 * Run via `docker compose run --rm dem-slope-importer` (see docker-compose.yml).
 * No scheduled equivalent: terrain doesn't change on any meaningful
 * cadence (automation_kind='manual' in 20260728090000's data_sources row),
 * so this is invoked by hand once per country, not on a recurring cron.
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchDemSlope } from '../supabase/functions/shared/demSlopeFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'

/** Runs the DEM slope import once. Throws (does not Deno.exit) on failure, so a caller sees it instead of the whole process silently dying. */
export async function runDemSlopeImport(): Promise<void> {
  const sourceId = await resolveSourceId('landslide_susceptibility', 'Copernicus GLO-30 DEM')
  if (!(await isSourceActive(sourceId))) {
    console.log('Copernicus GLO-30 DEM source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching DEM slope for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryRecords: Awaited<ReturnType<typeof fetchDemSlope>>
  try {
    countryRecords = await fetchDemSlope(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchDemSlope failed: ${message}`)
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
      'dem_slope',
      countryCode,
      'slope_deg',
      records.map((record) => ({
        geometry: record.geometry,
        metricValue: record.populationCount,
        properties: record.properties,
      })),
    )
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} steep-terrain hexagons)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} steep-terrain hexagons ===`)
}

if (import.meta.main) {
  try {
    await runDemSlopeImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
