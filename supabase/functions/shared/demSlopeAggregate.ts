/**
 * DEM (elevation) GeoTIFF -> H3 hexagon slope aggregation, for landslide-
 * susceptibility cascade rules. Distinct from rasterToHexagon.ts because
 * slope is a *neighborhood* derivative (needs each pixel's 8 neighbors),
 * not an independent per-pixel value like population/rainfall — so this
 * reads a whole tile's elevation band into memory rather than streaming
 * row-blocks. A single Copernicus GLO-30 1-degree tile is 3600x3600 pixels
 * (~50MB as float32), comfortably container-sized (this only ever runs in
 * raster-importer, never an Edge Function — see rasterToHexagon.ts's header
 * for why that distinction matters on this project).
 *
 * Only pixels whose computed slope already clears `thresholdDeg` are ever
 * bucketed into a hexagon — this dataset represents "steep-terrain zones",
 * not "slope everywhere" (see rasterSourceConfig.ts's DEM_SLOPE_SOURCE_CONFIG
 * comment). A hexagon with no qualifying pixel simply never appears, same
 * convention as every other source in rasterToHexagon.ts.
 */
import './workerPolyfill.ts'
import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { latLngToCell, cellToBoundary, cellToLatLng } from 'https://esm.sh/h3-js@4.1.0'
import { geometryBoundingBox } from './rasterToHexagon.ts'
import type { RasterSourceConfig } from './rasterSourceConfig.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const METERS_PER_DEG_LAT = 110_540
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320

// Same ray-casting point-in-polygon as rasterToHexagon.ts (kept as a local
// copy rather than exported/shared, to keep that file's existing exports
// untouched for its own callers).
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

export async function aggregateSlopeToHexagons(
  rasterBuffer: ArrayBuffer,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
  thresholdDeg: number,
): Promise<PopulationRasterRecord[]> {
  const tiff = await fromArrayBuffer(rasterBuffer)
  const image = await tiff.getImage()
  const width: number = image.getWidth()
  const height: number = image.getHeight()
  const [xmin, ymin, xmax, ymax] = image.getBoundingBox() as [number, number, number, number]
  const resX = (xmax - xmin) / width
  const resY = (ymax - ymin) / height
  const noData: number | null = image.getGDALNoData()

  // Skip tiles that can't possibly overlap the country (cheap pre-check
  // before reading the whole band) — mirrors rasterToHexagon.ts's bbox crop,
  // just at whole-tile granularity since this function always reads a
  // single already-tile-sized raster in full.
  const [bMinLng, bMinLat, bMaxLng, bMaxLat] = geometryBoundingBox(countryBoundary)
  if (xmax < bMinLng - 1 || xmin > bMaxLng + 1 || ymax < bMinLat - 1 || ymin > bMaxLat + 1) {
    return []
  }

  const rasters = await image.readRasters()
  // deno-lint-ignore no-explicit-any
  const band = (rasters as any)[0] as ArrayLike<number>

  const isNoData = (v: number): boolean => !Number.isFinite(v) || (noData != null && v === noData)

  const sumByCell = new Map<string, number>()
  const countByCell = new Map<string, number>()

  // Horn's method (1981) 3x3 kernel — border pixels (row/col 0 or
  // width/height-1) are skipped rather than edge-clamped: they're covered
  // by the adjacent tile's own interior instead, so nothing is lost, just
  // computed from whichever tile has that pixel as an interior one.
  for (let row = 1; row < height - 1; row++) {
    const lat = ymax - (row + 0.5) * resY
    const metersPerDegLng = METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat * Math.PI) / 180)
    const cellsizeX = resX * metersPerDegLng
    const cellsizeY = resY * METERS_PER_DEG_LAT
    if (cellsizeX === 0 || cellsizeY === 0) continue

    for (let col = 1; col < width - 1; col++) {
      const z = (r: number, c: number): number => band[r * width + c]
      const nw = z(row - 1, col - 1), n = z(row - 1, col), ne = z(row - 1, col + 1)
      const w = z(row, col - 1), e = z(row, col + 1)
      const sw = z(row + 1, col - 1), s = z(row + 1, col), se = z(row + 1, col + 1)
      if ([nw, n, ne, w, e, sw, s, se].some(isNoData)) continue

      const dzdx = (ne + 2 * e + se - (nw + 2 * w + sw)) / (8 * cellsizeX)
      const dzdy = (sw + 2 * s + se - (nw + 2 * n + ne)) / (8 * cellsizeY)
      const slopeDeg = (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI
      if (slopeDeg < thresholdDeg) continue

      const lng = xmin + (col + 0.5) * resX
      const cell = latLngToCell(lat, lng, config.h3Resolution)
      sumByCell.set(cell, (sumByCell.get(cell) ?? 0) + slopeDeg)
      countByCell.set(cell, (countByCell.get(cell) ?? 0) + 1)
    }
  }

  const records: PopulationRasterRecord[] = []
  for (const [cell, sum] of sumByCell) {
    const [centerLat, centerLng] = cellToLatLng(cell) as [number, number]
    if (!pointWithinBoundary([centerLng, centerLat], countryBoundary)) continue
    const meanSlopeDeg = sum / (countByCell.get(cell) ?? 1)
    const boundary = cellToBoundary(cell, true) as [number, number][]
    records.push({
      geometry: { type: 'Polygon', coordinates: [[...boundary, boundary[0]]] },
      populationCount: meanSlopeDeg,
      countryCode,
      properties: { h3Cell: cell, source: config.sourceName },
    })
  }
  return records
}
