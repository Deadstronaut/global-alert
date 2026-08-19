import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { mapGeoJsonFeaturesToBuildingRecords } from './osmPbfBuildings.ts'

// Shapes live-verified 2026-08-20 against a real `osmium export -a type,id`
// run on a Malta Geofabrik extract — `@type`/`@id` come from that flag, tags
// sit flat alongside them in `properties` (no separate `tags` sub-object,
// unlike Overpass's element.tags).
Deno.test('mapGeoJsonFeaturesToBuildingRecords: maps a Point node feature to a health facility', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [14.5049645, 35.8899318] },
        properties: { '@type': 'node', '@id': '156496732', amenity: 'hospital', name: 'Floriana Health Centre' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'MT')
  assertEquals(records.length, 1)
  const hospital = records[0]
  assertEquals(hospital.assetCategory, 'critical_infrastructure_health')
  assertEquals(hospital.sector, 'health')
  assertEquals(hospital.geometry.type, 'Point')
  assertEquals(hospital.geometry.coordinates, [14.5049645, 35.8899318])
  assertEquals(hospital.properties.osmId, 156496732)
  assertEquals(hospital.properties.osmType, 'node')
  assertEquals(hospital.properties.name, 'Floriana Health Centre')
  assertEquals(hospital.countryCode, 'MT')
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: maps a Polygon way feature, keeping full geometry (unlike the Overpass `out center` path)', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[[27.1, 38.5], [27.2, 38.5], [27.2, 38.6], [27.1, 38.5]]],
        },
        properties: { '@type': 'way', '@id': '9001', landuse: 'cemetery', name: 'Karşıyaka Mezarlığı' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records.length, 1)
  const cemetery = records[0]
  assertEquals(cemetery.assetCategory, 'critical_infrastructure_cemetery')
  assertEquals(cemetery.geometry.type, 'Polygon')
  assertEquals(cemetery.properties.osmType, 'way')
  assertEquals(cemetery.properties.osmId, 9001)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: landuse=industrial named "Organize Sanayi" maps to industrial category', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [32.8, 39.9] },
        properties: { '@type': 'node', '@id': '1', landuse: 'industrial', name: 'Ankara Organize Sanayi Bölgesi' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records[0].assetCategory, 'critical_infrastructure_industrial')
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: landuse=industrial without an OSB name is dropped (categoryFor returns null)', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [32.8, 39.9] },
        properties: { '@type': 'node', '@id': '2', landuse: 'industrial', name: 'Generic Depot Site' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records.length, 0)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: an incidental tagged node with no recognized category (e.g. barrier=gate, a way-outline vertex) is dropped, not thrown', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [14.5, 35.9] },
        properties: { '@type': 'node', '@id': '3', barrier: 'gate' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'MT')
  assertEquals(records.length, 0)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: a MultiPolygon (relation-based area, e.g. a cemetery or OSB boundary) is reduced to a centroid Point, not dropped', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'MultiPolygon' as const, coordinates: [[[[27.0, 38.4], [27.2, 38.4], [27.2, 38.6], [27.0, 38.6], [27.0, 38.4]]]] },
        properties: { '@type': 'relation', '@id': '4', military: 'base' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records.length, 1)
  const base = records[0]
  assertEquals(base.assetCategory, 'critical_infrastructure_military')
  assertEquals(base.geometry.type, 'Point')
  // Centroid of the 4 distinct ring corners (the closing 5th point repeats
  // the first, matching how a real GeoJSON ring is always closed).
  assertEquals(base.geometry.coordinates, [(27.0 + 27.2 + 27.2 + 27.0 + 27.0) / 5, (38.4 + 38.4 + 38.6 + 38.6 + 38.4) / 5])
  assertEquals(base.properties.osmType, 'relation')
  assertEquals(base.properties.osmId, 4)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: a LineString feature is skipped (none of our categories should ever produce one)', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: [[27.1, 38.5], [27.2, 38.5]] },
        properties: { '@type': 'way', '@id': '4b', amenity: 'fuel' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records.length, 0)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: a feature with no geometry is skipped, not thrown', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      { type: 'Feature' as const, geometry: null, properties: { '@type': 'node', '@id': '5', amenity: 'fuel' } },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  assertEquals(records.length, 0)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: empty collection returns empty array', () => {
  const records = mapGeoJsonFeaturesToBuildingRecords({ type: 'FeatureCollection', features: [] }, 'TR')
  assertEquals(records.length, 0)
})

Deno.test('mapGeoJsonFeaturesToBuildingRecords: capacity/beds/phone carry through when present, undefined when absent', () => {
  const collection = {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [27.1, 38.5] },
        properties: { '@type': 'node', '@id': '6', amenity: 'hospital', beds: '120', 'contact:phone': '+90 212 111 11 11' },
      },
      {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [27.1, 38.5] },
        properties: { '@type': 'node', '@id': '7', amenity: 'school', capacity: '300' },
      },
    ],
  }
  const records = mapGeoJsonFeaturesToBuildingRecords(collection, 'TR')
  const hospital = records.find((r) => r.properties.osmId === 6)!
  const school = records.find((r) => r.properties.osmId === 7)!
  assertEquals(hospital.properties.beds, '120')
  assertEquals(hospital.properties.phone, '+90 212 111 11 11')
  assertEquals(school.properties.capacity, '300')
  assert(school.properties.phone === undefined)
})
