/**
 * GDO Soil Moisture Anomaly + FAPAR Anomaly fetch module (spec 047 pivot,
 * 2026-07-22 — see NEW_GAME_PLAN.md §4.5).
 *
 * spec 047 assumed both indicators were NetCDF4/HDF5-only and needed a new
 * Python/GDAL service to parse. Live-verified 2026-07-22 that's WRONG:
 * the same WCS 2.0.0 endpoint gdoSpiFetch.ts already uses for SPI also
 * serves both of these as ready-made per-request GeoTIFF coverages —
 *   - `smand` — "Ensemble Soil Moisture Anomaly" (global, 0.1°, DescribeCoverage
 *     bbox lat -60..90 / lon -180..180) — confirmed working via GetCoverage.
 *   - `fpanv` — "fAPAR Anomaly (VIIRS)" (near-global, 0.0833°, bbox lat
 *     -55.92..48.33 / lon -180..180) — confirmed working via GetCoverage.
 *   (`smian`, the higher-res EDO/Europe-extent soil moisture anomaly
 *   product, was also found but its bbox — lat 22.75..72.25 — doesn't
 *   cover Madagascar or Malaysia, so `smand` was chosen for full
 *   served-country coverage instead. `smang` exists in GDO's WMS
 *   capabilities but its WCS GetCoverage returns HTTP 500 — unusable.)
 * No NetCDF parsing, no Python/GDAL service needed for either — this
 * closes spec 047's User Story 1 (P1/MVP) entirely via the existing
 * Deno/geotiff.js pipeline, the same way gdoSpiFetch.ts closed SPI.
 * spec 047's remaining real motivation is GloFAS's GRIB2/NetCDF (see
 * NEW_GAME_PLAN.md §4.2), a genuinely different problem — no WCS
 * shortcut was found for that one.
 *
 * Unlike SPI, GDO's own factsheets don't publish a classification table
 * for either anomaly product (checked — no equivalent of SPI's Table 2
 * 7-class scheme was found), so this stores the raw anomaly value only,
 * no derived class/color properties.
 *
 * Structurally near-identical to gdoSpiFetch.ts (same WCS request shape,
 * same per-module-duplicated point-in-polygon/bbox helpers — this
 * codebase's established convention, see that file's header) but the two
 * indicators are similar enough to each other (one band, no
 * classification, global-ish extent) to share ONE generic implementation
 * parametrized by GdoAnomalyConfig, rather than two near-duplicate files.
 */

import './workerPolyfill.ts'
import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { getServiceClient } from './upsert.ts'
import type { ExposureFeatureInput } from './writeExposureDataset.ts'

// Duplicated from rasterToHexagon.ts / gdoSpiFetch.ts rather than imported
// — see gdoSpiFetch.ts's header comment for why (h3-js import-graph cost).
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

function geometryBoundingBox(geometry: GeoJSON.Geometry): [number, number, number, number] {
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

// Live-verified 2026-07-22: without this, fetchOneCountry's per-pixel
// pointWithinBoundary check is computationally infeasible for these two
// sources — a full point-in-ring test runs against Madagascar's raw
// boundary (~700KB of GeoJSON, tens of thousands of vertices) for EVERY
// raster pixel. gdoSpiFetch.ts's identical check never hit this because
// SPI's coverage is 1.0° resolution (a handful of pixels per country);
// smand (0.1°) and fpanv (0.0833°) are 100-150x finer, multiplying pixel
// count by the same factor and making the naive O(pixels × vertices)
// cost minutes-to-hours instead of milliseconds (live-verified: a single-
// country, single-source test against unsimplified Madagascar hung for
// 90s+ with no result). Simplifying the boundary ONCE per country (not
// per pixel) to a tolerance tied to the raster's own pixel size is the
// fix — coastline detail finer than one grid cell can't change which
// cell a point falls into anyway, so this loses no meaningful accuracy
// for this specific bulk-classification use, unlike a general-purpose
// boundary simplification would.
function perpendicularDistance(point: [number, number], lineStart: [number, number], lineEnd: [number, number]): number {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const clampedT = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + clampedT * dx), y - (y1 + clampedT * dy))
}

export function douglasPeucker(points: number[][], tolerance: number): number[][] {
  if (points.length < 3) return points
  let maxDist = 0
  let index = 0
  const end = points.length - 1
  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i] as [number, number], points[0] as [number, number], points[end] as [number, number])
    if (dist > maxDist) {
      maxDist = dist
      index = i
    }
  }
  if (maxDist > tolerance) {
    const left = douglasPeucker(points.slice(0, index + 1), tolerance)
    const right = douglasPeucker(points.slice(index), tolerance)
    return left.slice(0, -1).concat(right)
  }
  return [points[0], points[end]]
}

// A simplified ring under 4 points isn't a valid closed polygon ring
// (needs at least a triangle + closing point) — falls back to the
// original ring for that (rare, tiny-island-sized) case rather than
// producing a broken/degenerate shape.
function simplifyRing(ring: number[][], tolerance: number): number[][] {
  const simplified = douglasPeucker(ring, tolerance)
  return simplified.length >= 4 ? simplified : ring
}

export function simplifyGeometry(geometry: GeoJSON.Geometry, tolerance: number): GeoJSON.Geometry {
  if (geometry.type === 'GeometryCollection') {
    return { type: 'GeometryCollection', geometries: geometry.geometries.map((g) => simplifyGeometry(g, tolerance)) }
  }
  if (geometry.type === 'Polygon') {
    return { type: 'Polygon', coordinates: geometry.coordinates.map((ring) => simplifyRing(ring, tolerance)) }
  }
  if (geometry.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: geometry.coordinates.map((poly) => poly.map((ring) => simplifyRing(ring, tolerance))) }
  }
  return geometry
}

