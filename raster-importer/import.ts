/**
 * Container entrypoint for the Meta/HDX + GHSL population raster import —
 * the disk-streaming path proven in supabase/functions/_local_test/
 * test_meta_streaming.ts (Madagascar 12.4GB -> 226MB peak RSS/37s, Turkey
 * 16.6GB -> 371MB peak RSS/166s), now wired to actually write results via
 * writeExposureDataset instead of just logging them.
 *
 * Scope note (2026-07-22, NEW_GAME_PLAN.md §4.1 first pass): this reads
 * ALREADY-DOWNLOADED per-country GeoTIFFs from a manifest file — it does
 * NOT download them from Meta/HDX itself. No metaFetch.ts exists anywhere
 * in this repo (unlike worldPopFetch.ts/ghslFetch.ts), so an automated
 * monthly download step for Meta/HDX is still open work, not something
 * this file pretends to already do.
 *
 * Two ways to run this (see docker-compose.yml):
 * - One-shot: `docker compose run --rm meta-ghsl-importer` (this file
 *   directly, exits when done) against a manifest that points at files
 *   already sitting on disk (e.g. the ones documented in this repo's
 *   raster-db-location memory, C:\Users\Deadstro\global-alert-db\database\).
 * - Scheduled: `meta-ghsl-importer-scheduled` service runs cron.ts, which
 *   imports and calls runMetaImport() below on a monthly Deno.cron trigger
 *   instead of running it once and exiting.
 */
import { aggregateRasterToHexagonsFromFile } from '../supabase/functions/shared/rasterToHexagonFile.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId } from '../supabase/functions/shared/sourceHealth.ts'
import {
  META_SOURCE_CONFIG,
  GHSL_SOURCE_CONFIG,
  WORLDPOP_SOURCE_CONFIG,
  type RasterSourceConfig,
} from '../supabase/functions/shared/rasterSourceConfig.ts'

interface ManifestEntry {
  source: 'meta_hdx' | 'ghsl' | 'worldpop'
  countryCode: string
  tifPath: string
}

const SOURCE_CONFIGS: Record<ManifestEntry['source'], RasterSourceConfig> = {
  meta_hdx: META_SOURCE_CONFIG,
  ghsl: GHSL_SOURCE_CONFIG,
  worldpop: WORLDPOP_SOURCE_CONFIG,
}

// data_sources.(hazard_type, name) for each manifest source type — live-verified
// 2026-07-23 that this file previously never called recordFetchOutcome at all,
// so Meta/HDX's admin-panel card stayed stuck on "never run" even though real
// data was being written every time this ran (caught auditing the sources tab
// against what's actually in exposure_datasets).
const DATA_SOURCE_NAMES: Record<ManifestEntry['source'], { hazardType: string; name: string }> = {
  meta_hdx: { hazardType: 'population_raster', name: 'Meta/HDX Population' },
  ghsl: { hazardType: 'population_raster', name: 'GHSL' },
  worldpop: { hazardType: 'population_raster', name: 'WorldPop' },
}

async function fetchCountryBoundary(supabaseUrl: string, serviceKey: string, countryCode: string): Promise<GeoJSON.Geometry> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/country_boundaries?country_code=eq.${countryCode}&select=geojson`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  )
  const rows = await res.json()
  if (!rows[0]) throw new Error(`No country_boundaries row for ${countryCode}`)
  const geojson = rows[0].geojson
  if (geojson.type === 'FeatureCollection') {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f: GeoJSON.Feature) => f.geometry) }
  }
  return geojson.type === 'Feature' ? geojson.geometry : geojson
}

/** Runs the manifest-driven import once. Throws (does not Deno.exit) on any failed entry, so a cron-scheduled caller sees the failure instead of the whole process silently dying. */
export async function runMetaImport(): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const manifestPath = Deno.env.get('RASTER_IMPORT_MANIFEST') ?? '/manifest.json'

  if (!supabaseUrl || !serviceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
  }

  let manifest: ManifestEntry[]
  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath))
  } catch (e) {
    throw new Error(`Failed to read manifest at ${manifestPath}: ${e instanceof Error ? e.message : e}`)
  }

  console.log(`Loaded manifest: ${manifest.length} entr${manifest.length === 1 ? 'y' : 'ies'}`)

  let succeeded = 0
  const failed: string[] = []
  const outcomesBySource = new Map<ManifestEntry['source'], boolean>() // source -> any success yet

  for (const entry of manifest) {
    const label = `${entry.source}/${entry.countryCode}`
    const config = SOURCE_CONFIGS[entry.source]
    if (!config) {
      console.error(`[${label}] unknown source "${entry.source}", skipping`)
      failed.push(label)
      continue
    }
    if (!outcomesBySource.has(entry.source)) outcomesBySource.set(entry.source, false)

    try {
      console.log(`[${label}] fetching country boundary...`)
      const boundary = await fetchCountryBoundary(supabaseUrl, serviceKey, entry.countryCode)

      const fileInfo = await Deno.stat(entry.tifPath)
      console.log(`[${label}] streaming ${(fileInfo.size / 1e9).toFixed(2)}GB from ${entry.tifPath}...`)

      const t0 = performance.now()
      const records = await aggregateRasterToHexagonsFromFile(entry.tifPath, config, boundary, entry.countryCode)
      const t1 = performance.now()
      console.log(`[${label}] aggregated ${records.length} hexagons in ${((t1 - t0) / 1000).toFixed(1)}s (peak RSS ${(Deno.memoryUsage().rss / 1e6).toFixed(0)}MB)`)

      const { datasetId, featureCount } = await writeExposureDataset(
        config.sourceName,
        entry.countryCode,
        'population_count',
        records.map((r) => ({ geometry: r.geometry, metricValue: r.populationCount, properties: r.properties })),
      )
      console.log(`[${label}] wrote dataset ${datasetId} (${featureCount} features)`)
      succeeded += 1
      outcomesBySource.set(entry.source, true)
    } catch (e) {
      console.error(`[${label}] FAILED: ${e instanceof Error ? e.message : e}`)
      failed.push(label)
    }
  }

  // One recordFetchOutcome per distinct source type present in the manifest
  // (success if at least one of its countries succeeded this run) — matches
  // import-ghsl.ts's one-call-per-run convention, just grouped by source
  // since this file's manifest can mix meta_hdx/ghsl/worldpop entries.
  for (const [source, anySucceeded] of outcomesBySource) {
    const { hazardType, name } = DATA_SOURCE_NAMES[source]
    const sourceId = await resolveSourceId(hazardType, name)
    if (sourceId) await recordFetchOutcome(sourceId, anySucceeded ? 'success' : 'failure')
  }

  console.log(`\n=== DONE: ${succeeded}/${manifest.length} succeeded ===`)
  if (failed.length > 0) {
    throw new Error(`Failed: ${failed.join(', ')}`)
  }
}

if (import.meta.main) {
  try {
    await runMetaImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
