/**
 * OSM/Overpass critical-facility building fetch module (spec 044, "Open-
 * BuildingMap" line item from Data Sources Inventory §8). Mirrors
 * osmRoadsFetch.ts's per-country, single-attempt, never-throws structure
 * exactly (spec 040) — the only real difference is the tag filter and the
 * node-vs-way geometry handling buildings need that a line-only road query
 * didn't.
 *
 * Scope is deliberately narrow: hospitals/clinics, schools/universities,
 * emergency services (fire/police/government), airports, cemeteries, fuel
 * stations, organized industrial zones (OSB), and military/security
 * facilities — not "every OSM building". osmRoadsFetch.ts's own comment
 * documents how even a narrowed road-class filter (motorway|trunk|primary)
 * still risked the deployed Edge Function's WORKER_RESOURCE_LIMIT — an
 * unscoped building=* query would be 1-2 orders of magnitude larger than
 * that. This tag set matches the asset_category taxonomy already used by
 * get_critical_infrastructure_features() (20260707195000_impact_analysis_
 * gaps.sql) rather than inventing a new one.
 *
 * Deliberately NOT included, live-verified against Overpass for Turkey
 * (2026-08-19): cold storage depots (0 results for building/man_made=
 * cold_storage), disaster-logistics or pharmaceutical-wholesale depots (no
 * OSM tag distinguishes them from a generic building=warehouse or a retail
 * amenity=pharmacy), and CBRN-specific capability (no OSM tag exists —
 * military=* is the closest proxy but means "a military facility", not "has
 * CBRN capability", so labeling it that way would misrepresent what the
 * data actually shows). Adding decorative/mislabeled categories with no
 * real backing data is out of scope — see "no decorative fake data viz" in
 * project memory.
 */

import type { BuildingRecord } from './buildingRecord.ts'

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

export const AMENITY_CATEGORY: Record<string, BuildingRecord['assetCategory']> = {
  hospital: 'critical_infrastructure_health',
  clinic: 'critical_infrastructure_health',
  school: 'critical_infrastructure_education',
  university: 'critical_infrastructure_education',
  college: 'critical_infrastructure_education',
  fire_station: 'critical_infrastructure_emergency',
  police: 'critical_infrastructure_emergency',
  townhall: 'critical_infrastructure_emergency',
  fuel: 'critical_infrastructure_fuel',
}

// Non-amenity tag/value pairs, each their own Overpass query branch (see
// buildQuery) since they don't share amenity's single-key regex filter.
export const AEROWAY_CATEGORY: Record<string, BuildingRecord['assetCategory']> = {
  aerodrome: 'critical_infrastructure_transport',
}

export const LANDUSE_CATEGORY: Record<string, BuildingRecord['assetCategory']> = {
  cemetery: 'critical_infrastructure_cemetery',
}

// landuse=industrial alone is too broad to be a useful "strategic point"
// (8,879 results in Turkey — every industrial-zoned parcel, not just
// organized industrial zones/OSB) so this branch is name-filtered in
// buildQuery to "Organize Sanayi" specifically (167 results, live-verified
// 2026-08-19).
const OSB_LANDUSE_CATEGORY: BuildingRecord['assetCategory'] = 'critical_infrastructure_industrial'

// Maps the same critical_infrastructure_* taxonomy above to
// BuildingRecord.sector's coarser categories — one lookup instead of two
// parallel tag-to-category tables to keep in sync by hand.
export const SECTOR_FOR_CATEGORY: Record<BuildingRecord['assetCategory'], BuildingRecord['sector']> = {
  critical_infrastructure_health: 'health',
  critical_infrastructure_education: 'education',
  critical_infrastructure_emergency: 'emergency',
  critical_infrastructure_transport: 'transport',
  critical_infrastructure_industrial: 'industrial',
  critical_infrastructure_military: 'military',
  critical_infrastructure_fuel: 'fuel',
  critical_infrastructure_cemetery: 'cemetery',
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
  // Present on way/relation elements from an `out center;` query (the
  // extended-category queries below) instead of `geometry` — a single
  // representative point rather than the full ring. Cheap for Overpass to
  // compute vs. full geometry, which is what makes those queries fast
  // enough to stay under fetchOverpass's timeout (see buildExtendedQueries).
  center?: OverpassNode
}

interface OverpassResponse {
  elements: OverpassElement[]
}

