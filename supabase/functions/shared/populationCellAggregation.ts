/**
 * Aggregates fine-grained population records (e.g. Kontur's native
 * ~res-8 hexagons, ~458K rows for Turkey) up into coarser H3 cells by
 * summing population per cell — mirrors rasterToHexagon.ts's pixel-center
 * accumulation approach so vector-sourced population data lands at the same
 * rendering-scale resolution as WorldPop's raster-sourced data
 * (rasterSourceConfig.ts's h3Resolution: 7), instead of shipping every
 * native-resolution polygon to the client. Without this, Kontur TR's
 * 457,761-feature dataset makes get_dataset_features_geojson exceed the DB
 * statement timeout on every load — live-verified during triage (2026-07-19).
 */

import { latLngToCell, cellToBoundary } from 'https://esm.sh/h3-js@4.1.0'
import type { PopulationRecord } from './populationRecord.ts'

function centroidOf(geometry: PopulationRecord['geometry']): [number, number] | null {
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates as [number, number]
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
  }

  const ring =
    geometry.type === 'Polygon'
      ? (geometry.coordinates as number[][][])[0]
      : geometry.type === 'MultiPolygon'
        ? (geometry.coordinates as number[][][][])[0]?.[0]
        : null
  if (!ring || ring.length === 0) return null

  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of ring) {
    sumLng += lng
    sumLat += lat
  }
  const lat = sumLat / ring.length
  const lng = sumLng / ring.length
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

export function aggregatePopulationRecordsToHexagons(
  records: PopulationRecord[],
  resolution: number,
): PopulationRecord[] {
  const accumulator = new Map<string, number>()

  for (const record of records) {
    const centroid = centroidOf(record.geometry)
    if (!centroid) continue
    const [lat, lng] = centroid
    const cell = latLngToCell(lat, lng, resolution)
    accumulator.set(cell, (accumulator.get(cell) ?? 0) + record.population)
  }

  const countryCode = records[0]?.countryCode ?? ''
  const out: PopulationRecord[] = []
  for (const [cell, population] of accumulator) {
    const boundary = cellToBoundary(cell, true) as [number, number][]
    out.push({
      geometry: { type: 'Polygon', coordinates: [[...boundary, boundary[0]]] },
      population,
      countryCode,
      properties: { h3Cell: cell, source: 'kontur' },
    })
  }
  return out
}
