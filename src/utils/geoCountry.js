/**
 * Mirrors server/src/processors/geoCountry.js — same bounding-box data,
 * smallest-match-wins on overlap. Used as a fallback in manual/CSV/file
 * imports (src/utils/severity.js) when the admin doesn't type a country code.
 */
import countries from '@/configs/countries.json'

const ENTRIES = Object.entries(countries)
  .filter(([, c]) => c.bbox)
  .map(([code, c]) => ({
    code,
    bbox: c.bbox,
    area: (c.bbox.maxLat - c.bbox.minLat) * (c.bbox.maxLng - c.bbox.minLng),
  }))

export function resolveCountryCode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  let best = null
  for (const c of ENTRIES) {
    const { minLat, maxLat, minLng, maxLng } = c.bbox
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      if (!best || c.area < best.area) best = c
    }
  }
  return best?.code ?? null
}
