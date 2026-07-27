/**
 * Aggregates already-loaded population-hexagon features up into province
 * (admin-boundary) totals for spec 046's province-level population view.
 * Runs entirely client-side, once per view-toggle, against data already
 * fetched by addExposureLayer() — no new fetch, no persisted table
 * (data-model.md).
 *
 * Centroid convention (average of the geometry's first ring's vertices)
 * mirrors supabase/functions/shared/populationCellAggregation.ts's
 * server-side centroidOf() so both layers treat a hex's "location" the same
 * way — acceptable for near-regular H3 hexagons (research.md §4).
 */

import { formatPopulationLabel } from './formatPopulationLabel.js'
import { pointInGeometry, boundingBoxOf, pointInBBox } from './geoPointInPolygon.js'

function centroidOf(geometry) {
  if (!geometry) return null
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null
  }

  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates?.[0]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates?.[0]?.[0]
        : null
  if (!ring || ring.length === 0) return null

  let sumLng = 0
  let sumLat = 0
  for (const [lng, lat] of ring) {
    sumLng += lng
    sumLat += lat
  }
  const lng = sumLng / ring.length
  const lat = sumLat / ring.length
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null
}

/**
 * @param {GeoJSON.FeatureCollection} populationFeatures - hexagon features with a numeric __metricValue property
 * @param {GeoJSON.FeatureCollection} provinceFeatureCollection - from loadRegionBoundaries()
 * @param {string} nameProperty - property key holding each province's display name
 * @returns {GeoJSON.FeatureCollection} one feature per province, with `provinceName` and `totalPopulation` injected
 */
export function aggregatePopulationByProvince(populationFeatures, provinceFeatureCollection, nameProperty) {
  const provinces = provinceFeatureCollection?.features ?? []
  const totals = new Array(provinces.length).fill(0)
  const bboxes = provinces.map((f) => boundingBoxOf(f.geometry))

  for (const feature of populationFeatures?.features ?? populationFeatures ?? []) {
    const value = feature?.properties?.__metricValue
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const centroid = centroidOf(feature.geometry)
    if (!centroid) continue

    for (let i = 0; i < provinces.length; i++) {
      if (!pointInBBox(centroid, bboxes[i])) continue
      if (pointInGeometry(centroid, provinces[i].geometry)) {
        totals[i] += value
        break // provinces don't overlap — a hex belongs to at most one
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features: provinces.map((feature, i) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        ...feature.properties,
        provinceName: feature.properties?.[nameProperty],
        totalPopulation: totals[i],
        // Mirrors the hexagon layer's own property name so
        // populationFillExpression() (exposureLayerColor.js) can render this
        // FeatureCollection with zero new color logic — same value,
        // duplicated under the name that function already reads.
        __metricValue: totals[i],
        // Always-on map label (province view has only dozens of features,
        // not tens of thousands like the hexagon grid, so no zoom-gating is
        // needed — MapLibre's own text-allow-overlap:false handles crowding
        // for the smallest provinces at low zoom).
        __provinceLabel: `${feature.properties?.[nameProperty] ?? ''}\n${formatPopulationLabel(totals[i])}`,
      },
    })),
  }
}
