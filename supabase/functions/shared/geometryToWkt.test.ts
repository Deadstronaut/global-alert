import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { geometryToWkt } from './geometryToWkt.ts'

Deno.test('geometryToWkt: Point converts correctly', () => {
  const result = geometryToWkt({ type: 'Point', coordinates: [27.1, 38.5] })
  assertEquals(result, 'POINT(27.1 38.5)')
})

Deno.test('geometryToWkt: Polygon converts correctly', () => {
  const result = geometryToWkt({
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  })
  assertEquals(result, 'POLYGON((0 0, 1 0, 1 1, 0 0))')
})

Deno.test('geometryToWkt: MultiPolygon converts correctly', () => {
  const result = geometryToWkt({
    type: 'MultiPolygon',
    coordinates: [
      [[[0, 0], [1, 0], [1, 1], [0, 0]]],
      [[[2, 2], [3, 2], [3, 3], [2, 2]]],
    ],
  })
  assertEquals(result, 'MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2)))')
})

Deno.test('geometryToWkt: unsupported geometry type throws', () => {
  assertThrows(
    () => geometryToWkt({ type: 'LineString', coordinates: [[0, 0], [1, 1]] }),
    Error,
    'Unsupported geometry type: LineString',
  )
})
