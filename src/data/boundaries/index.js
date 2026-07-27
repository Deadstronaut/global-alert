/**
 * Region boundaries — checks the admin-uploadable country_boundaries table
 * first (see supabase/migrations/20260705_country_boundaries.sql,
 * .../20260727040000_country_boundaries_level.sql, and
 * src/components/admin/BoundaryUploadForm.vue), falling back to a bundled
 * default file for countries we've pre-loaded (see README.md). Everything is
 * lazy: nothing is fetched until a country is actually requested, and
 * results are cached in-memory afterwards.
 *
 * `level` selects the administrative granularity: `'province'` (ADM1 —
 * il/state, the original/default), `'district'` (ADM2 — ilçe), or
 * `'village'` (ADM3/commune — köy; DB-only, no bundled source exists at
 * this granularity for any country). The DB is checked for *every* level,
 * not just province — this both lets an admin correct a bundled level they
 * find inaccurate (e.g. re-upload a country's district set) and is the only
 * way village-level data can exist at all, since there's no free bundled
 * source for it.
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
  // village: DB-only — an admin upload is the sole source, no bundled
  // default exists (or is expected to) at this granularity.
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

  const { data } = await supabase
    .from('country_boundaries')
    .select('geojson, name_property')
    .eq('country_code', cc)
    .eq('level', level)
    .maybeSingle()
  if (data) {
    const result = { featureCollection: data.geojson, nameProperty: data.name_property }
    cache.set(cacheKey, result)
    return result
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
