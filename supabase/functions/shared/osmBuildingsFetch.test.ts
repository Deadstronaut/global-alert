import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  mapOverpassResponseToBuildingRecords,
  buildQuery,
  buildFuelQuery,
  buildAerowayQuery,
  buildCemeteryQuery,
  buildOsbQuery,
  buildMilitaryQuery,
  buildExtendedQueries,
} from './osmBuildingsFetch.ts'

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

Deno.test('buildQuery: core query excludes fuel (moved to the extended queries)', () => {
  const query = buildQuery('tr')
  assert(!query.includes('fuel'))
})

Deno.test('extended query builders: each targets one category with `out center;`, not `out geom;`', () => {
  assert(buildFuelQuery('tr').includes('"amenity"="fuel"'))
  assert(buildAerowayQuery('tr').includes('"aeroway"~"^('))
  assert(buildCemeteryQuery('tr').includes('"landuse"~"^('))
  assert(buildOsbQuery('tr').includes('"landuse"="industrial"]["name"~"Organize Sanayi"'))
  assert(buildMilitaryQuery('tr').includes('nwr["military"]'))
  for (const query of [buildFuelQuery('tr'), buildAerowayQuery('tr'), buildCemeteryQuery('tr'), buildOsbQuery('tr'), buildMilitaryQuery('tr')]) {
    assert(query.includes('ISO3166-1"="TR"'))
    assert(query.includes('out center;'))
    assert(!query.includes('out geom;'))
  }
})

Deno.test('buildExtendedQueries: returns one labeled query per extended category', () => {
  const queries = buildExtendedQueries('tr')
  assertEquals(queries.map((q) => q.label), ['fuel', 'aeroway', 'cemetery', 'osb', 'military'])
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
  assertEquals(hospital.sector, 'health')
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
  assertEquals(school.sector, 'education')
  assertEquals(school.properties.osmType, 'node')
})

Deno.test('mapOverpassResponseToBuildingRecords: office=government maps to emergency category', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  const gov = records.find((r) => r.properties.osmId === 333)!
  assertEquals(gov.assetCategory, 'critical_infrastructure_emergency')
  assertEquals(gov.sector, 'emergency')
  assertEquals(gov.properties.facilityType, 'government_office')
})

Deno.test('mapOverpassResponseToBuildingRecords: skips elements with no matching tag', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 444))
  assert(!records.some((r) => r.properties.osmId === 555))
})

const NEW_CATEGORY_FIXTURE: { elements: FixtureElement[] } = {
  elements: [
    { type: 'node', id: 3001, lat: 40.1, lon: 32.6, tags: { aeroway: 'aerodrome', name: 'Esenboğa Airport' } },
    { type: 'node', id: 3002, lat: 40.2, lon: 32.7, tags: { landuse: 'cemetery', name: 'Karşıyaka Mezarlığı' } },
    { type: 'node', id: 3003, lat: 40.3, lon: 32.8, tags: { amenity: 'fuel', name: 'Shell' } },
    { type: 'node', id: 3004, lat: 40.4, lon: 32.9, tags: { landuse: 'industrial', name: 'Ankara Organize Sanayi Bölgesi' } },
    // Same landuse=industrial tag but no OSB name match — must be skipped.
    { type: 'node', id: 3005, lat: 40.5, lon: 33.0, tags: { landuse: 'industrial', name: 'Generic Depot Site' } },
    { type: 'node', id: 3006, lat: 40.6, lon: 33.1, tags: { military: 'base', name: 'Example Base' } },
  ],
}

Deno.test('mapOverpassResponseToBuildingRecords: aeroway=aerodrome maps to transport category', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  const airport = records.find((r) => r.properties.osmId === 3001)!
  assertEquals(airport.assetCategory, 'critical_infrastructure_transport')
  assertEquals(airport.sector, 'transport')
  assertEquals(airport.properties.facilityType, 'aerodrome')
})

Deno.test('mapOverpassResponseToBuildingRecords: landuse=cemetery maps to cemetery category', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  const cemetery = records.find((r) => r.properties.osmId === 3002)!
  assertEquals(cemetery.assetCategory, 'critical_infrastructure_cemetery')
  assertEquals(cemetery.sector, 'cemetery')
})

Deno.test('mapOverpassResponseToBuildingRecords: amenity=fuel maps to fuel category', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  const fuel = records.find((r) => r.properties.osmId === 3003)!
  assertEquals(fuel.assetCategory, 'critical_infrastructure_fuel')
  assertEquals(fuel.sector, 'fuel')
})

