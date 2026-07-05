/**
 * Resolves an event's lat/lng into a country_code using the same bounding-box
 * data already bundled for the frontend map (src/configs/countries.json) —
 * reused rather than adding a new world-boundaries dependency (YAGNI).
 *
 * Bounding boxes can overlap (e.g. Malaysia/Indonesia/Singapore in SE Asia),
 * so when a point falls in more than one box we pick the SMALLEST-AREA match
 * as the more specific/likely country. Not perfect at land borders, but good
 * enough for country-level map scoping — a coastline/border edge case is a
 * much smaller problem than the alternative (no scoping at all).
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const countriesPath = path.resolve(__dirname, '../../../src/configs/countries.json');

let countries = [];
try {
  const raw = JSON.parse(readFileSync(countriesPath, 'utf-8'));
  countries = Object.entries(raw)
    .filter(([, c]) => c.bbox)
    .map(([code, c]) => ({
      code,
      bbox: c.bbox,
      area: (c.bbox.maxLat - c.bbox.minLat) * (c.bbox.maxLng - c.bbox.minLng),
    }));
} catch (err) {
  console.warn('[GeoCountry] countries.json okunamadı, country_code çözümleme devre dışı:', err.message);
}

export function resolveCountryCode(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  let best = null;
  for (const c of countries) {
    const { minLat, maxLat, minLng, maxLng } = c.bbox;
    if (lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng) {
      if (!best || c.area < best.area) best = c;
    }
  }
  return best?.code ?? null;
}
