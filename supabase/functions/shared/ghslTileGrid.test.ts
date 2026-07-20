import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { tileIndicesForBoundingBox, tileZipUrl } from './ghslTileGrid.ts'

Deno.test('tileIndicesForBoundingBox: matches the live-verified R2_C5 tile bounds', () => {
  // R2_C5's own GeoTIFF bbox (live-verified 2026-07-20): lng [-140.008,
  // -130.008], lat [69.0996, 79.0996] — a bbox entirely inside that tile
  // must resolve to exactly that one tile.
  const tiles = tileIndicesForBoundingBox([-138, 72, -132, 76])
  assertEquals(tiles, [{ row: 2, col: 5 }])
})

Deno.test('tileIndicesForBoundingBox: a bbox spanning two tiles returns both', () => {
  // Straddles the C5/C6 boundary at lng -130.008.
  const tiles = tileIndicesForBoundingBox([-132, 72, -128, 76])
  assertEquals(tiles, [{ row: 2, col: 5 }, { row: 2, col: 6 }])
})

Deno.test('tileIndicesForBoundingBox: a bbox spanning a 2x2 block returns four tiles', () => {
  const tiles = tileIndicesForBoundingBox([-132, 68, -128, 72])
  assertEquals(tiles, [
    { row: 2, col: 5 }, { row: 2, col: 6 },
    { row: 3, col: 5 }, { row: 3, col: 6 },
  ])
})

Deno.test('tileZipUrl: builds the expected filename', () => {
  assertEquals(
    tileZipUrl({ row: 2, col: 5 }),
    'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_4326_30ss/V1-0/tiles/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0_R2_C5.zip',
  )
})
