/**
 * Small, dependency-free lat/lng + radius(km) -> GeoJSON Polygon circle
 * generator (spec 050 US1) — deliberately not pulling in @turf/turf for one
 * function; this project has actively removed turf dependencies before to
 * keep the raster/import pipeline's memory footprint down (see
 * rasterToHexagon.ts's header comment), and this is the exact same
 * degrees-per-km approximation already used by demSlopeAggregate.ts
 * (latitude-corrected longitude conversion), just inverted (radius -> ring
 * of points instead of pixel spacing -> meters).
 */

const METERS_PER_DEG_LAT = 110_540
const METERS_PER_DEG_LNG_AT_EQUATOR = 111_320

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @param {number} points - ring vertex count (64 is smooth enough at any zoom this app renders at)
 * @returns {{ type: 'Polygon', coordinates: number[][][] }}
 */
export function circlePolygon(lat, lng, radiusKm, points = 64) {
  const radiusMeters = radiusKm * 1000
  const metersPerDegLng = METERS_PER_DEG_LNG_AT_EQUATOR * Math.cos((lat * Math.PI) / 180)
  const ring = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    const dLat = (radiusMeters * Math.sin(angle)) / METERS_PER_DEG_LAT
    const dLng = (radiusMeters * Math.cos(angle)) / metersPerDegLng
    ring.push([lng + dLng, lat + dLat])
  }
  return { type: 'Polygon', coordinates: [ring] }
}

/**
 * Great-circle-ish distance in km between two lat/lng points — same
 * approximation quality as the rest of this app's client-side distance math
 * (not a geodesic library), good enough at the halo-radius scale (tens to
 * a few hundred km) this feature operates at.
 */
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
