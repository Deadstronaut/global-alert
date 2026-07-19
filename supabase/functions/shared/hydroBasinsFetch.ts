/**
 * HydroBASINS fetch module (spec 041 US2). Mirrors hydroRiversFetch.ts's
 * structure exactly, with one difference: HydroBASINS' continent ZIP bundles
 * all 12 hierarchy levels together — this module extracts only the level-6
 * .shp/.dbf pair by filename pattern (research.md §3), never loading the
 * other 11 levels.
 */

// @ts-expect-error - esm.sh's generated .d.ts for jszip lacks a default
// export declaration; the default export works fine at runtime (verified).
import JSZip from 'https://esm.sh/jszip@3.10.1'
import * as shapefile from 'https://esm.sh/shapefile@0.6.6'
import { getServiceClient } from './upsert.ts'
import { hydroshedsContinentForCountry } from './hydroshedsContinent.ts'
import { clipToCountryBoundary } from './hydroshedsClip.ts'
import type { BasinRecord } from './basinRecord.ts'

const HYDROBASINS_BASE_URL = 'https://data.hydrosheds.org/file/hydrobasins/standard'
const HYDROBASINS_LEVEL = '06'

async function fetchCountryBoundary(countryCode: string): Promise<GeoJSON.Geometry | null> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson')
    .eq('country_code', countryCode)
    .maybeSingle()
  if (error || !data) return null
  const geojson = data.geojson as { type: string; features?: GeoJSON.Feature[] }
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f) => f.geometry) } as GeoJSON.Geometry
  }
  if (geojson.type === 'Feature') {
    return (geojson as unknown as GeoJSON.Feature).geometry
  }
  return geojson as unknown as GeoJSON.Geometry
}

async function downloadAndUnzipLevel6Shapefile(continentCode: string): Promise<{ shp: ArrayBuffer; dbf: ArrayBuffer }> {
  const url = `${HYDROBASINS_BASE_URL}/hybas_${continentCode}_lev01-12_v1c.zip`
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) {
    throw new Error(`Failed to download HydroBASINS ${continentCode}: HTTP ${response.status}`)
  }
  const zipBuffer = await response.arrayBuffer()
  const zip = await JSZip.loadAsync(zipBuffer)
  const files = zip.files as Record<string, { name: string; async: (type: string) => Promise<ArrayBuffer> }>

  const levelPattern = new RegExp(`lev${HYDROBASINS_LEVEL}`, 'i')
  const shpEntry = Object.values(files).find((f) => f.name.toLowerCase().endsWith('.shp') && levelPattern.test(f.name))
  const dbfEntry = Object.values(files).find((f) => f.name.toLowerCase().endsWith('.dbf') && levelPattern.test(f.name))
  if (!shpEntry || !dbfEntry) {
    throw new Error(`HydroBASINS ${continentCode} ZIP is missing level-${HYDROBASINS_LEVEL} .shp/.dbf entries`)
  }

  const [shp, dbf] = await Promise.all([shpEntry.async('arraybuffer'), dbfEntry.async('arraybuffer')])
  return { shp, dbf }
}

async function fetchOneCountry(countryCode: string): Promise<BasinRecord[] | null> {
  const continentCode = hydroshedsContinentForCountry(countryCode)
  if (!continentCode) {
    console.warn(`[hydroBasinsFetch] no HydroSHEDS continent mapping for ${countryCode}, skipping`)
    return null
  }

  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[hydroBasinsFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  try {
    const { shp, dbf } = await downloadAndUnzipLevel6Shapefile(continentCode)
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
      return {
        geometry: feature.geometry as BasinRecord['geometry'],
        areaKm2: typeof props.SUB_AREA === 'number' ? props.SUB_AREA : 0,
        countryCode,
        properties: {
          hybasId: typeof props.HYBAS_ID === 'number' ? props.HYBAS_ID : 0,
          pfafId: typeof props.PFAF_ID === 'number' ? props.PFAF_ID : 0,
        },
      }
    })
  } catch (err) {
    console.warn(`[hydroBasinsFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchHydroBasins(countryCodes: string[]): Promise<Map<string, BasinRecord[]>> {
  const results = new Map<string, BasinRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
