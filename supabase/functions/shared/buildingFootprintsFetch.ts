/**
 * Building footprints fetch module (spec 050 US3) — Microsoft's "Global ML
 * Building Footprints" dataset (free, public, no-auth — see spec 050's
 * research.md §3 for why this was chosen over live Overpass queries at
 * country scale). Index CSV lists one row per (country, quadkey) tile;
 * each tile is itself a gzip-compressed **newline-delimited GeoJSON**
 * file (despite the ".csv.gz" extension — live-verified 2026-07-28, every
 * line is a bare `{"type":"Feature",...}` object, not actual CSV).
 *
 * Turkey alone is ~20M+ buildings across 266 tiles (~1.7GB compressed) —
 * far too many to store one row per building (this project's exposure_
 * features convention elsewhere, e.g. osm-buildings' one-row-per-facility,
 * assumes tens of thousands of rows, not tens of millions). Aggregated into
 * H3 hexagons (building COUNT per cell) instead, the same shape as
 * population rasters — metric_property_name='building_count', resolution 7
 * to match WorldPop's own choice for a comparably-scaled density metric.
 */
import './workerPolyfill.ts'
import { latLngToCell, cellToBoundary, cellToLatLng } from 'https://esm.sh/h3-js@4.1.0'
import { getServiceClient } from './upsert.ts'
import { geometryBoundingBox } from './rasterToHexagon.ts'
import { BUILDING_FOOTPRINTS_SOURCE_CONFIG } from './rasterSourceConfig.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const DATASET_INDEX_URL = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'

// Microsoft's own "Location" column value per served country — verified
// live against the real index (2026-07-28): Turkey 266 tiles, Madagascar
// 140 tiles, Malaysia 98 tiles.
const COUNTRY_TO_REGION_NAME: Record<string, string> = {
  tr: 'Turkey',
  mg: 'Madagascar',
  my: 'Malaysia',
}

// Same ray-casting point-in-polygon as demSlopeAggregate.ts (kept as a
// local copy for the same reason that file gives — a shared export would
// touch rasterToHexagon.ts's own callers for no benefit).
function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}
function pointInPolygon(point: [number, number], coordinates: number[][][]): boolean {
  if (coordinates.length === 0) return false
  if (!pointInRing(point, coordinates[0])) return false
  for (let i = 1; i < coordinates.length; i++) if (pointInRing(point, coordinates[i])) return false
  return true
}
function pointInMultiPolygon(point: [number, number], coordinates: number[][][][]): boolean {
  return coordinates.some((polygon) => pointInPolygon(point, polygon))
}
function pointWithinBoundary(point: [number, number], boundary: GeoJSON.Geometry): boolean {
  if (boundary.type === 'GeometryCollection') {
    return boundary.geometries.some((g) => {
      try {
        return pointWithinBoundary(point, g)
      } catch {
        return false
      }
    })
  }
  try {
    if (boundary.type === 'Polygon') return pointInPolygon(point, boundary.coordinates as number[][][])
    if (boundary.type === 'MultiPolygon') return pointInMultiPolygon(point, boundary.coordinates as number[][][][])
  } catch {
    return false
  }
  return false
}

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
  if (geojson.type === 'Feature') return (geojson as unknown as GeoJSON.Feature).geometry
  return geojson as unknown as GeoJSON.Geometry
}

interface TileRef {
  quadkey: string
  url: string
}

// Parses the index CSV (Location,QuadKey,Url,Size,UploadDate) without a CSV
// library — every field here is a plain token (no embedded commas/quotes in
// any real row, live-verified), so a naive split is safe and avoids pulling
// in a dependency for a single startup-time file.
async function resolveTilesForCountry(countryCode: string): Promise<TileRef[]> {
  const regionName = COUNTRY_TO_REGION_NAME[countryCode]
  if (!regionName) return []
  const response = await fetch(DATASET_INDEX_URL, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`dataset index HTTP ${response.status}`)
  const text = await response.text()
  const tiles: TileRef[] = []
  for (const line of text.split('\n')) {
    const [location, quadkey, url] = line.split(',')
    if (location === regionName && url) tiles.push({ quadkey, url: url.trim() })
  }
  return tiles
}

async function downloadAndParseTile(url: string): Promise<GeoJSON.Feature[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const decompressed = response.body!.pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(decompressed).text()
  const features: GeoJSON.Feature[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      features.push(JSON.parse(line))
    } catch {
      // one malformed line must not fail the whole tile
    }
  }
  return features
}

function polygonCentroid(geometry: GeoJSON.Geometry): [number, number] | null {
  const ring = geometry.type === 'Polygon'
    ? (geometry as GeoJSON.Polygon).coordinates[0]
    : geometry.type === 'MultiPolygon'
      ? (geometry as GeoJSON.MultiPolygon).coordinates[0][0]
      : null
  if (!ring || ring.length === 0) return null
  const sum = ring.reduce((acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat], [0, 0])
  return [sum[0] / ring.length, sum[1] / ring.length]
}

const DOWNLOAD_RETRIES = 3
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000]
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchOneCountry(countryCode: string): Promise<PopulationRasterRecord[] | null> {
  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[buildingFootprintsFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }
  const bboxForLog = geometryBoundingBox(boundary) // sanity/logging only, no crop needed (tiles are already country-scoped)
  console.log(`[buildingFootprintsFetch] ${countryCode}: bbox ${bboxForLog.join(',')}`)

  const tiles = await resolveTilesForCountry(countryCode)
  console.log(`[buildingFootprintsFetch] ${countryCode}: ${tiles.length} tiles to process`)

  const accumulator = new Map<string, number>()

  for (const tile of tiles) {
    let features: GeoJSON.Feature[] | null = null
    let lastError: unknown
    for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt++) {
      try {
        features = await downloadAndParseTile(tile.url)
        break
      } catch (e) {
        lastError = e
        if (attempt < DOWNLOAD_RETRIES) await sleep(RETRY_DELAYS_MS[attempt])
      }
    }
    if (!features) {
      console.warn(`[buildingFootprintsFetch] tile ${tile.quadkey} failed for ${countryCode}: ${lastError instanceof Error ? lastError.message : lastError}`)
      continue
    }

    for (const feature of features) {
      const centroid = polygonCentroid(feature.geometry)
      if (!centroid) continue
      const [lng, lat] = centroid
      if (!pointWithinBoundary([lng, lat], boundary)) continue
      const cell = latLngToCell(lat, lng, BUILDING_FOOTPRINTS_SOURCE_CONFIG.h3Resolution)
      accumulator.set(cell, (accumulator.get(cell) ?? 0) + 1)
    }
    console.log(`[buildingFootprintsFetch] ${countryCode}: processed tile ${tile.quadkey} (${features.length} buildings), ${accumulator.size} hexagons so far`)
  }

  if (accumulator.size === 0) return null
  const records: PopulationRasterRecord[] = []
  for (const [cell, count] of accumulator) {
    const [centerLat, centerLng] = cellToLatLng(cell) as [number, number]
    const boundaryRing = cellToBoundary(cell, true) as [number, number][]
    records.push({
      geometry: { type: 'Polygon', coordinates: [[...boundaryRing, boundaryRing[0]]] },
      populationCount: count,
      countryCode,
      properties: { h3Cell: cell, source: BUILDING_FOOTPRINTS_SOURCE_CONFIG.sourceName },
    })
  }
  return records
}

export async function fetchBuildingFootprints(countryCodes: string[]): Promise<Map<string, PopulationRasterRecord[]>> {
  const results = new Map<string, PopulationRasterRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
