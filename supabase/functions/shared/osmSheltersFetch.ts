/**
 * OSM/Overpass disaster shelter / assembly point fetch module. Mirrors
 * osmBuildingsFetch.ts's per-country, single-attempt, never-throws
 * structure exactly — only the tag filter and output shape differ.
 *
 * Tag scope now ALSO includes bare `amenity=shelter` — live-verified
 * 2026-07-26 that this tag alone returns huge counts (7190 in Turkey, 4481
 * in Malaysia) dominated by ordinary bus-stop/park weather shelters, not
 * disaster shelters, and live-verified 2026-07-27 that there's no clean
 * tag-based way to separate the two within `amenity=shelter` (2073 of
 * Turkey's 7190 have no `shelter_type` tag at all). Rather than exclude it
 * entirely — which left provinces genuinely invisible whenever nobody
 * happened to tag their real shelters with the narrower
 * emergency=assembly_point / social_facility=shelter / evacuation_center=yes
 * tags (Tekirdağ's disproportionate share is because one municipality did;
 * most provinces haven't) — every record now carries a confidence_level
 * (see 20260727050000_shelters_confidence_level.sql for the full 1-5
 * rationale) so low-confidence noise can be filtered out downstream (the
 * map layer does, by default) without losing it from the admin list.
 */

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

// shelter_type values that (live-verified via Overpass, see the migration's
// comment) mean "ordinary shelter", not "disaster shelter" — bus-stop
// weather shelters, picnic shelters, basic field huts.
const NOISE_SHELTER_TYPES = new Set([
  'public_transport',
  'lean_to',
  'picnic_shelter',
  'basic_hut',
  'weather_shelter',
  'field_shelter',
  'rock_shelter',
])

export interface ShelterOsmRecord {
  name: string
  lat: number
  lng: number
  countryCode: string
  externalId: string // `${osmType}/${osmId}`, e.g. "node/123456"
  capacityTotal: number // OSM's capacity=* tag when present, else 1 (unknown-capacity sentinel — shelters.capacity_total is NOT NULL CHECK > 0, so this is never a fabricated large number)
  confidenceLevel: number // 1-5, see this file's header comment and the confidence_level migration
}

/**
 * 5 (manual-entry-only, never assigned here) and 4 (the narrow
 * disaster-specific tags) aren't reachable from amenity=shelter — this
 * classifies only the amenity=shelter branch's ambiguity, plus the
 * emergency/social_facility/evacuation_center branch at a flat 4.
 */
export function computeConfidenceLevel(tags: Record<string, string>): number {
  if (
    tags.emergency === 'assembly_point' ||
    tags.social_facility === 'shelter' ||
    tags.evacuation_center === 'yes'
  ) {
    return 4
  }
  if (tags.amenity === 'shelter') {
    const shelterType = tags.shelter_type
    if (!shelterType) return 2
    if (NOISE_SHELTER_TYPES.has(shelterType)) return 1
    return 3
  }
  return 1
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  // `out center` only puts lat/lon at the top level for nodes — ways and
  // relations get a nested `center` object instead. Live-verified
  // 2026-07-27: missing this dropped every way-tagged amenity=shelter
  // element silently (2622 of 7190 in Turkey, ~36%), since the mapper below
  // only ever checked el.lat/el.lon directly.
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

interface OverpassResponse {
  elements: OverpassElement[]
}

export function buildQuery(countryCode: string): string {
  return `[out:json][timeout:180];
area["ISO3166-1"="${countryCode.toUpperCase()}"][admin_level=2]->.searchArea;
(
  nwr["emergency"="assembly_point"](area.searchArea);
  nwr["social_facility"="shelter"](area.searchArea);
  nwr["evacuation_center"="yes"](area.searchArea);
  nwr["amenity"="shelter"](area.searchArea);
);
out center;`
}

function parseCapacity(tags: Record<string, string>): number {
  const raw = tags.capacity
  if (!raw) return 1
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Maps one Overpass response's elements into ShelterOsmRecord[] for a
 * given country. `out center` (not `out geom`) gives every element —
 * including ways/relations — a single representative lat/lon, which is
 * all the `shelters` table's point-only schema needs (no polygon column).
 */
export function mapOverpassResponseToShelterRecords(
  response: OverpassResponse,
  countryCode: string,
): ShelterOsmRecord[] {
  const records: ShelterOsmRecord[] = []

  for (const el of response.elements) {
    if (!el.tags) continue
    const lat = el.lat ?? el.center?.lat
    const lon = el.lon ?? el.center?.lon
    if (typeof lat !== 'number' || typeof lon !== 'number') continue

    records.push({
      name: el.tags.name?.trim() || 'Toplanma Alanı (OSM)',
      lat,
      lng: lon,
      countryCode,
      externalId: `${el.type}/${el.id}`,
      capacityTotal: parseCapacity(el.tags),
      confidenceLevel: computeConfidenceLevel(el.tags),
    })
  }

  return records
}

// Same rate-limiting / timeout-budget rationale as osmBuildingsFetch.ts's
// fetchOverpass(): single attempt, one country per invocation, a failed
// country is skipped (not a failure) and retried on the next cron cycle.
async function fetchOverpass(countryCode: string): Promise<OverpassResponse | null> {
  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'User-Agent': 'MHEWS-GlobalAlert/1.0 (shelter-import)',
        Accept: 'application/json',
      },
      body: buildQuery(countryCode),
      signal: AbortSignal.timeout(130_000),
    })
    if (!response.ok) {
      console.warn(`[osmSheltersFetch] Overpass HTTP ${response.status} for ${countryCode}, skipping`)
      return null
    }
    return (await response.json()) as OverpassResponse
  } catch (err) {
    console.warn(`[osmSheltersFetch] failed for ${countryCode}: ${err instanceof Error ? err.message : err}`)
    return null
  }
}

export async function fetchOsmShelters(countryCodes: string[]): Promise<Map<string, ShelterOsmRecord[]>> {
  const results = new Map<string, ShelterOsmRecord[]>()

  for (const countryCode of countryCodes) {
    const body = await fetchOverpass(countryCode)
    if (!body) continue
    results.set(countryCode, mapOverpassResponseToShelterRecords(body, countryCode))
  }

  return results
}
