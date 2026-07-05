/**
 * Region boundaries — checks the admin-uploadable country_boundaries table
 * first (see supabase/migrations/20260705_country_boundaries.sql and
 * src/components/admin/BoundaryUploadForm.vue), falling back to a bundled
 * default file for countries we've pre-loaded (currently only Turkey — see
 * README.md). Everything is lazy: nothing is fetched until a country is
 * actually requested, and results are cached in-memory afterwards.
 */
import { supabase } from '@/services/api/config.js'

const BUNDLED_LOADERS = {
  tr: () => import('./tr-provinces.json'),
  my: () => import('./my-provinces.json'),
}
const BUNDLED_NAME_PROPERTY = 'shapeName'

const cache = new Map()

/**
 * @returns {Promise<{featureCollection: object, nameProperty: string}|null>}
 */
export async function loadRegionBoundaries(countryCode) {
  const cc = countryCode?.toLowerCase()
  if (!cc) return null
  if (cache.has(cc)) return cache.get(cc)

  const { data } = await supabase
    .from('country_boundaries')
    .select('geojson, name_property')
    .eq('country_code', cc)
    .maybeSingle()
  if (data) {
    const result = { featureCollection: data.geojson, nameProperty: data.name_property }
    cache.set(cc, result)
    return result
  }

  const loader = BUNDLED_LOADERS[cc]
  if (!loader) return null
  const mod = await loader()
  const result = { featureCollection: mod.default, nameProperty: BUNDLED_NAME_PROPERTY }
  cache.set(cc, result)
  return result
}

export function invalidateRegionCache(countryCode) {
  cache.delete(countryCode?.toLowerCase())
}

export async function getRegionNames(countryCode) {
  const boundary = await loadRegionBoundaries(countryCode)
  if (!boundary) return []
  return boundary.featureCollection.features
    .map((f) => f.properties[boundary.nameProperty])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'tr'))
}

export async function findRegionGeometry(countryCode, regionName) {
  const boundary = await loadRegionBoundaries(countryCode)
  if (!boundary) return null
  const feature = boundary.featureCollection.features.find(
    (f) => f.properties[boundary.nameProperty] === regionName,
  )
  return feature?.geometry ?? null
}
