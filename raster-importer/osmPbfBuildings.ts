/**
 * Local-PBF replacement for osmBuildingsFetch.ts's live Overpass-API
 * queries — same critical-facility scope (health/education/emergency/
 * transport/industrial/military/fuel/cemetery), same BuildingRecord[]
 * output shape, but sourced from a downloaded Geofabrik .osm.pbf extract
 * processed locally with `osmium` instead of six separate live queries
 * against the public overpass-api.de instance.
 *
 * Why: live-verified repeatedly 2026-08-19/20 that overpass-api.de
 * rate-limits/times out/actively resets connections for Turkey (a large,
 * densely-mapped country) even after splitting the original single query
 * into six narrower ones — some combination of query still fails on most
 * runs, and osmRoadsFetch.ts's own header comment already documents this
 * same public instance rate-limiting Supabase's cloud IP pool generally.
 * A local PBF has no query timeout or rate limit at all: `osmium` processes
 * it as fast as disk I/O allows, typically well under a minute even for a
 * ~600MB country extract — see this repo's other OSM-based importers for
 * the same "why a container, not Overpass-per-request" reasoning.
 *
 * Requires `osmium` (the osmium-tool CLI, not just libosmium) on PATH —
 * see raster-importer/Dockerfile, which installs it via apt (only
 * available on Debian-family images, not Alpine's default repos).
 */

import {
  categoryFor,
  facilityTypeFor,
  phoneFor,
  SECTOR_FOR_CATEGORY,
  AMENITY_CATEGORY,
  AEROWAY_CATEGORY,
  LANDUSE_CATEGORY,
} from '../supabase/functions/shared/osmBuildingsFetch.ts'
import type { BuildingRecord } from '../supabase/functions/shared/buildingRecord.ts'
import { resolveGeofabrikPbfUrl } from './geofabrikIndex.ts'

interface GeoJsonFeature {
  type: 'Feature'
  geometry: { type: 'Point' | 'Polygon' | 'MultiPolygon' | 'LineString'; coordinates: unknown } | null
  properties: Record<string, string | undefined> & { '@type'?: string; '@id'?: string }
}

interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

// The single tags-filter expression list covering every category
// osmBuildingsFetch.ts's categoryFor() recognizes, built from the same
// AMENITY_CATEGORY/AEROWAY_CATEGORY/LANDUSE_CATEGORY maps it uses — one
// source of truth for "which tags matter", so this list can't silently
// drift out of sync with the category-mapping logic it feeds. Unlike the
// Overpass version, this is a SINGLE filter pass (no per-category split
// needed): local `osmium` has no per-query timeout budget to protect.
function tagsFilterExpressions(): string[] {
  const amenityValues = Object.keys(AMENITY_CATEGORY).join(',')
  const aerowayValues = Object.keys(AEROWAY_CATEGORY).join(',')
  const landuseValues = Object.keys(LANDUSE_CATEGORY).join(',')
  return [
    `nwr/amenity=${amenityValues}`,
    'nwr/office=government',
    `nwr/aeroway=${aerowayValues}`,
    // 'industrial' is included here unfiltered (osmium tags-filter can't
    // name-match) — the "Organize Sanayi" narrowing categoryFor() already
    // does for the Overpass path applies identically here, in
    // mapGeoJsonFeaturesToBuildingRecords below, since categoryFor() is
    // the shared function both paths call.
    `nwr/landuse=${landuseValues},industrial`,
    'nwr/military',
  ]
}

async function runOsmium(args: string[]): Promise<void> {
  const command = new Deno.Command('osmium', { args, stdout: 'piped', stderr: 'piped' })
  const { code, stderr } = await command.output()
  if (code !== 0) {
    throw new Error(`osmium ${args[0]} failed (exit ${code}): ${new TextDecoder().decode(stderr)}`)
  }
}

