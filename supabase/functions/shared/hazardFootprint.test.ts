import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { simulateHazardFootprint, earthquakeRadiusKm } from './hazardFootprint.ts'

Deno.test('earthquakeRadiusKm: matches src/lib/hazardBuffer.js formula (2^magnitude)', () => {
  assertEquals(earthquakeRadiusKm(7.0), 2 ** 7.0)
  assertEquals(earthquakeRadiusKm(0), 1)
})

Deno.test('simulateHazardFootprint: earthquake returns a Point footprint with correct radius', () => {
  const result = simulateHazardFootprint('earthquake', { magnitude: 7, epicenterLat: 39.9, epicenterLng: 32.8 })
  assertEquals(result.footprint?.type, 'Point')
  assertEquals(result.footprint?.coordinates, [32.8, 39.9])
  assertEquals(result.footprint?.radiusKm, 128)
  assertEquals(result.formulaRangeWarning, false)
})

Deno.test('simulateHazardFootprint: magnitude outside validated range sets formulaRangeWarning', () => {
  const result = simulateHazardFootprint('earthquake', { magnitude: 10.5, epicenterLat: 0, epicenterLng: 0 })
  assertEquals(result.formulaRangeWarning, true)
  assertEquals(result.footprint !== null, true)
})

Deno.test('simulateHazardFootprint: hazard type without a formula returns no_formula_available', () => {
  const result = simulateHazardFootprint('cyclone', { category: 3 })
  assertEquals(result.footprint, null)
  assertEquals(result.reason, 'no_formula_available')
})
