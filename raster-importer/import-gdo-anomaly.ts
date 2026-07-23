/**
 * GDO Soil Moisture Anomaly + fAPAR Anomaly importer — the permanent home
 * for the pipeline first proven as a one-off scratchpad script on
 * 2026-07-22 (see gdoAnomalyFetch.ts's header for the full spec-047 pivot
 * story: neither of these needs Python/NetCDF parsing, both are servable
 * as plain GeoTIFF via GDO's existing WCS endpoint). That one-off script
 * wrote real exposure_datasets rows but never called recordFetchOutcome,
 * so both sources stayed stuck on "never run" in the admin Sources tab
 * despite having live data — caught auditing that tab, same gap as
 * import.ts (Meta/HDX) and import-glofas.ts had.
 *
 * Two Edge Functions already exist for these (import-gdo-soil-moisture,
 * import-gdo-fapar) but can't currently be deployed — see NEW_GAME_PLAN.md
 * §4.7, the platform-wide geotiff.js/esm.sh bundler regression. This
 * container-based script is the actual working path until that's fixed,
 * following the same container-instead-of-Edge-Function pattern already
 * used for GHSL/Meta/GloFAS.
 *
 * Run manually: `docker compose run --rm gdo-anomaly-importer`.
 */
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import {
  fetchGdoAnomaly,
  GDO_SOIL_MOISTURE_ANOMALY_CONFIG,
  GDO_FAPAR_ANOMALY_CONFIG,
  type GdoAnomalyConfig,
} from '../supabase/functions/shared/gdoAnomalyFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId } from '../supabase/functions/shared/sourceHealth.ts'

// data_sources.(hazard_type, name) — seeded by
// 20260722180000_gdo_anomaly_exposure_sources.sql (already existed before
// this file; only the recordFetchOutcome wiring was missing).
const DATA_SOURCE_NAMES: Record<string, { hazardType: string; name: string }> = {
  gdo_soil_moisture_anomaly: { hazardType: 'soil_moisture_anomaly', name: 'GDO Soil Moisture Anomaly' },
  gdo_fapar_anomaly: { hazardType: 'vegetation_anomaly', name: 'GDO fAPAR Anomaly (VIIRS)' },
}

async function runOne(config: GdoAnomalyConfig, countryCodes: string[]): Promise<boolean> {
  const { hazardType, name } = DATA_SOURCE_NAMES[config.sourceName]
  const sourceId = await resolveSourceId(hazardType, name)

  let results: Awaited<ReturnType<typeof fetchGdoAnomaly>>
  try {
    results = await fetchGdoAnomaly(config, countryCodes)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (sourceId) await recordFetchOutcome(sourceId, 'failure', message)
    console.error(`[${config.sourceName}] fetchGdoAnomaly failed: ${message}`)
    return false
  }

  let anyWritten = false
  for (const countryCode of countryCodes) {
    const features = results.get(countryCode)
    if (!features || features.length === 0) {
      console.log(`[${config.sourceName}/${countryCode}] no features, skipping write`)
      continue
    }
    const { datasetId, featureCount } = await writeExposureDataset(
      config.sourceName,
      countryCode,
      config.metricPropertyName,
      features,
      config.sourceMetadata,
    )
    console.log(`[${config.sourceName}/${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
    anyWritten = true
  }

  if (sourceId) await recordFetchOutcome(sourceId, anyWritten ? 'success' : 'failure')
  return anyWritten
}

/** Runs both GDO anomaly imports for every served country. Throws (does not Deno.exit) on total failure of either source, matching import.ts/import-ghsl.ts/import-glofas.ts's convention. */
export async function runGdoAnomalyImport(): Promise<void> {
  const servedCountryCodes = await getServedCountryCodes()
  console.log(`Running GDO anomaly imports for ${servedCountryCodes.length} served countries: ${servedCountryCodes.join(', ')}`)

  const soilMoistureOk = await runOne(GDO_SOIL_MOISTURE_ANOMALY_CONFIG, servedCountryCodes)
  const faparOk = await runOne(GDO_FAPAR_ANOMALY_CONFIG, servedCountryCodes)

  console.log(`\n=== DONE: soil_moisture=${soilMoistureOk ? 'ok' : 'FAILED'}, fapar=${faparOk ? 'ok' : 'FAILED'} ===`)
  if (!soilMoistureOk && !faparOk) {
    throw new Error('Both GDO Soil Moisture Anomaly and fAPAR Anomaly imports failed')
  }
}

if (import.meta.main) {
  try {
    await runGdoAnomalyImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
