/**
 * GDO/GPCC Standardized Precipitation Index (SPI-1) fetch module (spec 045
 * — "CHIRPS/SPI" line item, Data Sources Inventory §8, moved from
 * evaluated-but-not-integrated to live via a live-verified alternative).
 *
 * Live-verified 2026-07-20: the Global Drought Observatory's WCS 2.0.0
 * endpoint (drought.emergency.copernicus.eu/api/wcs?map=DO_WCS) serves
 * ready-made, per-request GeoTIFF coverages via GetCoverage — no NetCDF
 * parsing, no gamma-distribution fitting on our side, and it honours
 * server-side SUBSET=Lat(..)/Long(..) bbox cropping (confirmed: a
 * Turkey-sized bbox request returned a 3.8KB GeoTIFF vs. ~1MB unsubset).
 * coverageID=spcST/spcLT ("SPI CHIRPS Short/Long-term", per this same WCS's
 * own WMS GetCapabilities Title fields) are listed but return HTTP 500
 * ("Unable to fulfil WCS request") from GDO's own backend — CHIRPS-based
 * SPI is NOT actually servable through this API today. coverageID=spgTS
 * ("SPI GPCC") DOES work and is what this module uses instead.
 *
 * IMPORTANT — this is NOT a drop-in replacement for CHIRPS-SPI, confirmed
 * against GDO's own indicator factsheet (drought.emergency.copernicus.eu/
 * data/factsheets/factsheet_spi.pdf, Table 1):
 *   - Baseline period: GPCC uses 1981-2010; every other GDO SPI product
 *     (including CHIRPS, were it ever to start working) uses 1991-2020.
 *     Same month, different baseline → a different SPI value, not just a
 *     different resolution of the same number.
 *   - Spatial resolution: GPCC is 1.0° x 1.0° (~111km); CHIRPS is 0.05° x
 *     0.05° (~5.5km) — ~20x coarser. One GPCC grid cell covers roughly
 *     100+ of WorldPop/GHSL's H3 hexagons (resolution 6-7), so this layer
 *     reads as visibly "blocky" next to the population layers — expected,
 *     not a bug.
 *   - Update cadence: GPCC is monthly only, even for SPI-1 (CHIRPS/ERA5/CPC
 *     get a 10-daily rolling window for SPI-1/SPI-3).
 *   - Fit method: gamma distribution via L-moments (not maximum likelihood
 *     — corrects an earlier, wrong web-search-derived claim). Recorded here
 *     so a future from-scratch CHIRPS-SPI computation picks the same method
 *     GDO uses, for at least methodological (if not baseline) consistency.
 * All of the above is written into every dataset's exposure_datasets.
 * source_metadata (see buildSourceMetadata below) — deliberately NOT just a
 * code comment, so the admin UI (and any future consumer) can surface the
 * caveat without re-deriving it from GDO's PDF each time.
 *
 * fAPAR (the remaining item of the original "four": Meta, GHSL, CHIRPS/SPI,
 * EU GDO/fAPAR) is NOT covered by this module or this WCS — GDO only
 * exposes fAPAR anomaly as a WMS "quicklook" (rendered image, not raw
 * values); the only real values live in ~260MB/year NetCDF4/HDF5 bulk
 * archives (live-verified via HDF5 magic bytes) that need GDAL/xarray, i.e.
 * a genuinely separate Python service — see docker-compose.yml, which
 * already runs a persistent (non-serverless) Node "aggregator" container
 * this could sit alongside. Draft contract for whenever that gets built:
 * the Python service exposes one unauthenticated (internal-network-only)
 * `GET /convert?dataset=<id>&countryCode=<cc>&bbox=<w,s,e,n>` returning
 * either a GeoTIFF body (200) or `{ error: string }` (4xx/5xx) within a
 * ~60s timeout, matching this module's fetch-a-small-GeoTIFF contract
 * closely enough that the Edge Function side barely changes.
 */

import './workerPolyfill.ts'
import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { getServiceClient } from './upsert.ts'
import type { ExposureFeatureInput } from './writeExposureDataset.ts'

// Duplicated from rasterToHexagon.ts rather than imported: that module's
// top-level imports also pull in h3-js (for hexagon aggregation this
// function never uses) — live-verified 2026-07-20 that importing it here
// alone was enough to hit this Edge Function's WORKER_RESOURCE_LIMIT before
// any real work started, the same ceiling GHSL's attempt hit (spec 044).
// Dropping the unused h3-js from this function's import graph fixed it.
// Keep these two functions behaviorally identical to rasterToHexagon.ts's
// copies if either changes.
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

