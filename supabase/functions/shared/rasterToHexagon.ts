/**
 * Source-agnostic raster (GeoTIFF) -> H3 hexagon population aggregation
 * (spec 043 research.md §4-§6, FR-011). Takes an already-downloaded raster
 * buffer plus a RasterSourceConfig and a country boundary — does no
 * source-specific branching, so a future raster source (Meta/HDX
 * Population, GHSL) reuses this unchanged once it has its own fetch module
 * and config entry.
 *
 * Reads the raster in row-block windows (not the whole raster decoded into
 * memory at once, Constitution Principle VII) — for each valid (non-no-data,
 * finite, non-negative) pixel, buckets its center coordinate into an H3
 * cell and accumulates the pixel's value (a population *count*, already
 * summable per research.md §4 — no area-weighting needed). A hexagon that
 * never receives a valid pixel simply never appears in the accumulator —
 * there is no "hexagon with value 0" to explicitly exclude.
 *
 * After accumulation, each resulting hexagon's center is checked against
 * the served country's boundary — WorldPop's per-country rasters are
 * already clipped close to the country's extent by WorldPop themselves, so
 * this catches only the small edge-fringe case (research.md §6), not a
 * primary clip step.
 *
 * Pixel-space cropping to the country boundary's bounding box (added for
 * spec 044's GHSL attempt) is what makes a genuinely global raster source
 * usable at all: GHSL's whole-world 30-arcsecond GeoTIFF is ~43,200 x
 * 21,400 pixels — live-verified locally at ~2.5s per 512-row full-width
 * block (~100s for a full pass), and this function used to always read the
 * FULL width for every row block regardless of how small countryBoundary
 * actually is. Cropping to Madagascar's bbox first (a small country) cut
 * the pixels actually read to well under 1% of the whole raster. WorldPop/
 * Kontur's existing per-country-clipped rasters are unaffected in
 * practice — their bbox already covers ~the whole small raster, so this is
 * a no-op-sized optimization for them, not a behavior change.
 *
 * Found live-testing spec 044's GHSL attempt: importing geotiff.js crashed
 * every function that used it (including the pre-existing, unmodified
 * import-worldpop — this was never actually working) with "ReferenceError:
 * Worker is not defined" — see workerPolyfill.ts, which this file must
 * import FIRST (before the geotiff import below) to fix it.
 */
import './workerPolyfill.ts'
import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { latLngToCell, cellToBoundary, cellToLatLng } from 'https://esm.sh/h3-js@4.1.0'
import type { RasterSourceConfig } from './rasterSourceConfig.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const ROW_BLOCK_SIZE = 512

// Standard ray-casting point-in-polygon (handles holes: a point inside an
// odd number of rings — the outer ring plus any hole rings — is inside).
// Replaces @turf/boolean-point-in-polygon (removed live-testing spec 044's
// GHSL attempt, trying to reduce this function's baseline memory footprint
// against a deployed Edge Function memory ceiling that a bare Worker-fixed
// geotiff+h3-js+turf+supabase-js import graph was hitting within ~7s,
// before any real per-tile work even started).
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
  for (let i = 1; i < coordinates.length; i++) {
    if (pointInRing(point, coordinates[i])) return false // inside a hole
  }
  return true
}

function pointInMultiPolygon(point: [number, number], coordinates: number[][][][]): boolean {
  return coordinates.some((polygon) => pointInPolygon(point, polygon))
}

function isValidPixel(value: number, noData: number | null): boolean {
  if (!Number.isFinite(value)) return false
  if (value < 0) return false
  if (noData != null && value === noData) return false
  return true
}

