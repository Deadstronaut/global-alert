/**
 * Shared point-in-polygon geometry helpers, extracted from
 * provincePopulationAggregation.js so other features (e.g. tagging a point
 * asset like a shelter with its containing province/district) can reuse the
 * same bbox-prefiltered ray-cast instead of re-implementing it.
 */

// Standard ray-casting point-in-ring test.
function pointInRing([px, py], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

// A point is inside a Polygon's ring set if it's inside the outer ring
// (index 0) and not inside any hole ring (index 1+).
function pointInPolygonRings(point, rings) {
  if (!rings || rings.length === 0) return false
  if (!pointInRing(point, rings[0])) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(point, rings[i])) return false
  }
  return true
}

export function pointInGeometry(point, geometry) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') return pointInPolygonRings(point, geometry.coordinates)
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((polygon) => pointInPolygonRings(point, polygon))
  }
  return false
}

// Axis-aligned bounding box of every coordinate in a Polygon/MultiPolygon —
// a cheap O(1) reject before the O(ring-length) ray-cast above. Added after
// a live test (research.md §4 addendum, spec 046) found the naive nested
// loop took ~77s against Turkey's real 81-province set (real GADM rings
// average ~690 vertices each) — the interactive budget assumed didn't
// account for real-world ring density. This isn't a spatial index, just a
// precomputed bbox per region, checked once before falling back to the real
// test.
export function boundingBoxOf(geometry) {
  let minLng = Infinity
  let minLat = Infinity
  let maxLng = -Infinity
  let maxLat = -Infinity
  const visitRing = (ring) => {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lng > maxLng) maxLng = lng
      if (lat < minLat) minLat = lat
      if (lat > maxLat) maxLat = lat
    }
  }
  if (geometry?.type === 'Polygon') geometry.coordinates.forEach(visitRing)
  else if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach((poly) => poly.forEach(visitRing))
  return [minLng, minLat, maxLng, maxLat]
}

export function pointInBBox([lng, lat], [minLng, minLat, maxLng, maxLat]) {
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat
}

/**
 * Precomputes each feature's bbox once, so looking up many points against
 * the same region set (e.g. tagging every shelter with its province) doesn't
 * redo that O(ring-length) work per point — see boundingBoxOf's comment.
 *
 * @param {GeoJSON.FeatureCollection} featureCollection - from loadRegionBoundaries()
 * @param {string} nameProperty
 */
export function buildRegionIndex(featureCollection, nameProperty) {
  const features = featureCollection?.features ?? []
  return {
    nameProperty,
    entries: features.map((feature) => ({
      name: feature.properties?.[nameProperty] ?? null,
      geometry: feature.geometry,
      bbox: boundingBoxOf(feature.geometry),
    })),
  }
}

/**
 * Finds which region in a buildRegionIndex() result contains the given
 * [lng, lat] point (e.g. a shelter's coordinates), returning that region's
 * display name — or null if the point falls outside every region (bad
 * coordinates, or a country the boundary set doesn't fully cover).
 *
 * @param {[number, number]} point
 * @param {ReturnType<typeof buildRegionIndex>} index
 * @returns {string|null}
 */
export function findRegionNameForPoint(point, index) {
  for (const entry of index?.entries ?? []) {
    if (!pointInBBox(point, entry.bbox)) continue
    if (pointInGeometry(point, entry.geometry)) return entry.name
  }
  return null
}
