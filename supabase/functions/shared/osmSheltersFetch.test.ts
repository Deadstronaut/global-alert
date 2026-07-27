import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildQuery, computeConfidenceLevel, mapOverpassResponseToShelterRecords } from './osmSheltersFetch.ts'

Deno.test('buildQuery: uppercases the country code for the ISO3166-1 filter', () => {
  const query = buildQuery('tr')
  assert(query.includes('ISO3166-1"="TR"'))
  assert(!query.includes('ISO3166-1"="tr"'))
})

Deno.test('buildQuery: includes all four tag branches, including amenity=shelter', () => {
  const query = buildQuery('tr')
  assert(query.includes('"emergency"="assembly_point"'))
  assert(query.includes('"social_facility"="shelter"'))
  assert(query.includes('"evacuation_center"="yes"'))
  assert(query.includes('"amenity"="shelter"'))
})

Deno.test('computeConfidenceLevel: emergency=assembly_point is level 4', () => {
  assertEquals(computeConfidenceLevel({ emergency: 'assembly_point' }), 4)
})

Deno.test('computeConfidenceLevel: social_facility=shelter is level 4', () => {
  assertEquals(computeConfidenceLevel({ social_facility: 'shelter' }), 4)
})

Deno.test('computeConfidenceLevel: evacuation_center=yes is level 4', () => {
  assertEquals(computeConfidenceLevel({ evacuation_center: 'yes' }), 4)
})

Deno.test('computeConfidenceLevel: amenity=shelter with a known-noise shelter_type is level 1', () => {
  assertEquals(computeConfidenceLevel({ amenity: 'shelter', shelter_type: 'public_transport' }), 1)
  assertEquals(computeConfidenceLevel({ amenity: 'shelter', shelter_type: 'picnic_shelter' }), 1)
})

Deno.test('computeConfidenceLevel: amenity=shelter with no shelter_type tag is level 2', () => {
  assertEquals(computeConfidenceLevel({ amenity: 'shelter' }), 2)
})

Deno.test('computeConfidenceLevel: amenity=shelter with an unrecognized shelter_type is level 3', () => {
  assertEquals(computeConfidenceLevel({ amenity: 'shelter', shelter_type: 'some_other_value' }), 3)
})

Deno.test('computeConfidenceLevel: the narrow disaster tags win even alongside amenity=shelter', () => {
  assertEquals(
    computeConfidenceLevel({ amenity: 'shelter', shelter_type: 'public_transport', emergency: 'assembly_point' }),
    4,
  )
})

Deno.test('computeConfidenceLevel: neither branch matching falls back to level 1', () => {
  assertEquals(computeConfidenceLevel({ amenity: 'restaurant' }), 1)
})

Deno.test('mapOverpassResponseToShelterRecords: reads a way/relation\'s nested center object, not top-level lat/lon', () => {
  const records = mapOverpassResponseToShelterRecords(
    {
      elements: [
        // Ways/relations never get top-level lat/lon from `out center` —
        // only a nested `center` object. Before this was handled, every
        // element like this was silently dropped (live-verified: 2622 of
        // 7190 amenity=shelter elements in Turkey are ways).
        { type: 'way', id: 1, center: { lat: 37.92, lon: 44.08 }, tags: { amenity: 'shelter' } },
      ],
    },
    'tr',
  )
  assertEquals(records.length, 1)
  assertEquals(records[0].lat, 37.92)
  assertEquals(records[0].lng, 44.08)
})

Deno.test('mapOverpassResponseToShelterRecords: skips a way with neither top-level lat/lon nor a center object', () => {
  const records = mapOverpassResponseToShelterRecords(
    { elements: [{ type: 'way', id: 1, tags: { amenity: 'shelter' } }] },
    'tr',
  )
  assertEquals(records.length, 0)
})

Deno.test('mapOverpassResponseToShelterRecords: sets confidenceLevel per element from its own tags', () => {
  const records = mapOverpassResponseToShelterRecords(
    {
      elements: [
        { type: 'node', id: 1, lat: 41.0, lon: 27.0, tags: { emergency: 'assembly_point', name: 'A' } },
        { type: 'node', id: 2, lat: 41.1, lon: 27.1, tags: { amenity: 'shelter', shelter_type: 'public_transport' } },
        { type: 'node', id: 3, lat: 41.2, lon: 27.2, tags: { amenity: 'shelter' } },
      ],
    },
    'tr',
  )
  assertEquals(records.length, 3)
  assertEquals(records[0].confidenceLevel, 4)
  assertEquals(records[1].confidenceLevel, 1)
  assertEquals(records[2].confidenceLevel, 2)
})
