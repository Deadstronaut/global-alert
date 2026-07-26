/**
 * GloFAS river discharge forecast importer (NEW_GAME_PLAN.md §4.2/§4.5b).
 * EWDS (submit -> poll -> download) -> netcdf-service (NetCDF -> GeoTIFF,
 * GDAL) -> per-pixel exposure features -> writeExposureDataset. Ties
 * together three pieces built earlier the same day:
 *   - supabase/functions/shared/ewdsClient.ts (EWDS REST client, auth
 *     layer live-verified against the real API with a bogus token — never
 *     tested with a real one, no EWDS account existed as of 2026-07-22)
 *   - netcdf-service (GDAL conversion container, ad-hoc sourceUrl mode)
 *   - gdoAnomalyFetch.ts's simplifyGeometry (Douglas-Peucker boundary
 *     simplification) is imported rather than duplicated a third time —
 *     duplicating that specific algorithm would be pure risk for no
 *     benefit. Pixel-to-feature geometry itself (2026-07-26 consistency
 *     pass) goes through rasterToHexagon.ts's shared H3-hexagon aggregator
 *     instead of a hand-rolled rectangle-per-pixel loop — matches GHSL/
 *     WorldPop/CHIRPS/GDO anomaly, see rasterSourceConfig.ts's
 *     GLOFAS_SOURCE_CONFIG.
 *
 * ✅ VERIFIED END-TO-END 2026-07-22 with a real EWDS token: all 3 served
 * countries succeeded (tr/mg/my), GLOFAS_NETCDF_VARIABLE_NAME="dis24" was
 * confirmed correct (GDAL opened it without error). One external gotcha
 * hit along the way: EWDS returns HTTP 403 "required licences not
 * accepted" until the account owner accepts the cems-glofas-forecast
 * dataset's licence at https://ewds.climate.copernicus.eu/datasets/
 * cems-glofas-forecast?tab=download#manage-licences — a one-time
 * per-account step, not a code issue.
 *
 * Run manually: `docker compose run --rm glofas-importer` (needs
 * EWDS_API_KEY — see server/.env.local.example) or scheduled daily via
 * `glofas-importer-scheduled` (cron.ts's "glofas" job, 04:00 UTC).
 */
import { submitEwdsJob, waitForEwdsJob, getEwdsJobAsset } from '../supabase/functions/shared/ewdsClient.ts'
import { getServedCountryCodes } from '../supabase/functions/shared/servedCountries.ts'
import { simplifyGeometry } from '../supabase/functions/shared/gdoAnomalyFetch.ts'
import { writeExposureDataset } from '../supabase/functions/shared/writeExposureDataset.ts'
import { recordFetchOutcome, resolveSourceId } from '../supabase/functions/shared/sourceHealth.ts'
// 2026-07-26 consistency pass: geometry switched from a hand-drawn
// one-rectangle-per-pixel polygon to real H3 hexagons, matching GHSL/
// WorldPop/CHIRPS/GDO anomaly — see rasterSourceConfig.ts's
// GLOFAS_SOURCE_CONFIG and gdoAnomalyFetch.ts's equivalent 2026-07-26
// comment for the same reasoning (this file runs in a container, not an
// Edge Function, so h3-js's import-graph cost never applied here anyway).
import { aggregateRasterToHexagonsFromImage } from '../supabase/functions/shared/rasterToHexagon.ts'
import { GLOFAS_SOURCE_CONFIG } from '../supabase/functions/shared/rasterSourceConfig.ts'

// data_sources.(hazard_type='flood', name='GloFAS/Copernicus') — seeded by
// 20260723000000_glofas_data_source.sql. Live-verified 2026-07-23: this
// file never called recordFetchOutcome before, so GloFAS didn't even show
// up as a row in the admin Sources tab despite writing real exposure data
// every run (caught auditing that tab against exposure_datasets).
const DATA_SOURCE_HAZARD_TYPE = 'flood'
const DATA_SOURCE_NAME = 'GloFAS/Copernicus'

