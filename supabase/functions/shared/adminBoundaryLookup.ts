/**
 * Tags an imported exposure feature with its containing district
 * (exposure_features.admin_boundary_code) so ImpactPanel.vue's "İdari
 * Sınıra Göre" breakdown (compute_boundary_breakdown) has real data to
 * group by — previously always NULL for every source, so that breakdown
 * always collapsed into a single "unclassified" bucket.
 *
 * District boundaries live in country_boundaries (level='district') —
 * seeded from the same bundled GeoJSON src/data/boundaries/index.js falls
 * back to client-side, via generate-district-boundary-migrations.cjs — so
 * this reads the same source of truth the map's own province/district
 * filter uses, just from the server side instead of importing the
 * frontend's bundled JSON files directly (edge functions can't reach those).
 *
 * Countries with no district set uploaded/seeded yet resolve every feature
 * to null admin_boundary_code — same "unclassified" fallback as before,
 * not a new failure mode.
 */

import { buildRegionIndex, findRegionNameForPoint, type RegionIndex } from './geoPointInPolygon.ts'

type Ring = [number, number][]
type Geometry = { type: string; coordinates: unknown }

// Centroid via simple vertex averaging of the outer ring — an
// approximation, not a true area centroid, but matches the precedent
// already established by populationCellAggregation.ts's centroidOf for
// this same "which region contains this feature" use case.
function centroidOfGeometry(geometry: Geometry | null | undefined): [number, number] | null {
  if (!geometry) return null
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates as [number, number]
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null
  }
  const ring: Ring | undefined =
    geometry.type === 'Polygon'
      ? (geometry.coordinates as Ring[])[0]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as Ring[][])[0]?.[0]
        : undefined
  if (!ring || ring.length === 0) return null
  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of ring) {
    sumLng += lng
    sumLat += lat
  }
  const lng = sumLng / ring.length
  const lat = sumLat / ring.length
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null
}

export type AdminBoundaryResolver = (geometry: Geometry | null | undefined) => string | null

const NULL_RESOLVER: AdminBoundaryResolver = () => null

// deno-lint-ignore no-explicit-any
export async function buildAdminBoundaryResolver(supabase: any, countryCode: string): Promise<AdminBoundaryResolver> {
  const { data, error } = await supabase
    .from('country_boundaries')
    .select('geojson, name_property')
    .eq('country_code', countryCode)
    .eq('level', 'district')
    .maybeSingle()

  if (error || !data) return NULL_RESOLVER

  const index: RegionIndex = buildRegionIndex(data.geojson, data.name_property)
  return (geometry) => {
    const centroid = centroidOfGeometry(geometry)
    if (!centroid) return null
    return findRegionNameForPoint(centroid, index)
  }
}
