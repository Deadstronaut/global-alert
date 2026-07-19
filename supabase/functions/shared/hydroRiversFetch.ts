/**
 * HydroRIVERS fetch module (spec 041 US1). Unlike Overpass (per-country
 * query) or Kontur (per-country HDX package), HydroSHEDS distributes
 * HydroRIVERS as continent-scale shapefile ZIPs only — this module
 * downloads the relevant continent file per served country, unzips it,
 * streams the .shp/.dbf pair feature-by-feature (not loading the whole
 * continent into memory as GeoJSON at once — research.md §2), then clips to
 * that country's boundary (hydroshedsClip.ts) before returning results.
 *
 * A single country's failure (missing continent mapping, download error,
 * parse error) is caught and that country is simply omitted from the
 * returned map — never thrown — mirroring osmRoadsFetch.ts's FR-009
 * per-country isolation convention exactly.
 */

// @ts-expect-error - esm.sh's generated .d.ts for jszip lacks a default
// export declaration; the default export works fine at runtime (verified).
import JSZip from 'https://esm.sh/jszip@3.10.1'
import * as shapefile from 'https://esm.sh/shapefile@0.6.6'
import { getServiceClient } from './upsert.ts'
import { hydroshedsContinentForCountry } from './hydroshedsContinent.ts'
import { clipToCountryBoundary } from './hydroshedsClip.ts'
import type { RiverRecord } from './riverRecord.ts'

const HYDRORIVERS_BASE_URL = 'https://data.hydrosheds.org/file/HydroRIVERS'

async function fetchCountryBoundary(countryCode: string): Promise<GeoJSON.Geometry | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson')
    .eq('country_code', countryCode)
    .maybeSingle()
  if (error || !data) return null
  const geojson = data.geojson as { type: string; features?: GeoJSON.Feature[]; geometry?: GeoJSON.Geometry }
  // country_boundaries stores a FeatureCollection (per-ADM1-feature) in some
  // rows and a single Feature/Geometry in others (spec 040 T017's Madagascar
  // onboarding used a FeatureCollection) — normalize to one geometry a
  // clip check can use by unioning is unnecessary for a bbox+intersects
  // check: treating it as a GeometryCollection of all sub-geometries covers
  // both shapes without needing a true geometric union.
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f) => f.geometry) } as GeoJSON.Geometry
  }
  if (geojson.type === 'Feature') {
    return (geojson as unknown as GeoJSON.Feature).geometry
  }
  return geojson as unknown as GeoJSON.Geometry
}

async function downloadAndUnzipShapefile(continentCode: string): Promise<{ shp: ArrayBuffer; dbf: ArrayBuffer }> {
  const url = `${HYDRORIVERS_BASE_URL}/HydroRIVERS_v10_${continentCode}_shp.zip`
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) {
    throw new Error(`Failed to download HydroRIVERS ${continentCode}: HTTP ${response.status}`)
  }
  const zipBuffer = await response.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuffer)
  const files = zip.files as Record<string, { name: string; async: (type: string) => Promise<ArrayBuffer> }>

  const shpEntry = Object.values(files).find((f) => f.name.toLowerCase().endsWith('.shp'))
  const dbfEntry = Object.values(files).find((f) => f.name.toLowerCase().endsWith('.dbf'))
  if (!shpEntry || !dbfEntry) {
    throw new Error(`HydroRIVERS ${continentCode} ZIP is missing .shp/.dbf entries`)
  }

  const [shp, dbf] = await Promise.all([shpEntry.async('arraybuffer'), dbfEntry.async('arraybuffer')])
  return { shp, dbf }
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function lineLengthMeters(coordinates: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coordinates.length; i++) total += haversineMeters(coordinates[i - 1], coordinates[i])
  return total
}

async function fetchOneCountry(countryCode: string): Promise<RiverRecord[] | null> {
  const continentCode = hydroshedsContinentForCountry(countryCode)
  if (!continentCode) {
    console.warn(`[hydroRiversFetch] no HydroSHEDS continent mapping for ${countryCode}, skipping`)
    return null
  }

  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[hydroRiversFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  try {
    const { shp, dbf } = await downloadAndUnzipShapefile(continentCode)
    const source = await shapefile.open(shp, dbf)

    const candidates: GeoJSON.Feature[] = []
    // deno-lint-ignore no-explicit-any
    let result: any = await source.read()
    while (!result.done) {
      if (result.value?.geometry) candidates.push(result.value)
      result = await source.read()
    }

    const clipped = clipToCountryBoundary(candidates, boundary)

    return clipped.map((feature) => {
      const props = (feature.properties ?? {}) as Record<string, unknown>
      const coords = (feature.geometry.type === 'LineString'
        ? feature.geometry.coordinates
        : (feature.geometry.coordinates as number[][][])[0]) as [number, number][]
      return {
        geometry: feature.geometry as RiverRecord['geometry'],
        lengthMeters: typeof props.LENGTH_KM === 'number' ? props.LENGTH_KM * 1000 : lineLengthMeters(coords),
        countryCode,
        properties: {
          // HydroRIVERS' DBF schema (technical documentation) does not
          // include a river-name field — reaches are identified by
          // HYBAS_L12/HYRIV_ID only, not named.
          strahlerOrder: typeof props.ORD_STRA === 'number' ? props.ORD_STRA : undefined,
          hybasId: typeof props.HYBAS_L12 === 'number' ? props.HYBAS_L12 : 0,
        },
      }
    })
  } catch (err) {
    console.warn(`[hydroRiversFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchHydroRivers(countryCodes: string[]): Promise<Map<string, RiverRecord[]>> {
  const results = new Map<string, RiverRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
