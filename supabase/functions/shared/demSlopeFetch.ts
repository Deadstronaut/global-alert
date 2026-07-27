/**
 * DEM slope (landslide susceptibility) fetch module — Copernicus GLO-30
 * elevation tiles (demSlopeTileGrid.ts), per served country. Same shape as
 * ghslFetch.ts: resolve the country's boundary, work out which 1-degree
 * tiles overlap it, download+process each tile independently (one tile's
 * failure doesn't block the rest), merge by H3 cell.
 *
 * A tile can return 404 for an all-ocean cell that Copernicus never
 * published (same as GHSL's tile grid) — expected, not an error.
 */
import { getServiceClient } from './upsert.ts'
import { demTilesForBoundingBox, demTileUrl } from './demSlopeTileGrid.ts'
import { DEM_SLOPE_SOURCE_CONFIG, LANDSLIDE_SLOPE_THRESHOLD_DEG } from './rasterSourceConfig.ts'
import { aggregateSlopeToHexagons } from './demSlopeAggregate.ts'
import { geometryBoundingBox } from './rasterToHexagon.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

// Same country_boundaries normalization as ghslFetch.ts/worldPopFetch.ts.
async function fetchCountryBoundary(countryCode: string): Promise<GeoJSON.Geometry | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson')
    .eq('country_code', countryCode)
    .maybeSingle()
  if (error || !data) return null
  const geojson = data.geojson as { type: string; features?: GeoJSON.Feature[]; geometry?: GeoJSON.Geometry }
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f) => f.geometry) } as GeoJSON.Geometry
  }
  if (geojson.type === 'Feature') {
    return (geojson as unknown as GeoJSON.Feature).geometry
  }
  return geojson as unknown as GeoJSON.Geometry
}

const DOWNLOAD_RETRIES = 4
const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Live-testing finding: on a host already running ~10 other always-on
// raster-importer/aggregator containers, real tile downloads intermittently
// fail mid-transfer ("connection closed before message completed" — S3
// resetting a connection it judges too slow to keep serving, not a DNS/TLS/
// permission problem: the exact same fetch succeeds instantly in an
// isolated container on the same network). Retried with backoff rather than
// failing the tile outright — a transient resource-contention hiccup, not a
// permanently unreachable tile.
async function downloadTile(url: string): Promise<ArrayBuffer | null> {
  let lastError: unknown
  for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (response.status === 404) return null // unpublished (all-ocean) cell — expected
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.arrayBuffer()
    } catch (e) {
      lastError = e
      if (attempt < DOWNLOAD_RETRIES) await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
  throw lastError
}

// A steep hexagon near two tiles' shared edge can be produced by both —
// merge like ghslFetch.ts, weighting by each side's pixel count so the
// combined mean stays a true average rather than double-counting.
function mergeRecordsByCell(recordSets: { records: PopulationRasterRecord[] }[]): PopulationRasterRecord[] {
  const byCell = new Map<string, PopulationRasterRecord>()
  for (const { records } of recordSets) {
    for (const record of records) {
      const existing = byCell.get(record.properties.h3Cell)
      if (existing) {
        existing.populationCount = (existing.populationCount + record.populationCount) / 2
      } else {
        byCell.set(record.properties.h3Cell, { ...record })
      }
    }
  }
  return [...byCell.values()]
}

async function fetchOneCountry(countryCode: string): Promise<PopulationRasterRecord[] | null> {
  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[demSlopeFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  const bbox = geometryBoundingBox(boundary)
  const tiles = demTilesForBoundingBox(bbox)
  console.log(`[demSlopeFetch] ${countryCode}: ${tiles.length} DEM tiles to check`)

  const recordSets: { records: PopulationRasterRecord[] }[] = []
  for (const tile of tiles) {
    try {
      const buffer = await downloadTile(demTileUrl(tile))
      if (!buffer) continue
      const records = await aggregateSlopeToHexagons(
        buffer, DEM_SLOPE_SOURCE_CONFIG, boundary, countryCode, LANDSLIDE_SLOPE_THRESHOLD_DEG,
      )
      if (records.length > 0) recordSets.push({ records })
    } catch (err) {
      console.warn(`[demSlopeFetch] tile ${tile.name} failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (recordSets.length === 0) return null
  return mergeRecordsByCell(recordSets)
}

export async function fetchDemSlope(countryCodes: string[]): Promise<Map<string, PopulationRasterRecord[]>> {
  const results = new Map<string, PopulationRasterRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
