/**
 * Severity thresholds — mirrors supabase/functions/shared/normalize.ts and
 * server/src/processors/normalizer.js (those two backend runtimes are NOT
 * migrated to the DB-driven registry in spec 010 — see that spec's
 * Assumptions — so keep all three in sync manually if editing here).
 *
 * computeSeverity() delegates to the hazard-taxonomy registry
 * (src/stores/hazardTypes.js, spec 010) so severity breakpoints are
 * admin-configurable instead of hardcoded here. The original hardcoded
 * values live on unchanged as that store's FALLBACK_THRESHOLDS, used until
 * the registry has loaded (or if it's unreachable) — so this function's
 * behavior is identical to before until an admin actually edits a
 * threshold.
 */
import { resolveCountryCode } from './geoCountry.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'

export function computeSeverity(hazardType, magnitude, countryCode) {
  return useHazardTypesStore().computeSeverity(hazardType, magnitude, countryCode);
}

export function buildEventRow({ id, type, lat, lng, magnitude, depth, title, description, time, source, sourceUrl, countryCode, extra }) {
  const resolvedCountryCode = countryCode || resolveCountryCode(Number(lat), Number(lng));
  return {
    id: String(id),
    type,
    lat: Number(lat),
    lng: Number(lng),
    severity: computeSeverity(type, magnitude, resolvedCountryCode),
    magnitude: magnitude != null && magnitude !== '' ? Number(magnitude) : null,
    depth: depth != null && depth !== '' ? Number(depth) : null,
    title: String(title ?? '').slice(0, 200),
    description: String(description ?? '').slice(0, 500),
    time: time ? new Date(time).toISOString() : new Date().toISOString(),
    source: String(source ?? 'Manual Entry'),
    source_url: String(sourceUrl ?? ''),
    country_code: resolvedCountryCode,
    extra: extra ?? {},
    received_at: new Date().toISOString(),
  };
}
