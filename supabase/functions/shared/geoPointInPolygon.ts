/**
 * Server-side (Deno) port of src/utils/geoPointInPolygon.js — same
 * bbox-prefiltered ray-cast algorithm, kept in sync by hand since the two
 * runtimes can't share a module directly. Used by adminBoundaryLookup.ts to
 * tag each imported exposure feature with its containing district.
 */

type Point = [number, number]
type Ring = Point[]
type Geometry = { type: string; coordinates: unknown }
type BBox = [number, number, number, number]

function pointInRing([px, py]: Point, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygonRings(point: Point, rings: Ring[]): boolean {
  if (!rings || rings.length === 0) return false
  if (!pointInRing(point, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false
  }
  return true
}

export function pointInGeometry(point: Point, geometry: Geometry | null | undefined): boolean {
  if (!geometry) return false
  if (geometry.type === 'Polygon') return pointInPolygonRings(point, geometry.coordinates as Ring[])
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Ring[][]).some((polygon) => pointInPolygonRings(point, polygon))
  }
  return false
}

export function boundingBoxOf(geometry: Geometry | null | undefined): BBox {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const visitRing = (ring: Ring) => {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  if (geometry?.type === 'Polygon') (geometry.coordinates as Ring[]).forEach(visitRing)
  else if (geometry?.type === 'MultiPolygon') (geometry.coordinates as Ring[][]).forEach((poly) => poly.forEach(visitRing))
  return [minLng, minLat, maxLng, maxLat]
}

export function pointInBBox([lng, lat]: Point, [minLng, minLat, maxLng, maxLat]: BBox): boolean {
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

export interface RegionIndex {
  nameProperty: string
  entries: { name: string | null; geometry: Geometry; bbox: BBox }[]
}

export function buildRegionIndex(
  featureCollection: { features: { properties?: Record<string, unknown>; geometry: Geometry }[] } | null | undefined,
  nameProperty: string,
): RegionIndex {
  const features = featureCollection?.features ?? []
  return {
    nameProperty,
    entries: features.map((feature) => ({
      name: (feature.properties?.[nameProperty] as string) ?? null,
      geometry: feature.geometry,
      bbox: boundingBoxOf(feature.geometry),
    })),
  }
}

export function findRegionNameForPoint(point: Point, index: RegionIndex | null | undefined): string | null {
  for (const entry of index?.entries ?? []) {
    if (!pointInBBox(point, entry.bbox)) continue
    if (pointInGeometry(point, entry.geometry)) return entry.name
  }
  return null
}