// country_boundaries rows may be a FeatureCollection normalized into a
// GeometryCollection (hydroRiversFetch.ts's fetchCountryBoundary
// convention) or a plain Polygon/MultiPolygon — a GeometryCollection is
// checked sub-geometry by sub-geometry.
function pointWithinBoundary(point: [number, number], boundary: GeoJSON.Geometry): boolean {
  if (boundary.type === 'GeometryCollection') {
    return boundary.geometries.some((geometry) => {
      try {
        return pointWithinBoundary(point, geometry)
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

// Flattens any GeoJSON geometry (including a GeometryCollection, this
// codebase's normalized shape for a multi-feature country_boundaries row —
// see fetchCountryBoundary()) into a [minLng, minLat, maxLng, maxLat] box.
// Exported for unit testing without a live raster.
export function geometryBoundingBox(geometry: GeoJSON.Geometry): [number, number, number, number] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  const visit = (coords: unknown): void => {
    if (typeof coords[0] === 'number') {
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
      const [gMinLng, gMinLat, gMaxLng, gMaxLat] = geometryBoundingBox(g)
      if (gMinLng < minLng) minLng = gMinLng
      if (gMaxLng > maxLng) maxLng = gMaxLng
      if (gMinLat < minLat) minLat = gMinLat
      if (gMaxLat > maxLat) maxLat = gMaxLat
    }
  } else {
    // deno-lint-ignore no-explicit-any
    visit((geometry as any).coordinates)
  }
  return [minLng, minLat, maxLng, maxLat]
}

// deno-lint-ignore no-explicit-any
type GeotiffImage = any

// Shared by both entry points below: aggregateRasterToHexagons (Edge
// Function-facing, whole file already in memory as an ArrayBuffer) and
// aggregateRasterToHexagonsFromImage (container-facing, called with an
// image opened from a lazy/windowed source — see rasterToHexagonFile.ts —
// so a 12GB+ raster never has to fit in RAM at once, only one row-block
// at a time). Both call this function; the memory-usage difference comes
// entirely from how `image` was obtained, not from this loop.
export async function aggregateRasterToHexagonsFromImage(
  image: GeotiffImage,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
): Promise<PopulationRasterRecord[]> {
  const width: number = image.getWidth()
  const height: number = image.getHeight()
  const [xmin, ymin, xmax, ymax] = image.getBoundingBox() as [number, number, number, number]
  const resX = (xmax - xmin) / width
  const resY = (ymax - ymin) / height
  const noData: number | null = image.getGDALNoData()

  // Crop to the country boundary's bbox (+ a small margin so edge hexagons
  // straddling the boundary still get their full pixel neighborhood) before
  // reading any rows — see this function's header comment for why this
  // matters for a genuinely global raster.
  const MARGIN_DEG = 0.5
  const [bMinLng, bMinLat, bMaxLng, bMaxLat] = geometryBoundingBox(countryBoundary)
  const colStart = Math.max(0, Math.floor((bMinLng - MARGIN_DEG - xmin) / resX))
  const colEnd = Math.min(width, Math.ceil((bMaxLng + MARGIN_DEG - xmin) / resX))
  const rowStartClip = Math.max(0, Math.floor((ymax - (bMaxLat + MARGIN_DEG)) / resY))
  const rowEndClip = Math.min(height, Math.ceil((ymax - (bMinLat - MARGIN_DEG)) / resY))
  const cropWidth = Math.max(0, colEnd - colStart)

  const accumulator = new Map<string, number>()

  for (let rowStart = rowStartClip; rowStart < rowEndClip; rowStart += ROW_BLOCK_SIZE) {
    const rowEnd = Math.min(rowStart + ROW_BLOCK_SIZE, rowEndClip)
    if (cropWidth === 0 || rowEnd <= rowStart) continue
    const rasters = await image.readRasters({ window: [colStart, rowStart, colEnd, rowEnd] })
    // deno-lint-ignore no-explicit-any
    const band = (rasters as any)[0] as ArrayLike<number>
    const blockHeight = rowEnd - rowStart

    for (let row = 0; row < blockHeight; row++) {
      const lat = ymax - (rowStart + row + 0.5) * resY
      for (let col = 0; col < cropWidth; col++) {
        const value = band[row * cropWidth + col]
        if (!isValidPixel(value, noData)) continue
        const lng = xmin + (colStart + col + 0.5) * resX
        const cell = latLngToCell(lat, lng, config.h3Resolution)
        accumulator.set(cell, (accumulator.get(cell) ?? 0) + value)
      }
    }
  }

  const records: PopulationRasterRecord[] = []
  for (const [cell, populationCount] of accumulator) {
    const [centerLat, centerLng] = cellToLatLng(cell) as [number, number]
    if (!pointWithinBoundary([centerLng, centerLat], countryBoundary)) continue

    const boundary = cellToBoundary(cell, true) as [number, number][]
    records.push({
      geometry: { type: 'Polygon', coordinates: [[...boundary, boundary[0]]] },
      populationCount,
      countryCode,
      properties: { h3Cell: cell, source: config.sourceName },
    })
  }

  return records
}

// Edge Function-facing entry point (WorldPop/GHSL/GDO SPI today): the
// whole raster must already be downloaded into memory as an ArrayBuffer,
// since Supabase's Edge Runtime has no local filesystem to stream from.
// This is exactly the shape that hits WORKER_RESOURCE_LIMIT on anything
// GHSL/Meta-sized — see rasterToHexagonFile.ts for the disk-streaming
// alternative meant for a persistent container instead.
export async function aggregateRasterToHexagons(
  rasterBuffer: ArrayBuffer,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
): Promise<PopulationRasterRecord[]> {
  const tiff = await fromArrayBuffer(rasterBuffer)
  const image = await tiff.getImage()
  return aggregateRasterToHexagonsFromImage(image, config, countryBoundary, countryCode)
}
