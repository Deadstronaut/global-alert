import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildRegionIndex, findRegionNameForPoint, pointInGeometry } from './geoPointInPolygon.ts'

const SQUARE_A = {
  type: 'Polygon',
  coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
}
const SQUARE_B = {
  type: 'Polygon',
  coordinates: [[[20, 20], [20, 30], [30, 30], [30, 20], [20, 20]]],
}

Deno.test('pointInGeometry: point inside a Polygon', () => {
  assertEquals(pointInGeometry([5, 5], SQUARE_A), true)
})

Deno.test('pointInGeometry: point outside a Polygon', () => {
  assertEquals(pointInGeometry([50, 50], SQUARE_A), false)
})

Deno.test('findRegionNameForPoint: resolves the containing region among several', () => {
  const index = buildRegionIndex(
    {
      features: [
        { properties: { shapeName: 'RegionA' }, geometry: SQUARE_A },
        { properties: { shapeName: 'RegionB' }, geometry: SQUARE_B },
      ],
    },
    'shapeName',
  )
  assertEquals(findRegionNameForPoint([5, 5], index), 'RegionA')
  assertEquals(findRegionNameForPoint([25, 25], index), 'RegionB')
})

Deno.test('findRegionNameForPoint: null when point is outside every region', () => {
  const index = buildRegionIndex(
    { features: [{ properties: { shapeName: 'RegionA' }, geometry: SQUARE_A }] },
    'shapeName',
  )
  assertEquals(findRegionNameForPoint([500, 500], index), null)
})
