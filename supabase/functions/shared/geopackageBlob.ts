/**
 * Minimal OGC GeoPackage binary geometry blob parser — Polygon/MultiPolygon
 * only (sufficient for Kontur Population's H3-hexagon Polygon features;
 * verified live during implementation against a real Kontur .gpkg file).
 *
 * GeoPackage binary geometry format (OGC 12-128r19 §2.1.3):
 *   byte 0-1: magic "GP" (0x47 0x50)
 *   byte 2:   version
 *   byte 3:   flags (bit 0 = byte order; bits 1-3 = envelope indicator;
 *             bit 4 = empty geometry)
 *   byte 4-7: srs_id (int32, byte order per flags)
 *   envelope: 0/32/48/64 bytes depending on envelope indicator (skipped —
 *             this parser reads geometry from the WKB body, not the envelope)
 *   then:     standard WKB geometry
 *
 * Reprojects EPSG:3857 (Web Mercator, Kontur's srs_id) to EPSG:4326 (WGS84,
 * this system's exposure_features.geom SRID) using the standard inverse
 * Web Mercator formula — no proj4/GDAL dependency needed for this one
 * well-known, closed-form projection pair.
 */

const ENVELOPE_BYTE_LENGTHS = [0, 32, 48, 48, 64]

export interface ParsedGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: unknown
}

function webMercatorToWgs84(x: number, y: number): [number, number] {
  const R = 6378137
  const lng = (x / R) * (180 / Math.PI)
  const lat = (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * (180 / Math.PI)
  return [lng, lat]
}

class ByteReader {
  private offset = 0
  constructor(private view: DataView, private littleEndian: boolean) {}

  seek(offset: number) {
    this.offset = offset
  }

  uint8(): number {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  uint32(): number {
    const v = this.view.getUint32(this.offset, this.littleEndian)
    this.offset += 4
    return v
  }

  float64(): number {
    const v = this.view.getFloat64(this.offset, this.littleEndian)
    this.offset += 8
    return v
  }
}

function readRing(reader: ByteReader): [number, number][] {
  const numPoints = reader.uint32()
  const ring: [number, number][] = []
  for (let i = 0; i < numPoints; i++) {
    const x = reader.float64()
    const y = reader.float64()
    ring.push(webMercatorToWgs84(x, y))
  }
  return ring
}

function readPolygonRings(reader: ByteReader): [number, number][][] {
  const numRings = reader.uint32()
  const rings: [number, number][][] = []
  for (let i = 0; i < numRings; i++) {
    rings.push(readRing(reader))
  }
  return rings
}

/**
 * Parses a GeoPackage geometry BLOB into GeoJSON-shaped { type, coordinates }
 * with EPSG:3857 coordinates reprojected to EPSG:4326. Throws on malformed
 * input or unsupported geometry types (only Polygon/MultiPolygon supported —
 * sufficient for Kontur; other geometry types would need this parser
 * extended, not silently mishandled).
 */
export function parseGeoPackageGeometry(blob: Uint8Array): ParsedGeometry {
  if (blob.length < 8) {
    throw new Error('GeoPackage geometry blob too short')
  }
  if (blob[0] !== 0x47 || blob[1] !== 0x50) {
    throw new Error('Not a GeoPackage geometry blob (missing "GP" magic bytes)')
  }

  const flags = blob[3]
  const gpLittleEndian = (flags & 0x01) === 1
  const envelopeIndicator = (flags >> 1) & 0x07
  const isEmpty = (flags & 0x10) !== 0
  if (isEmpty) {
    throw new Error('Empty GeoPackage geometry')
  }
  if (envelopeIndicator >= ENVELOPE_BYTE_LENGTHS.length) {
    throw new Error(`Invalid GeoPackage envelope indicator: ${envelopeIndicator}`)
  }

  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const header = new ByteReader(view, gpLittleEndian)
  header.seek(4)
  header.uint32() // srs_id — not re-read here; caller/schema already knows it's 3857 for Kontur

  const wkbOffset = 8 + ENVELOPE_BYTE_LENGTHS[envelopeIndicator]
  if (blob.length <= wkbOffset) {
    throw new Error('GeoPackage geometry blob has no WKB body')
  }

  const wkbByteOrder = blob[wkbOffset]
  const wkbLittleEndian = wkbByteOrder === 1
  const wkb = new ByteReader(view, wkbLittleEndian)
  wkb.seek(wkbOffset + 1)
  const wkbType = wkb.uint32()

  if (wkbType === 3) {
    // Polygon
    const rings = readPolygonRings(wkb)
    return { type: 'Polygon', coordinates: rings }
  }

  if (wkbType === 6) {
    // MultiPolygon
    const numPolygons = wkb.uint32()
    const polygons: [number, number][][][] = []
    for (let i = 0; i < numPolygons; i++) {
      wkb.uint8() // nested byte order (assumed same as outer — true for well-formed WKB)
      wkb.uint32() // nested geometry type (assumed Polygon = 3)
      polygons.push(readPolygonRings(wkb))
    }
    return { type: 'MultiPolygon', coordinates: polygons }
  }

  throw new Error(`Unsupported WKB geometry type: ${wkbType} (only Polygon/MultiPolygon supported)`)
}
