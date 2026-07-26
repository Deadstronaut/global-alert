/**
 * Region boundaries — checks the admin-uploadable country_boundaries table
 * first (see supabase/migrations/20260705_country_boundaries.sql and
 * src/components/admin/BoundaryUploadForm.vue), falling back to a bundled
 * default file for countries we've pre-loaded (see README.md). Everything is
 * lazy: nothing is fetched until a country is actually requested, and
 * results are cached in-memory afterwards.
 *
 * `level` selects the administrative granularity: `'province'` (ADM1 — il/
 * state, the original/default) or `'district'` (ADM2 — ilçe). The
 * admin-uploadable `country_boundaries` table only has a province-level
 * concept today (no district upload feature exists yet), so the DB lookup
 * is skipped entirely for `'district'` — bundled-only for now.
 */
import { supabase } from '@/services/api/config.js'

const BUNDLED_LOADERS = {
  province: {
    tr: () => import('./tr-provinces.json'),
    my: () => import('./my-provinces.json'),
  },
  district: {
    tr: () => import('./tr-districts.json'),
    mg: () => import('./mg-districts.json'),
    my: () => import('./my-districts.json'),
  },
}
const BUNDLED_NAME_PROPERTY = 'shapeName'

const cache = new Map() // keyed by `${level}:${countryCode}`

/**
 * @returns {Promise<{featureCollection: object, nameProperty: string}|null>}
 */
export async function loadRegionBoundaries(countryCode, level = 'province') {
  const cc = countryCode?.toLowerCase()
  if (!cc) return null
  const cacheKey = `${level}:${cc}`
  if (cache.has(cacheKey)) return cache.get(cacheKey)

  if (level === 'province') {
    const { data } = await supabase
      .from('country_boundaries')
      .select('geojson, name_property')
      .eq('country_code', cc)
      .maybeSingle()
    if (data) {
      const result = { featureCollection: data.geojson, nameProperty: data.name_property }
      cache.set(cacheKey, result)
      return result
    }
  }

  const loader = BUNDLED_LOADERS[level]?.[cc]
  if (!loader) return null
  const mod = await loader()
  const result = { featureCollection: mod.default, nameProperty: BUNDLED_NAME_PROPERTY }
  cache.set(cacheKey, result)
  return result
}

export function invalidateRegionCache(countryCode, level = 'province') {
  cache.delete(`${level}:${countryCode?.toLowerCase()}`)
}

export async function getRegionNames(countryCode, level = 'province') {
  const boundary = await loadRegionBoundaries(countryCode, level)
  if (!boundary) return []
  return boundary.featureCollection.features
    .map((f) => f.properties[boundary.nameProperty])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'tr'))
}

export async function findRegionGeometry(countryCode, regionName, level = 'province') {
  const boundary = await loadRegionBoundaries(countryCode, level)
  if (!boundary) return null
  const feature = boundary.featureCollection.features.find(
    (f) => f.properties[boundary.nameProperty] === regionName,
  )
  return feature?.geometry ?? null
}
