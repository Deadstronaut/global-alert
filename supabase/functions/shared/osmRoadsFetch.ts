/**
 * OSM/Overpass road-network fetch module (spec 040, US1). For each served
 * country, issues one Overpass QL query scoped via the ISO3166-1 area
 * selector (research.md §2) — no per-country dataset resolution step is
 * needed, unlike Kontur's HDX lookup (research.md §5), because Overpass
 * takes the country code directly as a query parameter.
 *
 * A single country's query failure (timeout, malformed response, network
 * error) is caught and that country is simply omitted from the returned
 * map — never thrown — so one country's failure never blocks another
 * served country's import (FR-009).
 */

import type { RoadRecord } from './roadRecord.ts'

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

// MVP-scoped road hierarchy (research.md §8 addendum) — narrowed from the
// full motorway..unclassified set originally planned after live testing
// against Turkey found the full set is 1.58M ways (unusable in one Edge
// Function request); even primary-only was 85MB/36s. motorway+trunk (the
// national highway network) was live-verified at 52MB/35s for Turkey — the
// largest served country — and is expected to be dramatically smaller for
// Madagascar. Expanding to secondary/tertiary/residential is future work
// requiring the admin-boundary query-splitting this feature's plan.md
// Complexity Tracking already flagged as deferred, not a silent limitation.
// Kept in sync with validateRoadRecord.ts's IMPORTED_HIGHWAY_VALUES.
const HIGHWAY_FILTER = 'motorway|trunk'

interface OverpassNode {
  lat: number
  lon: number
}

interface OverpassWay {
  type: 'way'
  id: number
  tags?: Record<string, string>
  geometry?: (OverpassNode | null)[]
}

interface OverpassResponse {
  elements: OverpassWay[]
}

export function buildQuery(countryCode: string): string {
  // Overpass's ISO3166-1 tag is uppercase (verified live — lowercase silently
  // fails to resolve the area). This system's country_code columns are
  // lowercase (country_boundaries, exposure_datasets — verified live too),
  // so the uppercase conversion is scoped to this query only; RoadRecord's
  // countryCode stays in the system's own lowercase convention.
  return `[out:json][timeout:180];
area["ISO3166-1"="${countryCode.toUpperCase()}"][admin_level=2]->.searchArea;
(
  way["highway"~"^(${HIGHWAY_FILTER})$"](area.searchArea);
);
out geom;`
}

/** Haversine distance in meters between two lat/lon points. */
function haversineMeters(a: OverpassNode, b: OverpassNode): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function wayLengthMeters(nodes: OverpassNode[]): number {
  let total = 0
  for (let i = 1; i < nodes.length; i++) {
    total += haversineMeters(nodes[i - 1], nodes[i])
  }
  return total
}

/**
 * Maps one Overpass response's `way` elements into RoadRecord[] for a given
 * country. Ways with missing/incomplete geometry (null entries — can occur
 * at area boundaries) are skipped, not thrown — mirrors konturFetch.ts's
 * "shape-mapping, not validation" convention (validateRoadRecord.ts is the
 * single point of truth for what's "invalid" downstream).
 */
export function mapOverpassResponseToRoadRecords(
  response: OverpassResponse,
  countryCode: string,
): RoadRecord[] {
  const records: RoadRecord[] = []
  for (const way of response.elements) {
    if (way.type !== 'way' || !way.geometry || !way.tags?.highway) continue

    const nodes = way.geometry.filter((n): n is OverpassNode => n != null)
    if (nodes.length < 2) continue

    const lengthMeters = wayLengthMeters(nodes)
    records.push({
      geometry: {
        type: 'LineString',
        coordinates: nodes.map((n) => [n.lon, n.lat]),
      },
      lengthMeters,
      countryCode,
      properties: {
        highway: way.tags.highway,
        name: way.tags.name,
        osmId: way.id,
      },
    })
  }
  return records
}

// Live-verified during implementation (research.md §8 addendum): the public
// overpass-api.de instance rate-limits (HTTP 429) requests from Supabase
// Edge Functions' shared outbound IP pool — the identical query succeeds
// immediately from a non-cloud IP. A retry loop was tried and rejected: a
// 429 rejection was observed taking up to ~2.5 minutes to even arrive
// (Overpass appears to queue before rejecting under load), which alone can
// exceed Supabase's 150s idle timeout — a retry budget cannot be sized
// reliably against that. Single attempt, single-country-per-invocation
// (index.ts's countryCode parameter) is the correct scope for this
// constraint: a failed country is skipped, not treated as a failure
// (FR-009), and the next weekly cron cycle (one invocation per country)
// tries again independently — this is the same "not a failure, retry next
// cycle" resilience pattern this codebase already relies on, applied at the
// shared-resource-contention layer rather than solved with in-request
// retries that cannot fit the timeout budget.
async function fetchOverpass(countryCode: string): Promise<OverpassResponse | null> {
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        // Overpass's usage policy asks for a descriptive User-Agent
        // identifying the application; live-verified during implementation
        // that Deno's default fetch User-Agent gets a 406 Not Acceptable
        // from overpass-api.de without one.
        'User-Agent': 'MHEWS-GlobalAlert/1.0 (road-network-exposure-import)',
        Accept: 'application/json',
      },
      body: buildQuery(countryCode),
      signal: AbortSignal.timeout(130_000),
    })
    if (!response.ok) {
      console.warn(`[osmRoadsFetch] Overpass HTTP ${response.status} for ${countryCode}, skipping`)
      return null
    }
    return (await response.json()) as OverpassResponse
  } catch (err) {
    // A single country's failure (timeout, network error, unparseable
    // response) must never block other served countries' imports (FR-009).
    console.warn(`[osmRoadsFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchOsmRoads(countryCodes: string[]): Promise<Map<string, RoadRecord[]>> {
  const results = new Map<string, RoadRecord[]>()

  for (const countryCode of countryCodes) {
    const body = await fetchOverpass(countryCode)
    if (!body) continue
    results.set(countryCode, mapOverpassResponseToRoadRecords(body, countryCode))
  }

  return results
}
