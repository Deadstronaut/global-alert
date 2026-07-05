/**
 * Severity thresholds — mirrors supabase/functions/shared/normalize.ts and
 * server/src/processors/normalizer.js. Keep the three in sync.
 */
import { resolveCountryCode } from './geoCountry.js'

const SEVERITY_FN = {
  earthquake: (mag) => (mag >= 7.0 ? 'critical' : mag >= 5.5 ? 'high' : mag >= 4.0 ? 'moderate' : mag >= 2.5 ? 'low' : 'minimal'),
  wildfire: (frp) => (frp >= 500 ? 'critical' : frp >= 200 ? 'high' : frp >= 50 ? 'moderate' : frp >= 10 ? 'low' : 'minimal'),
  flood: (level) => (level >= 4 ? 'critical' : level >= 3 ? 'high' : level >= 2 ? 'moderate' : level >= 1 ? 'low' : 'minimal'),
  drought: (level) => (level >= 4 ? 'critical' : level >= 3 ? 'high' : level >= 2 ? 'moderate' : 'low'),
  food_security: (phase) => (phase >= 5 ? 'critical' : phase >= 4 ? 'high' : phase >= 3 ? 'moderate' : phase >= 2 ? 'low' : 'minimal'),
};

export function computeSeverity(hazardType, magnitude) {
  const fn = SEVERITY_FN[hazardType] ?? (() => 'low');
  return fn(Number(magnitude) || 0);
}

export function buildEventRow({ id, type, lat, lng, magnitude, depth, title, description, time, source, sourceUrl, countryCode, extra }) {
  return {
    id: String(id),
    type,
    lat: Number(lat),
    lng: Number(lng),
    severity: computeSeverity(type, magnitude),
    magnitude: magnitude != null && magnitude !== '' ? Number(magnitude) : null,
    depth: depth != null && depth !== '' ? Number(depth) : null,
    title: String(title ?? '').slice(0, 200),
    description: String(description ?? '').slice(0, 500),
    time: time ? new Date(time).toISOString() : new Date().toISOString(),
    source: String(source ?? 'Manual Entry'),
    source_url: String(sourceUrl ?? ''),
    country_code: countryCode || resolveCountryCode(Number(lat), Number(lng)),
    extra: extra ?? {},
    received_at: new Date().toISOString(),
  };
}
