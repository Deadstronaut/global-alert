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

Deno.test('geometryToWkt: LineString converts correctly', () => {
  const result = geometryToWkt({
    type: 'LineString',
    coordinates: [[27.1, 38.5], [27.2, 38.6], [27.3, 38.7]],
  })
  assertEquals(result, 'LINESTRING(27.1 38.5, 27.2 38.6, 27.3 38.7)')
})

Deno.test('geometryToWkt: MultiLineString converts correctly', () => {
  const result = geometryToWkt({
    type: 'MultiLineString',
    coordinates: [
      [[0, 0], [1, 1]],
      [[2, 2], [3, 3]],
    ],
  })
  assertEquals(result, 'MULTILINESTRING((0 0, 1 1), (2 2, 3 3))')
})

Deno.test('geometryToWkt: LineString with no coordinates throws', () => {
  assertThrows(
    () => geometryToWkt({ type: 'LineString', coordinates: [] }),
    Error,
    'LineString has no coordinates',
  )
})

Deno.test('geometryToWkt: Polygon with no rings throws', () => {
  assertThrows(
    () => geometryToWkt({ type: 'Polygon', coordinates: [] }),
    Error,
    'Polygon has no rings',
  )
})

Deno.test('geometryToWkt: MultiPolygon with no polygons throws', () => {
  assertThrows(
    () => geometryToWkt({ type: 'MultiPolygon', coordinates: [] }),
    Error,
    'MultiPolygon has no polygons',
  )
})

Deno.test('geometryToWkt: unsupported geometry type throws', () => {
  assertThrows(
    () => geometryToWkt({ type: 'GeometryCollection', coordinates: [] }),
    Error,
    'Unsupported geometry type: GeometryCollection',
  )
})
