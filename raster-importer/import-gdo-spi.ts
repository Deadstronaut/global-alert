/**
 * Container entrypoint for GDO SPI (GPCC drought index) — moves
 * import-gdo-spi's exact logic out of the Edge Function and into this
 * always-more-headroom container, matching import-worldpop.ts's precedent.
 * Live-verified 2026-08-19: `import-gdo-spi` can't even be deployed right
 * now — gdoSpiFetch.ts imports `geotiff@2.1.3` from esm.sh, which hits the
 * same platform-wide bundler regression as WorldPop/GHSL ("Unknown
 * built-in 'node:' module: vm", see NEW_GAME_PLAN.md §4.7) — so this
 * container is not just a performance fix but the only currently-working
 * path for this source.
 *
 * Also folds in unscheduling GDO SPI's pg_cron trigger (see
 * supabase/migrations/ for the matching unschedule migration) — this
 * container's own Deno.cron in cron.ts is now the sole schedule.
 *
 * Run via `docker compose run --rm gdo-spi-importer` (see docker-compose.yml).
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { fetchGdoSpi, GDO_SPI_SOURCE_METADATA } from '../supabase/functions/shared/gdoSpiFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId, isSourceActive } from '../supabase/functions/shared/sourceHealth.ts'
import type { ExposureFeatureInput } from '../supabase/functions/shared/writeExposureDataset.ts'

/** Runs the GDO SPI import once. Throws (does not Deno.exit) on failure, so a cron-scheduled caller sees it instead of the whole process silently dying. */
export async function runGdoSpiImport(): Promise<void> {
  const sourceId = await resolveSourceId('drought_index', 'GDO SPI (GPCC)')
  if (!(await isSourceActive(sourceId))) {
    console.log('GDO SPI source is inactive (data_sources.is_active = false), skipping')
    return
  }

  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Fetching GDO SPI for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  let countryFeatures: Map<string, ExposureFeatureInput[]>
  try {
    countryFeatures = await fetchGdoSpi(servedCountryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    throw new Error(`fetchGdoSpi failed: ${message}`)
  }

  let countriesProcessed = 0
  const countriesSkipped: string[] = []
  let featuresImported = 0

  for (const countryCode of servedCountryCodes) {
    const features = countryFeatures.get(countryCode)
    if (!features || features.length === 0) {
      countriesSkipped.push(countryCode)
      continue
    }

    const { datasetId, featureCount } = await writeExposureDataset(
      'gdo_spi',
      countryCode,
      'spi_value',
      features,
      GDO_SPI_SOURCE_METADATA,
    )
    console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
    countriesProcessed += 1
    featuresImported += featureCount
  }

  if (sourceId) await recordFetchOutcome(sourceId, 'success')

  console.log(`\n=== DONE: ${countriesProcessed} processed, ${countriesSkipped.length} skipped (${countriesSkipped.join(', ') || 'none'}), ${featuresImported} features ===`)
}

if (import.meta.main) {
  try {
    await runGdoSpiImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
