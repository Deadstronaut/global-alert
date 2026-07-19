/**
 * WorldPop fetch module (spec 043 US1). Unlike Kontur (HDX package search)
 * or HydroSHEDS (continent-scale bundle), WorldPop exposes a free,
 * no-key, per-country REST API returning a list of yearly population
 * datasets, each with a direct GeoTIFF download URL — this module resolves
 * the latest year's URL, downloads the raster, and delegates pixel->hexagon
 * aggregation to the source-agnostic rasterToHexagon.ts (FR-011).
 *
 * A single country's failure (no WorldPop coverage, download error, parse
 * error) is caught and that country is simply omitted from the returned
 * map — never thrown — mirroring hydroRiversFetch.ts's/osmRoadsFetch.ts's
 * FR-009 per-country isolation convention exactly.
 */

import { getServiceClient } from './upsert.ts'
import { ISO2_TO_ISO3 } from './iso3166.ts'
import { WORLDPOP_SOURCE_CONFIG } from './rasterSourceConfig.ts'
import { aggregateRasterToHexagons } from './rasterToHexagon.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

const WORLDPOP_API_BASE_URL = 'https://hub.worldpop.org/rest/data/pop/wpgp'

interface WorldPopDatasetEntry {
  popyear: string
  files: string[]
}

interface WorldPopApiResponse {
  data?: WorldPopDatasetEntry[]
}

/**
 * Resolves the most recent year's GeoTIFF download URL for a served
 * country's ISO3 code, or null if WorldPop has no coverage for it (a
 * normal, expected condition — spec.md's Edge Cases — not an error).
 */
export async function resolveWorldPopDownloadUrl(iso3: string): Promise<string | null> {
  const response = await fetch(`${WORLDPOP_API_BASE_URL}?iso3=${iso3}`, {
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) {
    throw new Error(`WorldPop API failed for ${iso3}: HTTP ${response.status}`)
  }
  const body = (await response.json()) as WorldPopApiResponse
  const entries = body.data ?? []
  if (entries.length === 0) return null

  const latest = entries.reduce((best, entry) =>
    Number(entry.popyear) > Number(best.popyear) ? entry : best,
  )
  return latest.files?.[0] ?? null
}

async function downloadGeoTiff(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!response.ok) {
    throw new Error(`Failed to download WorldPop GeoTIFF: HTTP ${response.status}`)
  }
  return await response.arrayBuffer()
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
  // Same normalization as hydroRiversFetch.ts's fetchCountryBoundary — a
  // country_boundaries row may be a FeatureCollection (per-ADM1-feature) or
  // a single Feature/Geometry.
  if (geojson.type === 'FeatureCollection' && geojson.features) {
    return { type: 'GeometryCollection', geometries: geojson.features.map((f) => f.geometry) } as GeoJSON.Geometry
  }
  if (geojson.type === 'Feature') {
    return (geojson as unknown as GeoJSON.Feature).geometry
  }
  return geojson as unknown as GeoJSON.Geometry
}

async function fetchOneCountry(countryCode: string): Promise<PopulationRasterRecord[] | null> {
  const iso3 = ISO2_TO_ISO3[countryCode.toUpperCase()]
  if (!iso3) {
    console.warn(`[worldPopFetch] no ISO3 mapping for ${countryCode}, skipping`)
    return null
  }

  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[worldPopFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  try {
    const downloadUrl = await resolveWorldPopDownloadUrl(iso3)
    if (!downloadUrl) {
      console.warn(`[worldPopFetch] no WorldPop coverage for ${countryCode} (${iso3}), skipping`)
      return null
    }

    const rasterBuffer = await downloadGeoTiff(downloadUrl)
    return await aggregateRasterToHexagons(rasterBuffer, WORLDPOP_SOURCE_CONFIG, boundary, countryCode)
  } catch (err) {
    console.warn(`[worldPopFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchWorldPopPopulation(countryCodes: string[]): Promise<Map<string, PopulationRasterRecord[]>> {
  const results = new Map<string, PopulationRasterRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
