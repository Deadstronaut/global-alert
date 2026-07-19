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
 */

import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { latLngToCell, cellToBoundary, cellToLatLng } from 'https://esm.sh/h3-js@4.1.0'
// deno-lint-ignore no-explicit-any
import booleanPointInPolygonImport from 'https://esm.sh/@turf/boolean-point-in-polygon@7'
import type { RasterSourceConfig } from './rasterSourceConfig.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

// deno-lint-ignore no-explicit-any
const booleanPointInPolygon = booleanPointInPolygonImport as any

const ROW_BLOCK_SIZE = 512

function isValidPixel(value: number, noData: number | null): boolean {
  if (!Number.isFinite(value)) return false
  if (value < 0) return false
  if (noData != null && value === noData) return false
  return true
}

// country_boundaries rows may be a FeatureCollection normalized into a
// GeometryCollection (hydroRiversFetch.ts's fetchCountryBoundary
// convention) or a plain Polygon/MultiPolygon — turf's
// booleanPointInPolygon only accepts the latter, so a GeometryCollection is
// checked sub-geometry by sub-geometry.
function pointWithinBoundary(point: [number, number], boundary: GeoJSON.Geometry): boolean {
  const pointFeature = { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: point } }
  if (boundary.type === 'GeometryCollection') {
    return boundary.geometries.some((geometry) => {
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return false
      try {
        return booleanPointInPolygon(pointFeature, geometry)
      } catch {
        return false
      }
    })
  }
  if (boundary.type !== 'Polygon' && boundary.type !== 'MultiPolygon') return false
  try {
    return booleanPointInPolygon(pointFeature, boundary)
  } catch {
    return false
  }
}

export async function aggregateRasterToHexagons(
  rasterBuffer: ArrayBuffer,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
): Promise<PopulationRasterRecord[]> {
  const tiff = await fromArrayBuffer(rasterBuffer)
  const image = await tiff.getImage()
  const width: number = image.getWidth()
  const height: number = image.getHeight()
  const [xmin, ymin, xmax, ymax] = image.getBoundingBox() as [number, number, number, number]
  const resX = (xmax - xmin) / width
  const resY = (ymax - ymin) / height
  const noData: number | null = image.getGDALNoData()

  const accumulator = new Map<string, number>()

  for (let rowStart = 0; rowStart < height; rowStart += ROW_BLOCK_SIZE) {
    const rowEnd = Math.min(rowStart + ROW_BLOCK_SIZE, height)
    const rasters = await image.readRasters({ window: [0, rowStart, width, rowEnd] })
    // deno-lint-ignore no-explicit-any
    const band = (rasters as any)[0] as ArrayLike<number>
    const blockHeight = rowEnd - rowStart

    for (let row = 0; row < blockHeight; row++) {
      const lat = ymax - (rowStart + row + 0.5) * resY
      for (let col = 0; col < width; col++) {
        const value = band[row * width + col]
        if (!isValidPixel(value, noData)) continue
        const lng = xmin + (col + 0.5) * resX
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
