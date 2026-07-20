import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapOverpassResponseToBuildingRecords, buildQuery } from './osmBuildingsFetch.ts'

Deno.test('buildQuery: uppercases the country code for the ISO3166-1 filter', () => {
  const query = buildQuery('tr')
  assert(query.includes('ISO3166-1"="TR"'))
  assert(!query.includes('ISO3166-1"="tr"'))
})

Deno.test('buildQuery: includes both the amenity and office=government branches', () => {
  const query = buildQuery('mg')
  assert(query.includes('"amenity"~"^('))
  assert(query.includes('"office"="government"'))
})

interface FixtureElement {
  type: 'way' | 'node' | 'relation'
  id: number
  lat?: number
  lon?: number
  tags?: Record<string, string>
  geometry?: ({ lat: number; lon: number } | null)[]
}

const FIXTURE_RESPONSE: { elements: FixtureElement[] } = {
  elements: [
    // Way (closed polygon footprint) tagged as a hospital.
    {
      type: 'way' as const,
      id: 111,
      tags: { amenity: 'hospital', name: 'City Hospital' },
      geometry: [
        { lat: 38.5, lon: 27.1 },
        { lat: 38.5, lon: 27.2 },
        { lat: 38.6, lon: 27.2 },
        { lat: 38.5, lon: 27.1 },
      ],
    },
    // Bare node (no footprint traced) tagged as a school.
    {
      type: 'node' as const,
      id: 222,
      lat: 38.4,
      lon: 27.0,
      tags: { amenity: 'school', name: 'Village School' },
    },
    // office=government, not amenity — the second query branch.
    {
      type: 'way' as const,
      id: 333,
      tags: { office: 'government' },
      geometry: [
        { lat: 38.3, lon: 27.3 },
        { lat: 38.3, lon: 27.4 },
        { lat: 38.35, lon: 27.35 },
        { lat: 38.3, lon: 27.3 },
      ],
    },
    // Untagged / irrelevant amenity — must be skipped, not thrown.
    {
      type: 'node' as const,
      id: 444,
      lat: 38.2,
      lon: 27.2,
      tags: { amenity: 'restaurant' },
    },
    // Way with no tags at all — must be skipped.
    {
      type: 'way' as const,
      id: 555,
      geometry: [{ lat: 38.0, lon: 27.0 }, { lat: 38.1, lon: 27.1 }],
    },
    // Relation — intentionally always skipped regardless of tags.
    {
      type: 'relation' as const,
      id: 666,
      tags: { amenity: 'hospital' },
    },
    // Way with too few nodes for a polygon ring — must be skipped.
    {
      type: 'way' as const,
      id: 777,
      tags: { amenity: 'clinic' },
      geometry: [{ lat: 38.0, lon: 27.0 }, { lat: 38.1, lon: 27.1 }],
    },
  ],
}

Deno.test('mapOverpassResponseToBuildingRecords: maps a closed way to a Polygon health facility', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  const hospital = records.find((r) => r.properties.osmId === 111)!
  assertEquals(hospital.geometry.type, 'Polygon')
  assertEquals(hospital.assetCategory, 'critical_infrastructure_health')
  assertEquals(hospital.properties.facilityType, 'hospital')
  assertEquals(hospital.properties.osmType, 'way')
  assertEquals(hospital.countryCode, 'TR')
})

Deno.test('mapOverpassResponseToBuildingRecords: maps a bare node to a Point education facility', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  const school = records.find((r) => r.properties.osmId === 222)!
  assertEquals(school.geometry.type, 'Point')
  assertEquals(school.geometry.coordinates, [27.0, 38.4])
  assertEquals(school.assetCategory, 'critical_infrastructure_education')
  assertEquals(school.properties.osmType, 'node')
})

Deno.test('mapOverpassResponseToBuildingRecords: office=government maps to emergency category', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  const gov = records.find((r) => r.properties.osmId === 333)!
  assertEquals(gov.assetCategory, 'critical_infrastructure_emergency')
  assertEquals(gov.properties.facilityType, 'government_office')
})

Deno.test('mapOverpassResponseToBuildingRecords: skips elements with no matching tag', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 444))
  assert(!records.some((r) => r.properties.osmId === 555))
})

Deno.test('mapOverpassResponseToBuildingRecords: skips relations even if tagged', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 666))
})

Deno.test('mapOverpassResponseToBuildingRecords: skips ways with fewer than 3 usable nodes', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 777))
})

Deno.test('mapOverpassResponseToBuildingRecords: closes an unclosed polygon ring', () => {
  const response = {
    elements: [
      {
        type: 'way' as const,
        id: 888,
        tags: { amenity: 'hospital' },
        geometry: [
          { lat: 38.5, lon: 27.1 },
          { lat: 38.5, lon: 27.2 },
          { lat: 38.6, lon: 27.2 },
        ],
      },
    ],
  }
  const records = mapOverpassResponseToBuildingRecords(response, 'TR')
  const ring = records[0].geometry.coordinates as number[][][]
  const points = ring[0]
  assertEquals(points[0], points[points.length - 1])
})

Deno.test('mapOverpassResponseToBuildingRecords: empty elements returns empty array', () => {
  const records = mapOverpassResponseToBuildingRecords({ elements: [] }, 'MG')
  assertEquals(records.length, 0)
})