const WCS_BASE = 'https://drought.emergency.copernicus.eu/api/wcs'
const COVERAGE_ID = 'spgTS' // SPI GPCC, per this module's header comment
const SELECTED_TIMESCALE = '01' // SPI-1 (1-month accumulation)

export const GDO_SPI_SOURCE_METADATA = {
  sourceDataset: 'GDO SPI GPCC (spgTS), SPI-1',
  resolutionDeg: 1.0,
  baselinePeriod: '1981-2010',
  updateFrequency: 'monthly',
  fitMethod: 'gamma distribution, L-moments',
  accumulationMonths: 1,
  notEquivalentTo: 'CHIRPS-based SPI (0.05°, 1991-2020 baseline) — GDO does not currently serve a working CHIRPS SPI coverage via WCS',
  methodologyReference: 'https://drought.emergency.copernicus.eu/data/factsheets/factsheet_spi.pdf',
}

// GDO's own 7-class SPI classification (factsheet Table 2) — used for both
// exposure_features.properties.spiClass and .spiColor so the map layer can
// render GDO's own colour scheme rather than inventing a new one.
function classifySpi(value: number): { spiClass: string; spiColor: string } {
  if (value > 2.0) return { spiClass: 'extremely_wet', spiColor: '#800080' }
  if (value > 1.5) return { spiClass: 'very_wet', spiColor: '#dda0dd' }
  if (value > 1.0) return { spiClass: 'moderately_wet', spiColor: '#e6c9f0' }
  if (value > -1.0) return { spiClass: 'near_normal', spiColor: '#ffffff' }
  if (value > -1.5) return { spiClass: 'moderately_dry', spiColor: '#ffff00' }
  if (value > -2.0) return { spiClass: 'very_dry', spiColor: '#ffa500' }
  return { spiClass: 'extremely_dry', spiColor: '#ff0000' }
}

function isValidSpiPixel(value: number, noData: number | null): boolean {
  if (!Number.isFinite(value)) return false
  if (noData != null && value === noData) return false
  return true // unlike population pixels, negative SPI values are valid
}

// Same country_boundaries normalization repeated across worldPopFetch.ts/
// hydroRiversFetch.ts/ghslFetch.ts — this codebase's established convention
// is per-module duplication of this one small function rather than a shared
// abstraction (see those files' header comments).
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

async function fetchSpiGeoTiff(bbox: [number, number, number, number]): Promise<ArrayBuffer | null> {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const url = `${WCS_BASE}?map=DO_WCS&SERVICE=WCS&VERSION=2.0.0&REQUEST=GetCoverage` +
    `&coverageID=${COVERAGE_ID}&CRS=EPSG:4326&format=GEOTIFF&SELECTED_TIMESCALE=${SELECTED_TIMESCALE}` +
    `&SUBSET=Lat(${minLat},${maxLat})&SUBSET=Long(${minLng},${maxLng})`
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) {
    // GDO's WCS returns a JSON error body (not a GeoTIFF) on failure —
    // surface its message rather than a bare HTTP status.
    const body = await response.text().catch(() => '')
    throw new Error(`GDO WCS GetCoverage HTTP ${response.status}: ${body.slice(0, 200)}`)
  }
  const buffer = await response.arrayBuffer()
  return buffer.byteLength > 0 ? buffer : null
}

async function fetchOneCountry(countryCode: string): Promise<ExposureFeatureInput[] | null> {
  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[gdoSpiFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  const bbox = geometryBoundingBox(boundary)
  const rasterBuffer = await fetchSpiGeoTiff(bbox)
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
      if (!isValidSpiPixel(value, noData)) continue

      const cellMinLng = xmin + col * resX
      const cellMaxLng = xmin + (col + 1) * resX
      const centerLng = (cellMinLng + cellMaxLng) / 2
      if (!pointWithinBoundary([centerLng, centerLat], boundary)) continue

      const { spiClass, spiColor } = classifySpi(value)
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
        properties: { spiClass, spiColor, accumulationMonths: 1, source: 'gdo_spi' },
      })
    }
  }

  return features
}

export async function fetchGdoSpi(countryCodes: string[]): Promise<Map<string, ExposureFeatureInput[]>> {
  const results = new Map<string, ExposureFeatureInput[]>()
  for (const countryCode of countryCodes) {
    try {
      const features = await fetchOneCountry(countryCode)
      if (features && features.length > 0) results.set(countryCode, features)
    } catch (err) {
      // One country's failure must not block the rest — mirrors
      // ghslFetch.ts's per-country isolation convention.
      console.warn(`[gdoSpiFetch] ${countryCode} failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  return results
}
