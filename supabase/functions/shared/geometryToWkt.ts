/**
 * Minimal GeoJSON-geometry-to-WKT converter covering the geometry types
 * realistically produced by common GIS export tools (Point/Polygon/
 * MultiPolygon/LineString/MultiLineString) — sufficient for exposure-dataset
 * uploads/imports without pulling in a full GIS conversion library
 * (Principle VIII).
 *
 * Extracted from upload-exposure-dataset/index.ts (feature 038) so scheduled
 * population-source import functions can reuse it without duplicating the
 * conversion logic. LineString/MultiLineString added by feature 040 (OSM
 * roads — OSM ways are line geometries); this also fixes a latent gap where
 * any manual line-geometry upload would have thrown "Unsupported geometry
 * type" (research.md §7 of that feature).
 */
export function geometryToWkt(geometry: { type: string; coordinates: unknown }): string {
  const ring = (coords: number[][]) => `(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
  const line = (coords: number[][]) => coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat] = geometry.coordinates as number[]
      return `POINT(${lng} ${lat})`
    }
    case 'Polygon': {
      const rings = geometry.coordinates as number[][][]
      if (rings.length === 0) throw new Error('Polygon has no rings')
      return `POLYGON(${rings.map(ring).join(', ')})`
    }
    case 'MultiPolygon': {
      const polys = geometry.coordinates as number[][][][]
      if (polys.length === 0) throw new Error('MultiPolygon has no polygons')
      return `MULTIPOLYGON(${polys.map((rings) => `(${rings.map(ring).join(', ')})`).join(', ')})`
    }
    case 'LineString': {
      const coords = geometry.coordinates as number[][]
      if (coords.length === 0) throw new Error('LineString has no coordinates')
      return `LINESTRING(${line(coords)})`
    }
    case 'MultiLineString': {
      const lines = geometry.coordinates as number[][][]
      if (lines.length === 0) throw new Error('MultiLineString has no coordinates')
      return `MULTILINESTRING(${lines.map((coords) => `(${line(coords)})`).join(', ')})`
    }
    default:
      throw new Error(`Unsupported geometry type: ${geometry.type}`)
  }
}
