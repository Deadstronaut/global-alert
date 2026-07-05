/**
 * Standard ray-casting point-in-polygon test, extended to GeoJSON
 * Polygon/MultiPolygon geometries (with holes). No external dependency —
 * this is a well-known, compact algorithm, not worth pulling in turf.js for.
 */
function inRing(lat, lng, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function inPolygonCoords(lat, lng, polygonCoords) {
  // polygonCoords[0] = outer ring, rest = holes
  if (!inRing(lat, lng, polygonCoords[0])) return false
  for (let i = 1; i < polygonCoords.length; i++) {
    if (inRing(lat, lng, polygonCoords[i])) return false // inside a hole
  }
  return true
}

export function pointInGeometry(lat, lng, geometry) {
  if (!geometry) return false
  if (geometry.type === 'Polygon') {
    return inPolygonCoords(lat, lng, geometry.coordinates)
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => inPolygonCoords(lat, lng, poly))
  }
  return false
}

/**
 * @param {number} lat
 * @param {number} lng
 * @param {{type:'FeatureCollection', features:Array}} featureCollection
 * @param {string} nameProperty  which properties.* field holds the region name
 * @returns {string|null} matching feature's name, or null
 */
export function findRegion(lat, lng, featureCollection, nameProperty = 'shapeName') {
  for (const feature of featureCollection.features) {
    if (pointInGeometry(lat, lng, feature.geometry)) {
      return feature.properties[nameProperty]
    }
  }
  return null
}
