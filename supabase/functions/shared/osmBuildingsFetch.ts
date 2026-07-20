/**
 * OSM/Overpass critical-facility building fetch module (spec 044, "Open-
 * BuildingMap" line item from Data Sources Inventory §8). Mirrors
 * osmRoadsFetch.ts's per-country, single-attempt, never-throws structure
 * exactly (spec 040) — the only real difference is the tag filter and the
 * node-vs-way geometry handling buildings need that a line-only road query
 * didn't.
 *
 * Scope is deliberately narrow: hospitals/clinics, schools/universities,
 * and emergency services (fire/police/government), not "every OSM
 * building". osmRoadsFetch.ts's own comment documents how even a narrowed
 * road-class filter (motorway|trunk|primary) still risked the deployed Edge
 * Function's WORKER_RESOURCE_LIMIT — an unscoped building=* query would be
 * 1-2 orders of magnitude larger than that. This tag set matches the
 * asset_category taxonomy already used by get_critical_infrastructure_
 * features() (20260707195000_impact_analysis_gaps.sql) rather than
 * inventing a new one.
 */

import type { BuildingRecord } from './buildingRecord.ts'

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

const AMENITY_CATEGORY: Record<string, BuildingRecord['assetCategory']> = {
  hospital: 'critical_infrastructure_health',
  clinic: 'critical_infrastructure_health',
  school: 'critical_infrastructure_education',
  university: 'critical_infrastructure_education',
  college: 'critical_infrastructure_education',
  fire_station: 'critical_infrastructure_emergency',
  police: 'critical_infrastructure_emergency',
  townhall: 'critical_infrastructure_emergency',
}

interface OverpassNode {
  lat: number
  lon: number
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: (OverpassNode | null)[]
}

interface OverpassResponse {
  elements: OverpassElement[]
}

export function buildQuery(countryCode: string): string {
  // Same uppercase-for-Overpass / lowercase-for-this-system split as
  // osmRoadsFetch.ts's buildQuery() — see its comment for why.
  const amenityFilter = Object.keys(AMENITY_CATEGORY).join('|')
  return `[out:json][timeout:180];
area["ISO3166-1"="${countryCode.toUpperCase()}"][admin_level=2]->.searchArea;
(
  nwr["amenity"~"^(${amenityFilter})$"](area.searchArea);
  nwr["office"="government"](area.searchArea);
);
out geom;`
}

function categoryFor(tags: Record<string, string>): BuildingRecord['assetCategory'] | null {
  if (tags.amenity && AMENITY_CATEGORY[tags.amenity]) return AMENITY_CATEGORY[tags.amenity]
  if (tags.office === 'government') return 'critical_infrastructure_emergency'
  return null
}

function facilityTypeFor(tags: Record<string, string>): string {
  return tags.amenity ?? (tags.office === 'government' ? 'government_office' : 'unknown')
}

/**
 * Maps one Overpass response's elements into BuildingRecord[] for a given
 * country. Nodes with no tags, ways with incomplete/missing geometry, and
 * relations (out geom doesn't reliably resolve multipolygon relations —
 * same "skip, don't guess" convention as osmRoadsFetch.ts's null-geometry
 * ways) are omitted, not thrown.
 */
export function mapOverpassResponseToBuildingRecords(
  response: OverpassResponse,
  countryCode: string,
): BuildingRecord[] {
  const records: BuildingRecord[] = []

  for (const el of response.elements) {
    if (!el.tags) continue
    const assetCategory = categoryFor(el.tags)
    if (!assetCategory) continue
    const facilityType = facilityTypeFor(el.tags)

    if (el.type === 'node') {
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue
      records.push({
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        countryCode,
        assetCategory,
        properties: { facilityType, name: el.tags.name, osmId: el.id, osmType: 'node' },
      })
      continue
    }

    if (el.type === 'way') {
      const nodes = (el.geometry ?? []).filter((n): n is OverpassNode => n != null)
      if (nodes.length < 3) continue // not enough points for a polygon ring
      const ring = nodes.map((n) => [n.lon, n.lat])
      // A GeoJSON Polygon ring must be closed (first point === last point) —
      // OSM ways tagged as building outlines already close this way in
      // practice, but this guards the case where Overpass trims it.
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first)

      records.push({
        geometry: { type: 'Polygon', coordinates: [ring] },
        countryCode,
        assetCategory,
        properties: { facilityType, name: el.tags.name, osmId: el.id, osmType: 'way' },
      })
    }
    // relation: intentionally skipped (see function comment).
  }

  return records
}

// Same rate-limiting / timeout-budget rationale as osmRoadsFetch.ts's
// fetchOverpass(): single attempt, one country per invocation, a failed
// country is skipped (not a failure) and retried on the next cron cycle.
async function fetchOverpass(countryCode: string): Promise<OverpassResponse | null> {
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'MHEWS-GlobalAlert/1.0 (critical-facility-exposure-import)',
        Accept: 'application/json',
      },
      body: buildQuery(countryCode),
      signal: AbortSignal.timeout(130_000),
    })
    if (!response.ok) {
      console.warn(`[osmBuildingsFetch] Overpass HTTP ${response.status} for ${countryCode}, skipping`)
      return null
    }
    return (await response.json()) as OverpassResponse
  } catch (err) {
    console.warn(`[osmBuildingsFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchOsmBuildings(countryCodes: string[]): Promise<Map<string, BuildingRecord[]>> {
  const results = new Map<string, BuildingRecord[]>()

  for (const countryCode of countryCodes) {
    const body = await fetchOverpass(countryCode)
    if (!body) continue
    results.set(countryCode, mapOverpassResponseToBuildingRecords(body, countryCode))
  }

  return results
}
