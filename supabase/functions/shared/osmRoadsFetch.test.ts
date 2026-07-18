import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapOverpassResponseToRoadRecords, buildQuery } from './osmRoadsFetch.ts'

// Regression test for a live-verified bug (research.md §2 addendum): Overpass's
// ISO3166-1 tag is uppercase, but this system's country_code columns
// (country_boundaries, exposure_datasets) are lowercase — a lowercase query
// silently fails to resolve the area (returns an HTML error page, not JSON).
Deno.test('buildQuery: uppercases the country code for the ISO3166-1 filter', () => {
  const query = buildQuery('tr')
  assert(query.includes('ISO3166-1"="TR"'))
  assert(!query.includes('ISO3166-1"="tr"'))
})

// Fixture mirrors a real Overpass `out geom` response shape (research.md §2).
const FIXTURE_RESPONSE = {
  elements: [
    {
      type: 'way' as const,
      id: 111,
      tags: { highway: 'primary', name: 'D100' },
      geometry: [
        { lat: 38.5, lon: 27.1 },
        { lat: 38.6, lon: 27.2 },
        { lat: 38.7, lon: 27.3 },
      ],
    },
    {
      type: 'way' as const,
      id: 222,
      tags: { highway: 'residential' },
      geometry: [
        { lat: 38.4, lon: 27.0 },
        { lat: 38.41, lon: 27.01 },
      ],
    },
    // Malformed: missing tags.highway entirely — must be skipped, not thrown.
    {
      type: 'way' as const,
      id: 333,
      tags: {},
      geometry: [
        { lat: 38.0, lon: 27.0 },
        { lat: 38.1, lon: 27.1 },
      ],
    },
    // Malformed: fewer than 2 usable nodes after filtering nulls — must be skipped.
    {
      type: 'way' as const,
      id: 444,
      tags: { highway: 'primary' },
      geometry: [{ lat: 38.0, lon: 27.0 }, null],
    },
  ],
}

Deno.test('mapOverpassResponseToRoadRecords: maps valid ways to RoadRecord[]', () => {
  const records = mapOverpassResponseToRoadRecords(FIXTURE_RESPONSE, 'TR')
  assertEquals(records.length, 2)

  assertEquals(records[0].countryCode, 'TR')
  assertEquals(records[0].geometry.type, 'LineString')
  assertEquals(records[0].properties.highway, 'primary')
  assertEquals(records[0].properties.name, 'D100')
  assertEquals(records[0].properties.osmId, 111)
  assert(records[0].lengthMeters > 0)

  assertEquals(records[1].properties.highway, 'residential')
  assertEquals(records[1].properties.name, undefined)
})

Deno.test('mapOverpassResponseToRoadRecords: skips ways with missing highway tag', () => {
  const records = mapOverpassResponseToRoadRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 333))
})

Deno.test('mapOverpassResponseToRoadRecords: skips ways with fewer than 2 usable nodes', () => {
  const records = mapOverpassResponseToRoadRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 444))
})

Deno.test('mapOverpassResponseToRoadRecords: empty elements returns empty array', () => {
  const records = mapOverpassResponseToRoadRecords({ elements: [] }, 'MG')
  assertEquals(records.length, 0)
})