export function buildQuery(countryCode: string): string {
  // Same uppercase-for-Overpass / lowercase-for-this-system split as
  // osmRoadsFetch.ts's buildQuery() — see its comment for why.
  const amenityFilter = Object.keys(AMENITY_CATEGORY)
    .filter((k) => AMENITY_CATEGORY[k] !== 'critical_infrastructure_fuel')
    .join('|')
  return `[out:json][timeout:180];
area["ISO3166-1"="${countryCode.toUpperCase()}"][admin_level=2]->.searchArea;
(
  nwr["amenity"~"^(${amenityFilter})$"](area.searchArea);
  nwr["office"="government"](area.searchArea);
);
out geom;`
}

// One query per extended category, not one combined query, and `out
// center;` (a single representative point) instead of `out geom;` (full
// ring) — live-verified 2026-08-19 against overpass-api.de for Turkey:
// the original combined query (all 5 categories, `out geom`) never
// completed inside fetchOverpass's 130s budget; landuse=cemetery alone
// with `out geom` took >190s (cemetery boundaries are large, node-heavy
// ways) but 39s with `out center`; even combining all 5 categories with
// `out center` in one query still took >130s (~92s just for
// fuel+aeroway+OSB+military, before cemetery). Splitting by category
// keeps each individual call in the 30-40s range with real margin, and a
// slow/failed category no longer costs the others (see fetchOsmBuildings).
function areaHeader(countryCode: string): string {
  return `area["ISO3166-1"="${countryCode.toUpperCase()}"][admin_level=2]->.searchArea;`
}

export function buildFuelQuery(countryCode: string): string {
  return `[out:json][timeout:120];
${areaHeader(countryCode)}
nwr["amenity"="fuel"](area.searchArea);
out center;`
}

export function buildAerowayQuery(countryCode: string): string {
  const aerowayFilter = Object.keys(AEROWAY_CATEGORY).join('|')
  return `[out:json][timeout:120];
${areaHeader(countryCode)}
nwr["aeroway"~"^(${aerowayFilter})$"](area.searchArea);
out center;`
}

export function buildCemeteryQuery(countryCode: string): string {
  const landuseFilter = Object.keys(LANDUSE_CATEGORY).join('|')
  return `[out:json][timeout:120];
${areaHeader(countryCode)}
nwr["landuse"~"^(${landuseFilter})$"](area.searchArea);
out center;`
}

export function buildOsbQuery(countryCode: string): string {
  return `[out:json][timeout:120];
${areaHeader(countryCode)}
nwr["landuse"="industrial"]["name"~"Organize Sanayi",i](area.searchArea);
out center;`
}

export function buildMilitaryQuery(countryCode: string): string {
  return `[out:json][timeout:120];
${areaHeader(countryCode)}
nwr["military"](area.searchArea);
out center;`
}

export function buildExtendedQueries(countryCode: string): { label: string; query: string }[] {
  return [
    { label: 'fuel', query: buildFuelQuery(countryCode) },
    { label: 'aeroway', query: buildAerowayQuery(countryCode) },
    { label: 'cemetery', query: buildCemeteryQuery(countryCode) },
    { label: 'osb', query: buildOsbQuery(countryCode) },
    { label: 'military', query: buildMilitaryQuery(countryCode) },
  ]
}

export function categoryFor(tags: Record<string, string>): BuildingRecord['assetCategory'] | null {
  if (tags.amenity && AMENITY_CATEGORY[tags.amenity]) return AMENITY_CATEGORY[tags.amenity]
  if (tags.office === 'government') return 'critical_infrastructure_emergency'
  if (tags.aeroway && AEROWAY_CATEGORY[tags.aeroway]) return AEROWAY_CATEGORY[tags.aeroway]
  if (tags.landuse && LANDUSE_CATEGORY[tags.landuse]) return LANDUSE_CATEGORY[tags.landuse]
  if (tags.landuse === 'industrial' && /Organize Sanayi/i.test(tags.name ?? '')) return OSB_LANDUSE_CATEGORY
  if (tags.military) return 'critical_infrastructure_military'
  return null
}

export function facilityTypeFor(tags: Record<string, string>): string {
  if (tags.amenity) return tags.amenity
  if (tags.office === 'government') return 'government_office'
  if (tags.aeroway) return tags.aeroway
  if (tags.landuse === 'cemetery') return 'cemetery'
  if (tags.landuse === 'industrial') return 'organized_industrial_zone'
  if (tags.military) return `military_${tags.military}`
  return 'unknown'
}

// OSM has two competing conventions for a phone number — plain `phone` and
// the namespaced `contact:phone` — mappers use either inconsistently, so
// this checks both rather than silently missing whichever one wasn't used.
export function phoneFor(tags: Record<string, string>): string | undefined {
  return tags.phone ?? tags['contact:phone']
}