async function downloadPbf(url: string, destPath: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`)
  }
  const file = await Deno.open(destPath, { create: true, write: true, truncate: true })
  await response.body.pipeTo(file.writable)
}

/**
 * Maps a `osmium export -a type,id` GeoJSON FeatureCollection into
 * BuildingRecord[] — the PBF-sourced counterpart to osmBuildingsFetch.ts's
 * mapOverpassResponseToBuildingRecords(), reusing the exact same
 * categoryFor/facilityTypeFor/phoneFor/SECTOR_FOR_CATEGORY so a feature
 * gets identically classified regardless of which source produced it.
 * Untagged/unrecognized features (e.g. an incidental `barrier=gate` node
 * that happens to be a member of a matched way's outline — osmium needs
 * that node's coordinates to build the way's geometry, and emits every
 * tagged entity it touches as its own feature) are silently dropped by
 * categoryFor() returning null, same as the Overpass path.
 */
// Large-area categories (cemeteries, OSB industrial zones, airports,
// military bases) are very often mapped in OSM as multipolygon RELATIONS,
// not simple ways — osmium's export correctly assembles these into
// GeoJSON MultiPolygon geometry, which BuildingRecord's own geometry type
// (Polygon | Point only, buildingRecord.ts) has no slot for. Rather than
// widening geometryToWkt.ts/validateBuildingRecord.ts to support a new
// stored shape just for this, a MultiPolygon is reduced to a single
// representative Point (the unweighted centroid of its first ring) — a
// simple approximation, not a true area centroid, but sufficient for what
// this dataset is actually used for: a map marker and a count, same as
// every node-sourced feature already is. Live-verified 2026-08-20: without
// this, Turkey's cemetery count came back as 80 instead of the ~13,000+
// real-world total (Overpass live count) because nearly all of them are
// relations.
function multiPolygonCentroid(coordinates: number[][][][]): [number, number] {
  const ring = coordinates[0]?.[0] ?? []
  if (ring.length === 0) return [0, 0]
  let sumLon = 0
  let sumLat = 0
  for (const [lon, lat] of ring) {
    sumLon += lon
    sumLat += lat
  }
  return [sumLon / ring.length, sumLat / ring.length]
}

export function mapGeoJsonFeaturesToBuildingRecords(
  collection: GeoJsonFeatureCollection,
  countryCode: string,
): BuildingRecord[] {
  const records: BuildingRecord[] = []

  for (const feature of collection.features) {
    // osmium's actual JSON output never has an explicit `undefined` value
    // for a present key — a tag is either a string or simply absent from
    // the object. The wider `| undefined` on GeoJsonFeature['properties']
    // only exists so TypeScript accepts optional-property object literals
    // in tests; this cast reflects the real runtime shape.
    const tags = feature.properties as Record<string, string>
    const assetCategory = categoryFor(tags)
    if (!assetCategory) continue
    if (!feature.geometry) continue

    let geometry: BuildingRecord['geometry']
    if (feature.geometry.type === 'Point' || feature.geometry.type === 'Polygon') {
      geometry = feature.geometry as BuildingRecord['geometry']
    } else if (feature.geometry.type === 'MultiPolygon') {
      geometry = { type: 'Point', coordinates: multiPolygonCentroid(feature.geometry.coordinates as number[][][][]) }
    } else {
      continue // LineString: not a shape any of our categories should ever produce
    }

    const osmType = (tags['@type'] as BuildingRecord['properties']['osmType']) ?? 'node'
    const osmId = Number(tags['@id'] ?? 0)

    records.push({
      geometry,
      countryCode,
      assetCategory,
      sector: SECTOR_FOR_CATEGORY[assetCategory],
      properties: {
        facilityType: facilityTypeFor(tags),
        name: tags.name,
        osmId,
        osmType,
        capacity: tags.capacity,
        beds: tags.beds,
        phone: phoneFor(tags),
      },
    })
  }

  return records
}

/**
 * Downloads, filters, and maps one country's critical-facility buildings
 * from its Geofabrik PBF extract. Never throws — same "skip, don't fail"
 * convention as osmBuildingsFetch.ts's fetchOverpass: a missing Geofabrik
 * region, a failed download, or an osmium error all just skip this country
 * for this run (retried next cron cycle) rather than aborting every other
 * served country.
 */
async function fetchOneCountry(countryCode: string, workDir: string): Promise<BuildingRecord[] | null> {
  const pbfUrl = await resolveGeofabrikPbfUrl(countryCode).catch((err) => {
    console.warn(`[osmPbfBuildings] ${countryCode}: failed to resolve Geofabrik URL: ${err instanceof Error ? err.message : err}`)
    return null
  })
  if (!pbfUrl) {
    console.warn(`[osmPbfBuildings] ${countryCode}: no Geofabrik region found for this ISO2 code, skipping`)
    return null
  }

  const rawPath = `${workDir}/${countryCode}.osm.pbf`
  const filteredPath = `${workDir}/${countryCode}-filtered.osm.pbf`
  const geojsonPath = `${workDir}/${countryCode}.geojson`

  try {
    console.log(`[osmPbfBuildings] ${countryCode}: downloading ${pbfUrl}`)
    await downloadPbf(pbfUrl, rawPath)

    await runOsmium(['tags-filter', rawPath, '-o', filteredPath, '--overwrite', ...tagsFilterExpressions()])
    await runOsmium(['export', filteredPath, '-f', 'geojson', '-o', geojsonPath, '--overwrite', '-a', 'type,id'])

    const geojson = JSON.parse(await Deno.readTextFile(geojsonPath)) as GeoJsonFeatureCollection
    return mapGeoJsonFeaturesToBuildingRecords(geojson, countryCode)
  } catch (err) {
    console.warn(`[osmPbfBuildings] ${countryCode}: failed: ${err instanceof Error ? err.message : err}`)
    return null
  } finally {
    // Country extracts run a few hundred MB each — delete promptly rather
    // than letting them pile up across every served country in one run.
    for (const path of [rawPath, filteredPath, geojsonPath]) {
      await Deno.remove(path).catch(() => {})
    }
  }
}

export async function fetchOsmBuildingsFromPbf(countryCodes: string[]): Promise<Map<string, BuildingRecord[]>> {
  const results = new Map<string, BuildingRecord[]>()
  const workDir = await Deno.makeTempDir({ prefix: 'osm-pbf-buildings-' })

  try {
    for (const countryCode of countryCodes) {
      const records = await fetchOneCountry(countryCode, workDir)
      if (records && records.length > 0) results.set(countryCode, records)
    }
  } finally {
    await Deno.remove(workDir, { recursive: true }).catch(() => {})
  }

  return results
}