const GLOFAS_NETCDF_VARIABLE_NAME = 'dis24' // live-verified correct 2026-07-22, see module header
const NETCDF_SERVICE_URL = Deno.env.get('NETCDF_SERVICE_URL') ?? 'http://netcdf-service:8000'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const EWDS_API_KEY = Deno.env.get('EWDS_API_KEY')

// Deliberately NOT validated at module top level (a bare `if (!x)
// Deno.exit(1)` here, as this file originally had): cron.ts imports
// runGlofasImport alongside runMetaImport/runGhslImport regardless of
// which job was actually selected via its CLI arg — live-verified
// 2026-07-22 that a module-load-time Deno.exit(1) in this file crash-
// loops meta-ghsl-importer-scheduled/ghsl-importer-scheduled too (neither
// sets EWDS_API_KEY, nor should they need to), since merely importing
// this file for its exported function already ran the check. Validated
// lazily inside runGlofasImport() instead, so only actually running the
// GloFAS job requires these env vars.
function requireEnv(): { supabaseUrl: string; serviceKey: string; ewdsApiKey: string } {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set')
  if (!EWDS_API_KEY) throw new Error('EWDS_API_KEY must be set (register for free at https://ewds.climate.copernicus.eu)')
  return { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY, ewdsApiKey: EWDS_API_KEY }
}

function geometryBoundingBox(geometry: GeoJSON.Geometry): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  const visit = (coords: unknown): void => {
    if (typeof (coords as number[])[0] === 'number') {
      const [lng, lat] = coords as [number, number]
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
      return
    }
    for (const c of coords as unknown[]) visit(c)
  }
  if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) {
      const [a, b, c, d] = geometryBoundingBox(g)
      if (a < minLng) minLng = a
      if (c > maxLng) maxLng = c
      if (b < minLat) minLat = b
      if (d > maxLat) maxLat = d
    }
  } else {
    // deno-lint-ignore no-explicit-any
    visit((geometry as any).coordinates)
  }
  return [minLng, minLat, maxLng, maxLat]
}

