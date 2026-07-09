/**
 * Minimal GeoJSON-geometry-to-WKT converter covering the geometry types
 * realistically produced by common GIS export tools (Point/Polygon/
 * MultiPolygon) — sufficient for exposure-dataset uploads/imports without
 * pulling in a full GIS conversion library (Principle VIII).
 *
 * Extracted from upload-exposure-dataset/index.ts (feature 038) so scheduled
 * population-source import functions can reuse it without duplicating the
 * conversion logic.
 */
export function geometryToWkt(geometry: { type: string; coordinates: unknown }): string {
  const ring = (coords: number[][]) => `(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = geometry.coordinates as number[]
      return `POINT(${lng} ${lat})`
    }
    case 'Polygon': {
      const rings = geometry.coordinates as number[][][]
      return `POLYGON(${rings.map(ring).join(', ')})`
    }
    case 'MultiPolygon': {
      const polys = geometry.coordinates as number[][][][]
      return `MULTIPOLYGON(${polys.map((rings) => `(${rings.map(ring).join(', ')})`).join(', ')})`
    }
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`)
  }
}
