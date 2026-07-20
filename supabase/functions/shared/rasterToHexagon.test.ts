import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { writeArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
import { aggregateRasterToHexagons, geometryBoundingBox } from './rasterToHexagon.ts'
import { WORLDPOP_SOURCE_CONFIG } from './rasterSourceConfig.ts'

// geotiff.js's writeArrayBuffer anchors the synthetic raster at a fixed
// (-180, 90) origin regardless of a supplied ModelTiepoint (live-verified
// during test authoring) — tests work with that fixed layout rather than
// fighting it, since only the read-path (aggregateRasterToHexagons) is
// under test, not raster authoring.
// geotiff.js's writeArrayBuffer defaults to 8-bit unsigned samples
// regardless of the Float32Array input type (live-verified during test
// authoring) — a negative sentinel wraps around under that encoding, so
// tests use an in-range (0-255) no-data sentinel instead of a negative one;
// the no-data *exclusion logic itself* (isValidPixel) is exercised
// identically either way, since it compares against whatever
// getGDALNoData() reports, not a hardcoded sign check alone.
async function buildRaster(values: number[], width: number, height: number, noData = 250) {
  return await writeArrayBuffer(new Float32Array(values), {
    width,
    height,
    ModelPixelScale: [0.01, 0.01, 0],
    ModelTiepoint: [0, 0, 0, 30, 40, 0],
    GDAL_NODATA: String(noData),
  })
}

// geotiff.js's writeArrayBuffer always anchors the synthetic raster at
// (-180, 90) — the north pole / antimeridian corner — regardless of the
// supplied ModelTiepoint (live-verified during test authoring). H3 cells
// near a pole are distorted enough that a cell's true center can sit at a
// longitude far from the raster's own pixel longitudes (live-verified: a
// pixel near -180,90 produced a cell centered at lng ~174.6) — a real-world
// artifact of the icosahedral grid near poles, not a bug in this module,
// and not representative of Turkey/Madagascar's actual (non-polar)
// latitudes. A full-globe boundary sidesteps this test-fixture limitation
// without weakening what's under test (the exclusion *logic*, exercised by
// FAR_AWAY_BOUNDARY below).
const WORLD_BOUNDARY: GeoJSON.Geometry = {
  type: 'Polygon',
  coordinates: [[[-180, -90], [-180, 90], [180, 90], [180, -90], [-180, -90]]],
}

const FAR_AWAY_BOUNDARY: GeoJSON.Geometry = {
  type: 'Polygon',
  coordinates: [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
}

Deno.test('aggregateRasterToHexagons sums valid pixel values into hexagons', async () => {
  const buf = await buildRaster([1, 2, 3, 4, 5, 6, 7, 8], 4, 2)
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, WORLD_BOUNDARY, 'tr')
  assert(records.length > 0)
  const total = records.reduce((sum, r) => sum + r.populationCount, 0)
  assertEquals(total, 1 + 2 + 3 + 4 + 5 + 6 + 7 + 8)
})

Deno.test('aggregateRasterToHexagons excludes no-data pixels rather than treating them as zero', async () => {
  const buf = await buildRaster([250, 2, 3, 4, 250, 6, 7, 8], 4, 2)
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, WORLD_BOUNDARY, 'tr')
  const total = records.reduce((sum, r) => sum + r.populationCount, 0)
  assertEquals(total, 2 + 3 + 4 + 6 + 7 + 8)
})

Deno.test('aggregateRasterToHexagons excludes hexagons whose center falls outside the country boundary', async () => {
  const buf = await buildRaster([1, 2, 3, 4, 5, 6, 7, 8], 4, 2)
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, FAR_AWAY_BOUNDARY, 'tr')
  assertEquals(records.length, 0)
})

Deno.test('aggregateRasterToHexagons: a hexagon receiving zero valid pixels never becomes a record', async () => {
  const buf = await buildRaster([250, 250, 250, 250, 250, 250, 250, 250], 4, 2)
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, WORLD_BOUNDARY, 'tr')
  assertEquals(records.length, 0)
})

Deno.test('aggregateRasterToHexagons produces valid Polygon geometry for each hexagon', async () => {
  const buf = await buildRaster([1, 2, 3, 4, 5, 6, 7, 8], 4, 2)
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, WORLD_BOUNDARY, 'tr')
  for (const record of records) {
    assertEquals(record.geometry.type, 'Polygon')
    const ring = (record.geometry.coordinates as number[][][])[0]
    assert(ring.length >= 4)
    assertEquals(ring[0][0], ring[ring.length - 1][0])
    assertEquals(ring[0][1], ring[ring.length - 1][1])
    assertEquals(record.properties.source, 'worldpop')
    assertEquals(record.countryCode, 'tr')
  }
})

Deno.test('geometryBoundingBox: computes the box for a simple Polygon', () => {
  const geometry: GeoJSON.Geometry = {
    type: 'Polygon',
    coordinates: [[[43.2, -25.6], [50.5, -25.6], [50.5, -11.9], [43.2, -11.9], [43.2, -25.6]]],
  }
  assertEquals(geometryBoundingBox(geometry), [43.2, -25.6, 50.5, -11.9])
})

Deno.test('geometryBoundingBox: computes the union box across a GeometryCollection', () => {
  const geometry: GeoJSON.Geometry = {
    type: 'GeometryCollection',
    geometries: [
      { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
      { type: 'Polygon', coordinates: [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]] },
    ],
  }
  assertEquals(geometryBoundingBox(geometry), [0, 0, 6, 6])
})

Deno.test('geometryBoundingBox: handles MultiPolygon nesting depth', () => {
  const geometry: GeoJSON.Geometry = {
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
      [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
    ],
  }
  assertEquals(geometryBoundingBox(geometry), [0, 0, 12, 12])
})

Deno.test('aggregateRasterToHexagons: a boundary bbox with no overlap in the raster crops to nothing, not an error', async () => {
  const buf = await buildRaster([1, 2, 3, 4, 5, 6, 7, 8], 4, 2)
  // Same coordinates as FAR_AWAY_BOUNDARY, exercised explicitly against the
  // new pixel-space cropping path (not just the post-hoc point-in-boundary
  // filter) — this must clamp to an empty window, not throw or hang.
  const records = await aggregateRasterToHexagons(buf, WORLDPOP_SOURCE_CONFIG, FAR_AWAY_BOUNDARY, 'tr')
  assertEquals(records.length, 0)
})
