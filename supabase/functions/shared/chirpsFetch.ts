/**
 * CHIRPS (Climate Hazards Center InfraRed Precipitation with Station data)
 * monthly rainfall fetch module. Live-verified 2026-07-26: UCSB's Climate
 * Hazards Center publishes a single global 0.05° GeoTIFF per month at a
 * predictable, no-auth URL —
 * https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/chirps-v2.0.{YYYY}.{MM}.tif.gz
 * (~14MB gzip). Unlike GHSL (ghslFetch.ts), this is ONE file covering the
 * whole globe, not a tile grid — no per-country tile selection or
 * border-merge step needed, the same decompressed buffer is cropped once
 * per served country by aggregateRasterToHexagons() itself.
 *
 * pixelValueMeaning='mean' (CHIRPS_SOURCE_CONFIG, rasterSourceConfig.ts) —
 * rainfall mm is not additive across a hexagon's pixels the way GHSL/
 * WorldPop's population counts are; rasterToHexagon.ts averages instead of
 * summing for this mode.
 */

import { getServiceClient } from './upsert.ts'
import { CHIRPS_SOURCE_CONFIG } from './rasterSourceConfig.ts'
import { aggregateRasterToHexagons } from './rasterToHexagon.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

function chirpsMonthlyUrl(year: number, month: number): string {
  const mm = String(month).padStart(2, '0')
  return `https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/chirps-v2.0.${year}.${mm}.tif.gz`
}

// CHIRPS occasionally lags a few days into a new month before publishing
// it — check the current month first, fall back up to 2 months back rather
// than failing outright.
async function resolveLatestChirpsUrl(): Promise<string> {
  const now = new Date()
  for (let monthsBack = 0; monthsBack <= 2; monthsBack++) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
    const url = chirpsMonthlyUrl(d.getFullYear(), d.getMonth() + 1)
    try {
      const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) })
      if (head.ok) return url
    } catch {
      // network hiccup on the HEAD probe — try the next fallback month
    }
  }
  throw new Error('No recent CHIRPS monthly file found (checked current month + 2 previous)')
}

async function downloadAndDecompress(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`CHIRPS download failed: HTTP ${response.status} (${url})`)
  if (!response.body) throw new Error(`CHIRPS download returned no body (${url})`)
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'))
  return await new Response(decompressed).arrayBuffer()
}

// Same country_boundaries normalization as ghslFetch.ts/worldPopFetch.ts's
// fetchCountryBoundary (each fetch module keeps its own copy — established
// convention in this codebase rather than a shared cross-module helper).
async function fetchCountryBoundary(countryCode: string): Promise<GeoJSON.Geometry | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson')
    .eq('country_code', countryCode)
    // See ghslFetch.ts's fetchCountryBoundary for why: district-level rows
    // added 2026-07-29 broke .maybeSingle() (multi-row -> PGRST116, treated
    // as "no boundary" here), silently no-opping this fetch since then.
    .eq('level', 'province')
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

export async function fetchChirpsRainfall(countryCodes: string[]): Promise<Map<string, PopulationRasterRecord[]>> {
  const url = await resolveLatestChirpsUrl()
  console.log(`[chirpsFetch] downloading ${url}`)
  const rasterBuffer = await downloadAndDecompress(url)

  const results = new Map<string, PopulationRasterRecord[]>()
  for (const countryCode of countryCodes) {
    const boundary = await fetchCountryBoundary(countryCode)
    if (!boundary) {
      console.warn(`[chirpsFetch] no country_boundaries row for ${countryCode}, skipping`)
      continue
    }
    // Same decompressed buffer reused per country — geotiff's fromArrayBuffer
    // only parses the TIFF header/IFD (cheap), actual pixel reads inside
    // aggregateRasterToHexagons are windowed/cropped to each country's bbox.
    const records = await aggregateRasterToHexagons(rasterBuffer, CHIRPS_SOURCE_CONFIG, boundary, countryCode)
    if (records.length > 0) results.set(countryCode, records)
  }
  return results
}
