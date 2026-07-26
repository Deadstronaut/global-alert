/**
 * OSM/Overpass disaster shelter / assembly point fetch module. Mirrors
 * osmBuildingsFetch.ts's per-country, single-attempt, never-throws
 * structure exactly — only the tag filter and output shape differ.
 *
 * Tag scope is deliberately narrow and deliberately EXCLUDES bare
 * `amenity=shelter` — live-verified 2026-07-26 via real Overpass queries
 * that `amenity=shelter` returns huge counts (7189 in Turkey, 4481 in
 * Malaysia) dominated by ordinary bus-stop/park weather shelters, not
 * disaster shelters. `emergency=assembly_point` / `social_facility=shelter`
 * / `evacuation_center=yes` are the tags that actually mean "designated
 * disaster shelter or evacuation assembly point" — live-verified real,
 * genuinely useful data exists under these for Turkey (676 points,
 * several sourced directly from "Tekirdağ Büyükşehir Belediyesi Afet
 * Yönetimi" — an actual municipal disaster-management import) and
 * Malaysia (~99 points across the three tags). Madagascar has
 * essentially none of this today (0-3 across all three tags) — a real
 * OSM data-coverage gap, not something this importer can work around.
 */

const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter'

export interface ShelterOsmRecord {
  name: string
  lat: number
  lng: number
  countryCode: string
  externalId: string // `${osmType}/${osmId}`, e.g. "node/123456"
  capacityTotal: number // OSM's capacity=* tag when present, else 1 (unknown-capacity sentinel — shelters.capacity_total is NOT NULL CHECK > 0, so this is never a fabricated large number)
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
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
    if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue

    records.push({
      name: el.tags.name?.trim() || 'Toplanma Alanı (OSM)',
      lat: el.lat,
      lng: el.lon,
      countryCode,
      externalId: `${el.type}/${el.id}`,
      capacityTotal: parseCapacity(el.tags),
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
