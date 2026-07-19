import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { clipToCountryBoundary } from './hydroshedsClip.ts'

// A simple 2x2 square boundary centered at (0,0): [-1,-1] to [1,1]
const SQUARE_BOUNDARY = {
  type: 'Polygon',
  coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]]],
}

function pointFeature(lng: number, lat: number) {
  return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } }
}

function lineFeature(coords: number[][]) {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }
}

Deno.test('clipToCountryBoundary: feature fully inside boundary is kept', () => {
  const result = clipToCountryBoundary([pointFeature(0, 0)], SQUARE_BOUNDARY)
  assertEquals(result.length, 1)
})

Deno.test('clipToCountryBoundary: feature fully outside boundary is dropped', () => {
  const result = clipToCountryBoundary([pointFeature(10, 10)], SQUARE_BOUNDARY)
  assertEquals(result.length, 0)
})

Deno.test('clipToCountryBoundary: feature straddling the boundary is kept', () => {
  const result = clipToCountryBoundary([lineFeature([[-5, 0], [5, 0]])], SQUARE_BOUNDARY)
  assertEquals(result.length, 1)
})

Deno.test('clipToCountryBoundary: empty input returns empty, no throw', () => {
  const result = clipToCountryBoundary([], SQUARE_BOUNDARY)
  assertEquals(result, [])
})

Deno.test('clipToCountryBoundary: mixed batch keeps only overlapping features', () => {
  const result = clipToCountryBoundary(
    [pointFeature(0, 0), pointFeature(50, 50), pointFeature(0.5, 0.5)],
    SQUARE_BOUNDARY,
  )
  assertEquals(result.length, 2)
})

Deno.test('clipToCountryBoundary: degenerate/missing geometry is skipped without throwing', () => {
  const result = clipToCountryBoundary(
    [{ type: 'Feature', properties: {}, geometry: null }, pointFeature(0, 0)],
    SQUARE_BOUNDARY,
  )
  assertEquals(result.length, 1)
})
