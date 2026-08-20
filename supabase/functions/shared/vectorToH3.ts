/**
 * Vector-geometry-to-H3-cells adapter (spec-less follow-up, 2026-08-20 —
 * "hepsi kendi arasında korelasyonu çalışmalı... vektör katmanlara adaptörle
 * bir şekilde buna adapte etmemiz gerekiyor"). Every disaster event already
 * gets an h3_id (server/src/processors/normalizer.js, resolution 7) and
 * every raster exposure source already gets one per pixel
 * (rasterToHexagon.ts) — this fills the remaining gap for the project's
 * *vector* exposure sources (HydroBASINS polygons, HydroRivers lines, OSM
 * buildings points/polygons), whose real geometry stays untouched in
 * exposure_features.geom but is now ALSO indexed into the covering h3 cell
 * set below, so any of these can be correlated against a disaster event's
 * h3_id (or any other h3-indexed layer) via a plain cell-id join instead of
 * a per-pair ST_Distance computation.
 *
 * Resolution defaults to 7 to match normalizer.js's H3_RESOLUTION exactly —
 * a different resolution here would make the two systems' cell ids
 * incomparable without a parent/child conversion at query time.
 *
 * Covers exactly the 5 geometry types this project's own geometryToWkt.ts
 * already supports (Point/Polygon/MultiPolygon/LineString/MultiLineString)
 * — nothing here needs to handle a geometry shape the rest of the exposure
 * pipeline doesn't already accept.
 */
import { latLngToCell, polygonToCells } from 'https://esm.sh/h3-js@4.1.0'

export const VECTOR_H3_RESOLUTION = 7

interface Geometry {
  type: string
  coordinates: unknown
}

// h3-js has no native line-to-cells helper — this samples points along each
// segment roughly one resolution-7 cell-width apart (average edge length
// ~1.22km at res 7, so a ~1km step guarantees no stretch of a straight
// segment skips over an intermediate cell) and converts each sampled point.
// A short/local river segment shorter than one step still gets its two
// endpoints, so nothing is ever silently skipped.
const LINE_SAMPLE_STEP_KM = 1
const EARTH_RADIUS_KM = 6371

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

function samplePointsAlongSegment(
  lat1: number, lng1: number, lat2: number, lng2: number, stepKm: number,
): Array<[number, number]> {
  const distanceKm = haversineDistanceKm(lat1, lng1, lat2, lng2)
  const steps = Math.max(1, Math.ceil(distanceKm / stepKm))
  const points: Array<[number, number]> = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    points.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t])
  }
  return points
}

function lineToH3Cells(coords: number[][], resolution: number): string[] {
  const cells = new Set<string>()
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng1, lat1] = coords[i]
    const [lng2, lat2] = coords[i + 1]
    for (const [lat, lng] of samplePointsAlongSegment(lat1, lng1, lat2, lng2, LINE_SAMPLE_STEP_KM)) {
      cells.add(latLngToCell(lat, lng, resolution))
    }
  }
  if (coords.length === 1) {
    const [lng, lat] = coords[0]
    cells.add(latLngToCell(lat, lng, resolution))
  }
  return [...cells]
}

function polygonRingsToH3Cells(rings: number[][][], resolution: number): string[] {
  // isGeoJson=true lets polygonToCells take the ring's own [lng, lat] order
  // directly — no manual coordinate-swap needed.
  try {
    return polygonToCells(rings, resolution, true)
  } catch {
    return [] // degenerate/invalid ring (e.g. a self-intersecting import artifact) — leave uncorrelated rather than fail the whole feature's import
  }
}

/**
 * Returns the deduplicated set of h3 cell ids this geometry covers (a
 * polygon's full interior, a line's sampled path, or a single point's own
 * cell). Never throws — an unsupported/malformed geometry yields an empty
 * array, same "don't fail the whole import over one feature" stance
 * geometryToWkt.ts's callers already take for other geometry problems.
 */
export function geometryToH3Cells(geometry: Geometry, resolution = VECTOR_H3_RESOLUTION): string[] {
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = geometry.coordinates as number[]
      return [latLngToCell(lat, lng, resolution)]
    }
    case 'LineString':
      return lineToH3Cells(geometry.coordinates as number[][], resolution)
    case 'MultiLineString': {
      const cells = new Set<string>()
      for (const line of geometry.coordinates as number[][][]) {
        for (const cell of lineToH3Cells(line, resolution)) cells.add(cell)
      }
      return [...cells]
    }
    case 'Polygon':
      return polygonRingsToH3Cells(geometry.coordinates as number[][][], resolution)
    case 'MultiPolygon': {
      const cells = new Set<string>()
      for (const rings of geometry.coordinates as number[][][][]) {
        for (const cell of polygonRingsToH3Cells(rings, resolution)) cells.add(cell)
      }
      return [...cells]
    }
    default:
      return []
  }
}
