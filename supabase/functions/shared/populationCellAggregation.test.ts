import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { latLngToCell, cellToBoundary } from 'https://esm.sh/h3-js@4.1.0'
import { aggregatePopulationRecordsToHexagons } from './populationCellAggregation.ts'
import type { PopulationRecord } from './populationRecord.ts'

const RES = 7

function polygonRecord(lat: number, lng: number, population: number, countryCode = 'tr'): PopulationRecord {
  // A small square "native-resolution" polygon centered near (lat, lng) —
  // stands in for one of Kontur's real fine-grained hexagons.
  const d = 0.001
  return {
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
    },
    population,
    countryCode,
    properties: { source: 'kontur' },
  }
}

Deno.test('aggregatePopulationRecordsToHexagons: sums population of records sharing a coarser cell', () => {
  // Two points close enough together to land in the same res-7 cell.
  const cell = latLngToCell(38.5, 27.15, RES)
  const records = [polygonRecord(38.5, 27.15, 100), polygonRecord(38.50001, 27.15001, 50)]
  const out = aggregatePopulationRecordsToHexagons(records, RES)
  assertEquals(out.length, 1)
  assertEquals(out[0].population, 150)
  assertEquals(out[0].properties.h3Cell, cell)
})

Deno.test('aggregatePopulationRecordsToHexagons: far-apart records land in separate cells', () => {
  const records = [polygonRecord(38.5, 27.15, 100), polygonRecord(39.9, 32.8, 200)]
  const out = aggregatePopulationRecordsToHexagons(records, RES)
  assertEquals(out.length, 2)
  const total = out.reduce((sum, r) => sum + r.population, 0)
  assertEquals(total, 300)
})

Deno.test('aggregatePopulationRecordsToHexagons: drastically reduces feature count vs. native resolution', () => {
  // 500 tiny neighboring polygons collapse into a small number of coarse cells.
  const records: PopulationRecord[] = []
  for (let i = 0; i < 500; i++) {
    records.push(polygonRecord(38.5 + (i % 20) * 0.0005, 27.15 + Math.floor(i / 20) * 0.0005, 10))
  }
  const out = aggregatePopulationRecordsToHexagons(records, RES)
  assert(out.length < records.length)
  const total = out.reduce((sum, r) => sum + r.population, 0)
  assertEquals(total, 5000)
})

Deno.test('aggregatePopulationRecordsToHexagons: empty input returns empty output', () => {
  assertEquals(aggregatePopulationRecordsToHexagons([], RES).length, 0)
})

Deno.test('aggregatePopulationRecordsToHexagons: each output record carries a valid Polygon geometry', () => {
  const out = aggregatePopulationRecordsToHexagons([polygonRecord(38.5, 27.15, 100)], RES)
  assertEquals(out[0].geometry.type, 'Polygon')
  const ring = (out[0].geometry.coordinates as number[][][])[0]
  assert(ring.length >= 6)
  assertEquals(ring[0][0], ring[ring.length - 1][0])
  assertEquals(ring[0][1], ring[ring.length - 1][1])
})
