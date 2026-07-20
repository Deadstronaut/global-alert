/**
 * GHSL (GHS-POP) population fetch module (spec 044 — "GHSL", Data Sources
 * Inventory §8, moved from evaluated-but-not-integrated to live).
 *
 * First version downloaded GHSL's single global raster (~461MB zip) once
 * per invocation. Live-verified that buffering the whole thing in memory
 * (response.arrayBuffer()) exceeds the deployed Edge Function's memory
 * budget — WORKER_RESOURCE_LIMIT within ~10s, before any of rasterToHexagon
 * .ts's cropping logic even gets a chance to run, since the crop can only
 * happen after the whole file is already in memory as a GeoTIFF-parseable
 * buffer. Rewritten to use GHSL's own pre-cut 10-degree tile grid instead
 * (ghslTileGrid.ts) — each served country downloads only the handful of
 * ~1.5MB tiles that actually overlap its boundary, not the whole world.
 */

import { getServiceClient } from './upsert.ts'
import { extractFirstEntryByExtension } from './unzipSingleEntry.ts'
import { tileIndicesForBoundingBox, tileZipUrl } from './ghslTileGrid.ts'
import { GHSL_SOURCE_CONFIG } from './rasterSourceConfig.ts'
import { aggregateRasterToHexagons, geometryBoundingBox } from './rasterToHexagon.ts'
import type { PopulationRasterRecord } from './populationRasterRecord.ts'

async function downloadAndExtractTile(tile: { row: number; col: number }): Promise<ArrayBuffer | null> {
  const url = tileZipUrl(tile)
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (response.status === 404) return null // ocean-only tile, never published — expected (see ghslTileGrid.ts)
  if (!response.ok) throw new Error(`Failed to download GHSL tile R${tile.row}_C${tile.col}: HTTP ${response.status}`)
  const zipBuffer = await response.arrayBuffer()
  return await extractFirstEntryByExtension(zipBuffer, '.tif')
}

// Same country_boundaries normalization as worldPopFetch.ts's fetchCountryBoundary.
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

// A hexagon within the ~0.5deg margin of two adjacent tiles can be read
// (and counted) from both — merge by summing, keyed by H3 cell, rather
// than risk double-counting a border hexagon's population.
function mergeRecordsByCell(recordSets: PopulationRasterRecord[][]): PopulationRasterRecord[] {
  const byCell = new Map<string, PopulationRasterRecord>()
  for (const records of recordSets) {
    for (const record of records) {
      const existing = byCell.get(record.properties.h3Cell)
      if (existing) {
        existing.populationCount += record.populationCount
      } else {
        byCell.set(record.properties.h3Cell, { ...record })
      }
    }
  }
  return [...byCell.values()]
}

async function fetchOneCountry(countryCode: string): Promise<PopulationRasterRecord[] | null> {
  const boundary = await fetchCountryBoundary(countryCode)
  if (!boundary) {
    console.warn(`[ghslFetch] no country_boundaries row for ${countryCode}, skipping`)
    return null
  }

  const bbox = geometryBoundingBox(boundary)
  const tiles = tileIndicesForBoundingBox(bbox)

  const recordSets: PopulationRasterRecord[][] = []
  for (const tile of tiles) {
    try {
      const rasterBuffer = await downloadAndExtractTile(tile)
      if (!rasterBuffer) continue
      const records = await aggregateRasterToHexagons(rasterBuffer, GHSL_SOURCE_CONFIG, boundary, countryCode)
      if (records.length > 0) recordSets.push(records)
    } catch (err) {
      // One tile's failure must not block the rest — mirrors osmRoadsFetch.ts's
      // per-unit isolation convention.
      console.warn(`[ghslFetch] tile R${tile.row}_C${tile.col} failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    }
  }

  if (recordSets.length === 0) return null
  return mergeRecordsByCell(recordSets)
}

export async function fetchGhslPopulation(countryCodes: string[]): Promise<Map<string, PopulationRasterRecord[]>> {
  const results = new Map<string, PopulationRasterRecord[]>()
  for (const countryCode of countryCodes) {
    const records = await fetchOneCountry(countryCode)
    if (records) results.set(countryCode, records)
  }
  return results
}