async function fetchCountryBoundary(countryCode: string): Promise<GeoJSON.Geometry> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/country_boundaries?country_code=eq.${countryCode}&select=geojson`,
    { headers: { apikey: SERVICE_KEY!, Authorization: `Bearer ${SERVICE_KEY}` } },
  )
  const rows = await res.json()
  if (!rows[0]) throw new Error(`No country_boundaries row for ${countryCode}`)
  const geojson = rows[0].geojson
  if (geojson.type === 'FeatureCollection') {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f: GeoJSON.Feature) => f.geometry) }
  }
  return geojson.type === 'Feature' ? geojson.geometry : geojson
}

function todayEwdsDateParts(): { year: string; month: string; day: string } {
  const now = new Date()
  return {
    year: String(now.getUTCFullYear()),
    month: String(now.getUTCMonth() + 1).padStart(2, '0'),
    day: String(now.getUTCDate()).padStart(2, '0'),
  }
}

async function processCountry(countryCode: string): Promise<void> {
  console.log(`[${countryCode}] fetching boundary...`)
  const boundary = await fetchCountryBoundary(countryCode)
  const [west, south, east, north] = geometryBoundingBox(boundary)
  const MARGIN_DEG = 0.5
  const bboxParam = `${west - MARGIN_DEG},${south - MARGIN_DEG},${east + MARGIN_DEG},${north + MARGIN_DEG}`

  console.log(`[${countryCode}] submitting EWDS job (cems-glofas-forecast)...`)
  const { year, month, day } = todayEwdsDateParts()
  const jobId = await submitEwdsJob('cems-glofas-forecast', {
    system_version: ['operational'],
    hydrological_model: ['lisflood'],
    product_type: ['control_forecast'],
    variable: 'river_discharge_in_the_last_24_hours',
    year: [year],
    month: [month],
    day: [day],
    leadtime_hour: ['24'],
    data_format: 'netcdf',
    download_format: 'unarchived',
    area: [north + MARGIN_DEG, west - MARGIN_DEG, south - MARGIN_DEG, east + MARGIN_DEG], // N,W,S,E per EWDS schema
  }, EWDS_API_KEY!)

  console.log(`[${countryCode}] job ${jobId} submitted, polling...`)
  await waitForEwdsJob(jobId, EWDS_API_KEY!, { pollIntervalMs: 15_000, timeoutMs: 20 * 60_000 })

  const asset = await getEwdsJobAsset(jobId, EWDS_API_KEY!)
  console.log(`[${countryCode}] asset ready: ${asset['file:size']} bytes, converting via netcdf-service...`)

  const convertUrl = `${NETCDF_SERVICE_URL}/convert?sourceUrl=${encodeURIComponent(asset.href)}&variableName=${GLOFAS_NETCDF_VARIABLE_NAME}&bandIndex=1&bbox=${bboxParam}`
  const convertRes = await fetch(convertUrl, { signal: AbortSignal.timeout(120_000) })
  if (!convertRes.ok) {
    const body = await convertRes.text().catch(() => '')
    throw new Error(`netcdf-service /convert failed: HTTP ${convertRes.status} ${body}`)
  }
  const tifBuffer = await convertRes.arrayBuffer()

  console.log(`[${countryCode}] parsing GeoTIFF (${tifBuffer.byteLength} bytes)...`)
  const { fromArrayBuffer } = await import('npm:geotiff@2.1.3')
  const tiff = await fromArrayBuffer(tifBuffer)
  const image = await tiff.getImage()
  const width: number = image.getWidth()
  const height: number = image.getHeight()
  if (width === 0 || height === 0) {
    console.log(`[${countryCode}] empty raster, skipping`)
    return
  }

  const [imgXmin, imgYmin, imgXmax, imgYmax] = image.getBoundingBox() as [number, number, number, number]
  const resX = (imgXmax - imgXmin) / width
  const resY = (imgYmax - imgYmin) / height
  const simplifiedBoundary = simplifyGeometry(boundary, Math.min(resX, resY) / 2)

  const hexRecords = await aggregateRasterToHexagonsFromImage(image, GLOFAS_SOURCE_CONFIG, simplifiedBoundary, countryCode)

  const features = hexRecords.map((r) => ({
    geometry: r.geometry,
    // populationCount is PopulationRasterRecord's generic value field (see
    // populationRasterRecord.ts) — holds discharge m³/s here, not a
    // headcount, per GLOFAS_SOURCE_CONFIG's pixelValueMeaning='mean'.
    metricValue: r.populationCount,
    properties: { source: 'glofas_river_discharge', h3Cell: r.properties.h3Cell },
  }))

  if (features.length === 0) {
    console.log(`[${countryCode}] no valid pixels within boundary, skipping write`)
    return
  }

  const { datasetId, featureCount } = await writeExposureDataset(
    'glofas_river_discharge',
    countryCode,
    'river_discharge_m3s',
    features,
    { sourceDataset: 'GloFAS forecast (cems-glofas-forecast, EWDS)', leadtimeHours: 24, hydrologicalModel: 'lisflood' },
  )
  console.log(`[${countryCode}] wrote dataset ${datasetId} (${featureCount} features)`)
}

/** Runs the GloFAS import once, for every served country. Throws (does not Deno.exit) on any failure — see import.ts/import-ghsl.ts's identical convention, needed so cron.ts's scheduled caller sees the failure instead of the process silently dying. */
export async function runGlofasImport(): Promise<void> {
  requireEnv()
  const servedCountryCodes = await getServedCountryCodes()
  let failed = 0
  for (const countryCode of servedCountryCodes) {
    try {
      await processCountry(countryCode)
    } catch (e) {
      console.error(`[${countryCode}] FAILED: ${e instanceof Error ? e.message : e}`)
      failed += 1
    }
  }
  console.log(`\n=== DONE: ${servedCountryCodes.length - failed}/${servedCountryCodes.length} succeeded ===`)

  const sourceId = await resolveSourceId(DATA_SOURCE_HAZARD_TYPE, DATA_SOURCE_NAME)
  if (sourceId) await recordFetchOutcome(sourceId, failed < servedCountryCodes.length ? 'success' : 'failure')

  if (failed > 0) throw new Error(`${failed}/${servedCountryCodes.length} countries failed`)
}

if (import.meta.main) {
  try {
    await runGlofasImport()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    Deno.exit(1)
  }
}