export interface GdoAnomalyConfig {
  coverageId: string
  sourceName: string
  metricPropertyName: string
  sourceMetadata: Record<string, unknown>
}

export const GDO_SOIL_MOISTURE_ANOMALY_CONFIG: GdoAnomalyConfig = {
  coverageId: 'smand',
  sourceName: 'gdo_soil_moisture_anomaly',
  metricPropertyName: 'soil_moisture_anomaly',
  sourceMetadata: {
    sourceDataset: 'GDO Ensemble Soil Moisture Anomaly (smand)',
    resolutionDeg: 0.1,
    coverageExtent: 'global (lat -60 to 90)',
    classificationScheme: 'none published by GDO for this product — raw anomaly value only',
  },
}

export const GDO_FAPAR_ANOMALY_CONFIG: GdoAnomalyConfig = {
  coverageId: 'fpanv',
  sourceName: 'gdo_fapar_anomaly',
  metricPropertyName: 'fapar_anomaly',
  sourceMetadata: {
    sourceDataset: 'GDO fAPAR Anomaly, VIIRS (fpanv)',
    resolutionDeg: 0.0833,
    coverageExtent: 'near-global (lat -55.92 to 48.33)',
    classificationScheme: 'none published by GDO for this product — raw anomaly value only',
  },
}

const WCS_BASE = 'https://drought.emergency.copernicus.eu/api/wcs'

function isValidAnomalyPixel(value: number, noData: number | null): boolean {
  if (!Number.isFinite(value)) return false
  if (noData != null && value === noData) return false
  return true
}

// Same country_boundaries normalization repeated across this codebase's
// GDO/HDX fetch modules — see gdoSpiFetch.ts's header comment for why
// this is duplicated per-module rather than shared.
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

async function fetchAnomalyGeoTiff(coverageId: string, bbox: [number, number, number, number]): Promise<ArrayBuffer | null> {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const url = `${WCS_BASE}?map=DO_WCS&SERVICE=WCS&VERSION=2.0.0&REQUEST=GetCoverage` +
    `&coverageID=${coverageId}&CRS=EPSG:4326&format=GEOTIFF` +
    `&SUBSET=Lat(${minLat},${maxLat})&SUBSET=Long(${minLng},${maxLng})`
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    // GDO's WCS returns a JSON error body (not a GeoTIFF) on failure —
    // surface its message rather than a bare HTTP status, matching
    // gdoSpiFetch.ts's convention.
    const body = await response.text().catch(() => '')
    throw new Error(`GDO WCS GetCoverage HTTP ${response.status} (coverageID=${coverageId}): ${body.slice(0, 200)}`)
  }
  const buffer = await response.arrayBuffer()
  return buffer.byteLength > 0 ? buffer : null
}

async function fetchOneCountry(config: GdoAnomalyConfig, countryCode: string): Promise<ExposureFeatureInput[] | null> {
  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[gdoAnomalyFetch:${config.sourceName}] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  const bbox = geometryBoundingBox(boundary)
  const rasterBuffer = await fetchAnomalyGeoTiff(config.coverageId, bbox)
  if (!rasterBuffer) return null

  const tiff = await fromArrayBuffer(rasterBuffer)
  const image = await tiff.getImage()
  const width: number = image.getWidth()
  const height: number = image.getHeight()
  if (width === 0 || height === 0) return null

  const [xmin, ymin, xmax, ymax] = image.getBoundingBox() as [number, number, number, number]
  const resX = (xmax - xmin) / width
  const resY = (ymax - ymin) / height
  const noData: number | null = image.getGDALNoData()

  // Simplified ONCE per country here, not per pixel — see this file's
  // "Live-verified 2026-07-22" comment above simplifyGeometry for why this
  // is required, not an optional optimization, at this resolution.
  const simplifiedBoundary = simplifyGeometry(boundary, Math.min(resX, resY) / 2)

  const rasters = await image.readRasters()
  // deno-lint-ignore no-explicit-any
  const band = (rasters as any)[0] as ArrayLike<number>

  const features: ExposureFeatureInput[] = []
  for (let row = 0; row < height; row++) {
    const cellMinLat = ymax - (row + 1) * resY
    const cellMaxLat = ymax - row * resY
    const centerLat = (cellMinLat + cellMaxLat) / 2
    for (let col = 0; col < width; col++) {
      const value = band[row * width + col]
      if (!isValidAnomalyPixel(value, noData)) continue

      const cellMinLng = xmin + col * resX
      const cellMaxLng = xmin + (col + 1) * resX
      const centerLng = (cellMinLng + cellMaxLng) / 2
      if (!pointWithinBoundary([centerLng, centerLat], simplifiedBoundary)) continue

      features.push({
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [cellMinLng, cellMinLat], [cellMaxLng, cellMinLat],
            [cellMaxLng, cellMaxLat], [cellMinLng, cellMaxLat],
            [cellMinLng, cellMinLat],
          ]],
        },
        metricValue: value,
        properties: { source: config.sourceName },
      })
    }
  }

  return features
}

export async function fetchGdoAnomaly(config: GdoAnomalyConfig, countryCodes: string[]): Promise<Map<string, ExposureFeatureInput[]>> {
  const results = new Map<string, ExposureFeatureInput[]>()
  for (const countryCode of countryCodes) {
    try {
      const features = await fetchOneCountry(config, countryCode)
      if (features && features.length > 0) results.set(countryCode, features)
    } catch (err) {
      // One country's failure must not block the rest — mirrors
      // gdoSpiFetch.ts/ghslFetch.ts's per-country isolation convention.
      console.warn(`[gdoAnomalyFetch:${config.sourceName}] ${countryCode} failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  return results
}