Deno.test('mapOverpassResponseToBuildingRecords: landuse=industrial named "Organize Sanayi" maps to industrial category', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  const osb = records.find((r) => r.properties.osmId === 3004)!
  assertEquals(osb.assetCategory, 'critical_infrastructure_industrial')
  assertEquals(osb.sector, 'industrial')
})

Deno.test('mapOverpassResponseToBuildingRecords: landuse=industrial without OSB name is skipped', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  assert(!records.some((r) => r.properties.osmId === 3005))
})

Deno.test('mapOverpassResponseToBuildingRecords: a way with `center` (out center) maps to a Point, not a Polygon', () => {
  const response = {
    elements: [
      { type: 'way' as const, id: 4001, center: { lat: 41.03, lon: 28.99 }, tags: { landuse: 'cemetery', name: 'Karşıyaka Mezarlığı' } },
    ],
  }
  const records = mapOverpassResponseToBuildingRecords(response, 'TR')
  const cemetery = records.find((r) => r.properties.osmId === 4001)!
  assertEquals(cemetery.geometry.type, 'Point')
  assertEquals(cemetery.geometry.coordinates, [28.99, 41.03])
  assertEquals(cemetery.properties.osmType, 'way')
})

Deno.test('mapOverpassResponseToBuildingRecords: a relation with `center` maps to a Point (unlike a geometry-only relation, which is skipped)', () => {
  const response = {
    elements: [
      { type: 'relation' as const, id: 4002, center: { lat: 40.5, lon: 32.5 }, tags: { military: 'base', name: 'Example Base' } },
    ],
  }
  const records = mapOverpassResponseToBuildingRecords(response, 'TR')
  const base = records.find((r) => r.properties.osmId === 4002)!
  assertEquals(base.geometry.type, 'Point')
  assertEquals(base.assetCategory, 'critical_infrastructure_military')
  assertEquals(base.properties.osmType, 'relation')
})

Deno.test('mapOverpassResponseToBuildingRecords: military=* maps to military category', () => {
  const records = mapOverpassResponseToBuildingRecords(NEW_CATEGORY_FIXTURE, 'TR')
  const base = records.find((r) => r.properties.osmId === 3006)!
  assertEquals(base.assetCategory, 'critical_infrastructure_military')
  assertEquals(base.sector, 'military')
  assertEquals(base.properties.facilityType, 'military_base')
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

Deno.test('mapOverpassResponseToBuildingRecords: carries capacity/beds through when OSM has them', () => {
  const response: { elements: FixtureElement[] } = {
    elements: [
      {
        type: 'node',
        id: 999,
        lat: 38.5,
        lon: 27.1,
        tags: { amenity: 'hospital', name: 'Regional Hospital', beds: '120' },
      },
      {
        type: 'node',
        id: 1000,
        lat: 38.5,
        lon: 27.2,
        tags: { amenity: 'school', name: 'Elementary School', capacity: '300' },
      },
    ],
  }
  const records = mapOverpassResponseToBuildingRecords(response, 'TR')
  const hospital = records.find((r) => r.properties.osmId === 999)!
  const school = records.find((r) => r.properties.osmId === 1000)!
  assertEquals(hospital.properties.beds, '120')
  assertEquals(school.properties.capacity, '300')
})

Deno.test('mapOverpassResponseToBuildingRecords: prefers plain phone, falls back to contact:phone', () => {
  const response: { elements: FixtureElement[] } = {
    elements: [
      {
        type: 'node',
        id: 2001,
        lat: 38.5,
        lon: 27.1,
        tags: { amenity: 'hospital', phone: '+90 212 000 00 00', 'contact:phone': '+90 212 111 11 11' },
      },
      {
        type: 'node',
        id: 2002,
        lat: 38.5,
        lon: 27.2,
        tags: { amenity: 'school', 'contact:phone': '+90 212 222 22 22' },
      },
    ],
  }
  const records = mapOverpassResponseToBuildingRecords(response, 'TR')
  const withPlainPhone = records.find((r) => r.properties.osmId === 2001)!
  const withContactOnly = records.find((r) => r.properties.osmId === 2002)!
  assertEquals(withPlainPhone.properties.phone, '+90 212 000 00 00')
  assertEquals(withContactOnly.properties.phone, '+90 212 222 22 22')
})

Deno.test('mapOverpassResponseToBuildingRecords: capacity/beds/phone are undefined, not crashing, when OSM lacks them', () => {
  const records = mapOverpassResponseToBuildingRecords(FIXTURE_RESPONSE, 'TR')
  const hospital = records.find((r) => r.properties.osmId === 111)!
  assertEquals(hospital.properties.capacity, undefined)
  assertEquals(hospital.properties.phone, undefined)
  assertEquals(hospital.properties.beds, undefined)
})
