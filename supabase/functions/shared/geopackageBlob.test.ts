import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { parseGeoPackageGeometry } from './geopackageBlob.ts'

// Real geometry blob captured live from Kontur Population's Turkey .gpkg file
// (kontur_population_TR_20231101.gpkg, feature fid=1, h3='883f6edb6dfffff')
// during implementation — not synthetic, so this test proves the parser
// against the actual upstream format, not just an assumed one.
const REAL_KONTUR_HEXAGON_BLOB = new Uint8Array([
  71, 80, 0, 3, 17, 15, 0, 0, 161, 205, 81, 232, 213, 200, 72, 65, 159, 168, 135, 212, 161, 203, 72,
  65, 198, 227, 180, 106, 31, 1, 81, 65, 88, 20, 45, 44, 99, 2, 81, 65, 1, 3, 0, 0, 0, 1, 0, 0, 0, 7,
  0, 0, 0, 53, 113, 124, 35, 105, 201, 72, 65, 8, 216, 19, 151, 83, 2, 81, 65, 161, 205, 81, 232, 213,
  200, 72, 65, 168, 219, 127, 180, 177, 1, 81, 65, 205, 103, 7, 163, 168, 201, 72, 65, 198, 227, 180,
  106, 31, 1, 81, 65, 5, 105, 200, 148, 14, 203, 72, 65, 146, 252, 166, 255, 46, 1, 81, 65, 159, 168,
  135, 212, 161, 203, 72, 65, 143, 43, 139, 222, 208, 1, 81, 65, 147, 138, 241, 29, 207, 202, 72, 65,
  88, 20, 45, 44, 99, 2, 81, 65, 53, 113, 124, 35, 105, 201, 72, 65, 8, 216, 19, 151, 83, 2, 81, 65,
])

Deno.test('parseGeoPackageGeometry: real Kontur H3 hexagon parses to a closed 7-point Polygon ring in WGS84', () => {
  const result = parseGeoPackageGeometry(REAL_KONTUR_HEXAGON_BLOB)
  assertEquals(result.type, 'Polygon')

  const rings = result.coordinates as [number, number][][]
  assertEquals(rings.length, 1)
  const ring = rings[0]
  assertEquals(ring.length, 7) // H3 hexagon: 6 vertices + closing point

  // Ring must be closed (first point === last point).
  assertEquals(ring[0][0], ring[6][0])
  assertEquals(ring[0][1], ring[6][1])

  // Reprojected coordinates must land in Turkey's real geographic range
  // (not still in Web Mercator meters) — confirms EPSG:3857->4326 conversion.
  for (const [lng, lat] of ring) {
    if (lng < 25 || lng > 45) throw new Error(`longitude out of Turkey's range: ${lng}`)
    if (lat < 35 || lat > 43) throw new Error(`latitude out of Turkey's range: ${lat}`)
  }
})

Deno.test('parseGeoPackageGeometry: rejects blob missing GP magic bytes', () => {
  const bad = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])
  assertThrows(() => parseGeoPackageGeometry(bad), Error, 'GP')
})

Deno.test('parseGeoPackageGeometry: rejects too-short blob', () => {
  const bad = new Uint8Array([71, 80, 0])
  assertThrows(() => parseGeoPackageGeometry(bad), Error, 'too short')
})

Deno.test('parseGeoPackageGeometry: rejects unsupported WKB type (e.g. Point)', () => {
  // Minimal synthetic blob: GP header (no envelope) + WKB Point (type 1).
  const header = [0x47, 0x50, 0, 0x00, 0, 0, 0, 0] // flags=0 -> no envelope, big-endian(irrelevant, srs read but unused)
  const wkb = [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const blob = new Uint8Array([...header, ...wkb])
  assertThrows(() => parseGeoPackageGeometry(blob), Error, 'Unsupported WKB geometry type')
})
