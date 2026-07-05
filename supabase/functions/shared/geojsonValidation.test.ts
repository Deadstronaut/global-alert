import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateGeojson } from './geojsonValidation.ts'

function validFeature(population = 100) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [[[10, 45], [11, 45], [11, 46], [10, 46], [10, 45]]] },
    properties: { population },
  }
}

function validCollection(features = [validFeature()]) {
  return { type: 'FeatureCollection', features }
}

Deno.test('validateGeojson: accepts a valid FeatureCollection', () => {
  const result = validateGeojson(validCollection(), 'population')
  assertEquals(result.valid, true)
})

Deno.test('validateGeojson: rejects a missing/wrong type', () => {
  assertEquals(validateGeojson({ type: 'Feature' }, 'population').valid, false)
  assertEquals(validateGeojson(null, 'population').valid, false)
  assertEquals(validateGeojson(undefined, 'population').valid, false)
})

Deno.test('validateGeojson: rejects an empty feature collection', () => {
  const result = validateGeojson(validCollection([]), 'population')
  assertEquals(result.valid, false)
})

Deno.test('validateGeojson: rejects out-of-bounds coordinates', () => {
  const feature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [999, 999] },
    properties: { population: 10 },
  }
  const result = validateGeojson(validCollection([feature]), 'population')
  assertEquals(result.valid, false)
})

Deno.test('validateGeojson: rejects a non-default crs member', () => {
  const geojson = { ...validCollection(), crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } } }
  const result = validateGeojson(geojson, 'population')
  assertEquals(result.valid, false)
})

Deno.test('validateGeojson: rejects a crs member not literally labeled 4326/WGS84 (conservative check)', () => {
  const geojson = { ...validCollection(), crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } } }
  // CRS84 doesn't contain "4326" or "WGS84" literally, so this is expected to be rejected by our
  // conservative string check — documenting that only an explicit 4326/WGS84 label passes.
  assertEquals(validateGeojson(geojson, 'population').valid, false)
})

Deno.test('validateGeojson: rejects a non-numeric metric property', () => {
  const feature = validFeature()
  feature.properties.population = 'not-a-number' as unknown as number
  const result = validateGeojson(validCollection([feature]), 'population')
  assertEquals(result.valid, false)
})

Deno.test('validateGeojson: rejects a missing metric property name', () => {
  const result = validateGeojson(validCollection(), '')
  assertEquals(result.valid, false)
})

Deno.test('validateGeojson: rejects a feature with no geometry', () => {
  const feature = { type: 'Feature', properties: { population: 10 } }
  const result = validateGeojson(validCollection([feature as any]), 'population')
  assertEquals(result.valid, false)
})
