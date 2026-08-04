// Deno port of src/utils/geoCountry.js / server/src/processors/geoCountry.js —
// same bounding-box data (./countries.json, a bundled copy of
// src/configs/countries.json so this Edge Function has no dependency outside
// its own deploy bundle), same smallest-area-wins-on-overlap rule (spec 036
// research.md Decision 1). Kept as an independent copy rather than a shared
// cross-runtime import because Deno Edge Functions cannot import from the
// Vite/Node.js frontend source tree — the same multi-runtime duplication
// pattern already used for hazard thresholds (normalize.ts vs normalizer.js,
// spec 016).

import countries from './countries.json' with { type: 'json' }

interface CountryBbox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

interface CountryEntry {
  code: string
  bbox: CountryBbox
  area: number
}

const ENTRIES: CountryEntry[] = Object.entries(countries as Record<string, { bbox?: CountryBbox }>)
  .filter(([, c]) => c.bbox)
  .map(([code, c]) => ({
    code,
    bbox: c.bbox as CountryBbox,
    area: (c.bbox!.maxLat - c.bbox!.minLat) * (c.bbox!.maxLng - c.bbox!.minLng),
  }))

export function resolveCountryCode(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best: CountryEntry | null = null
  for (const c of ENTRIES) {
    const { minLat, maxLat, minLng, maxLng } = c.bbox
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      if (!best || c.area < best.area) best = c
    }
  }
  return best?.code ?? null
}

// Reverse lookup for sources that report a country display name instead of
// coordinates precise enough to bbox-match (e.g. ReliefWeb's country.name) —
// lets those sources be compared against resolveCountryCode()'s output on the
// same key (lowercase ISO2) instead of a display-name string. Exact match
// only, case-insensitive; a miss (localized/alternate spelling) returns null
// rather than guessing, same fail-closed stance as resolveCountryCode().
const NAME_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(countries as Record<string, { nameEn?: string }>)
    .filter(([, c]) => c.nameEn)
    .map(([code, c]) => [c.nameEn!.toLowerCase(), code]),
)

export function resolveCountryCodeByName(name: string | null | undefined): string | null {
  if (!name) return null
  return NAME_TO_CODE[name.toLowerCase()] ?? null
}
