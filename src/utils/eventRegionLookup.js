/**
 * Shared "which real place is this event in" resolver — extracted from
 * LateralRiskReport.vue (2026-08-19) so a second call site (AppHeader.vue's
 * critical-events menu, same day) doesn't duplicate a third copy of the
 * same point-in-polygon country/district resolution.
 *
 * Deliberately does NOT trust the logged-in admin's own locked country
 * (authStore.countryCode) as the answer — that only tells you the ADMIN's
 * country, not the EVENT's. Instead tries every country this deployment
 * actually has boundary/exposure data for and keeps the first one whose
 * real polygon geometry contains the point.
 */
import { loadRegionBoundaries } from '@/data/boundaries/index.js'
import { findRegion } from '@/utils/pointInPolygon.js'

/**
 * @param {{ countryCode: string|null }} authStore
 * @param {{ datasets: Array<{ country_code?: string|null }> }} exposureLayersStore
 * @returns {string[]} candidate country codes, admin's own tried first
 */
export function candidateCountryCodes(authStore, exposureLayersStore) {
  const codes = new Set()
  if (authStore.countryCode) codes.add(authStore.countryCode)
  for (const d of exposureLayersStore.datasets) if (d.country_code) codes.add(d.country_code)
  return [...codes]
}

/**
 * @param {{ lat: number, lng: number }} event
 * @param {{ countryCode: string|null }} authStore
 * @param {{ datasets: Array }} exposureLayersStore
 * @returns {Promise<string|null>}
 */
export async function resolveEventCountryCode(event, authStore, exposureLayersStore) {
  for (const code of candidateCountryCodes(authStore, exposureLayersStore)) {
    const province = await loadRegionBoundaries(code, 'province')
    if (province && findRegion(event.lat, event.lng, province.featureCollection, province.nameProperty)) return code
    // Not every served country has a bundled/DB province-level file (e.g.
    // mg only ships district-level) — fall back to checking district-level
    // containment before ruling this country out entirely.
    const district = await loadRegionBoundaries(code, 'district')
    if (district && findRegion(event.lat, event.lng, district.featureCollection, district.nameProperty)) return code
  }
  return null
}

/**
 * 2026-08-19 ask: "Balıkesir - Gömeç gibi olsa daha güzel olmaz mı" — the
 * province name alone disambiguates districts that share a name across
 * different provinces, and reads more like how a real address/report
 * would name a place. Falls back gracefully: district-only or
 * province-only if just one resolves, null if neither does (never a
 * half-fabricated "undefined - Gömeç").
 *
 * @param {{ lat: number, lng: number }} event
 * @param {{ countryCode: string|null }} authStore
 * @param {{ datasets: Array }} exposureLayersStore
 * @returns {Promise<string|null>} ör. "Balıkesir - Gömeç", or just
 *   "Gömeç"/"Balıkesir" if only one level resolved, or null if unresolvable
 */
export async function resolveEventRegionName(event, authStore, exposureLayersStore) {
  const countryCode = await resolveEventCountryCode(event, authStore, exposureLayersStore)
  if (!countryCode) return null

  const [province, district] = await Promise.all([
    loadRegionBoundaries(countryCode, 'province'),
    loadRegionBoundaries(countryCode, 'district'),
  ])
  const provinceName = province ? findRegion(event.lat, event.lng, province.featureCollection, province.nameProperty) : null
  const districtName = district ? findRegion(event.lat, event.lng, district.featureCollection, district.nameProperty) : null

  if (provinceName && districtName && provinceName !== districtName) return `${provinceName} - ${districtName}`
  return districtName ?? provinceName ?? null
}