/**
 * Maps one Overpass response's elements into BuildingRecord[] for a given
 * country. Nodes with no tags and ways with incomplete/missing geometry are
 * omitted, not thrown.
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
    const sector = SECTOR_FOR_CATEGORY[assetCategory]
    const facilityType = facilityTypeFor(el.tags)
    const phone = phoneFor(el.tags)
    const baseProperties = {
      facilityType,
      name: el.tags.name,
      osmId: el.id,
      capacity: el.tags.capacity,
      beds: el.tags.beds,
      phone,
    }

    if (el.type === 'node') {
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue
      records.push({
        geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
        countryCode,
        assetCategory,
        sector,
        properties: { ...baseProperties, osmType: 'node' },
      })
      continue
    }

    // A `center` (from `out center;` — the extended-category queries) means
    // no full geometry was requested at all; use it as-is regardless of
    // way/relation, rather than trying to reconstruct a ring or polygon
    // from unrelated fields. Checked before the way-specific `geometry`
    // branch since a response never carries both for the same element.
    if (el.center) {
      records.push({
        geometry: { type: 'Point', coordinates: [el.center.lon, el.center.lat] },
        countryCode,
        assetCategory,
        sector,
        properties: { ...baseProperties, osmType: el.type },
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
        sector,
        properties: { ...baseProperties, osmType: 'way' },
      })
    }
    // relation with neither geometry nor center: intentionally skipped —
    // out geom doesn't reliably resolve multipolygon relations, same
    // "skip, don't guess" convention as osmRoadsFetch.ts's null-geometry
    // ways.
  }

  return records
}

// Same rate-limiting / timeout-budget rationale as osmRoadsFetch.ts's
// fetchOverpass(): single attempt, one query per invocation, a failed
// query is skipped (not a failure) and retried on the next cron cycle.
async function fetchOverpass(query: string, label: string): Promise<OverpassResponse | null> {
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'MHEWS-GlobalAlert/1.0 (critical-facility-exposure-import)',
        Accept: 'application/json',
      },
      body: query,
      signal: AbortSignal.timeout(130_000),
    })
    if (!response.ok) {
      console.warn(`[osmBuildingsFetch] Overpass HTTP ${response.status} for ${label}, skipping`)
      return null
    }
    return (await response.json()) as OverpassResponse
  } catch (err) {
    console.warn(`[osmBuildingsFetch] failed for ${label}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchOsmBuildings(countryCodes: string[]): Promise<Map<string, BuildingRecord[]>> {
  const results = new Map<string, BuildingRecord[]>()

  for (const countryCode of countryCodes) {
    const records: BuildingRecord[] = []
    let allQueriesSucceeded = true

    const coreBody = await fetchOverpass(buildQuery(countryCode), `${countryCode} (core)`)
    if (coreBody) {
      records.push(...mapOverpassResponseToBuildingRecords(coreBody, countryCode))
    } else {
      allQueriesSucceeded = false
    }

    // One call per extended category (see buildExtendedQueries's comment).
    // 'cemetery' is deliberately excluded from the required set below — by
    // far the slowest/flakiest of the six queries in practice (large,
    // node-heavy polygon ways even with `out center`) and, per explicit
    // user decision 2026-08-20, not important enough to keep blocking every
    // other category's update while it alone times out. A cemetery-query
    // failure just means this run's dataset has no (or stale, from before
    // this cutover) cemetery points — it no longer blocks the write.
    for (const { label, query } of buildExtendedQueries(countryCode)) {
      const body = await fetchOverpass(query, `${countryCode} (${label})`)
      if (body) {
        records.push(...mapOverpassResponseToBuildingRecords(body, countryCode))
      } else if (label !== 'cemetery') {
        allQueriesSucceeded = false
      }
    }

    // writeExposureDataset supersedes (deletes) this country's PREVIOUS
    // osm-buildings dataset once the new one commits — so writing a
    // partial result (a required query above failed) doesn't just
    // under-report this run, it silently deletes categories that were
    // already correctly populated from an earlier successful run. Live-
    // verified 2026-08-19: a core-query timeout on an otherwise-successful
    // run wiped Turkey's health/education facilities down to 0 rows this
    // way. A country with a failed required query is skipped entirely (old
    // dataset stays intact) rather than ever writing a known-incomplete
    // replacement — cemetery is the one deliberate exception, see above.
    if (allQueriesSucceeded && records.length > 0) {
      results.set(countryCode, records)
    } else if (!allQueriesSucceeded) {
      console.warn(`[osmBuildingsFetch] ${countryCode}: one or more queries failed, skipping write to avoid superseding the existing dataset with incomplete data`)
    }
  }

  return results
}
