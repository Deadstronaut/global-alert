import { describe, it, expect } from 'vitest'
import { aggregatePopulationByProvince } from '@/utils/provincePopulationAggregation.js'

// Two non-overlapping square provinces: A spans lng/lat 0-10, B spans 20-30.
const provinces = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { shapeName: 'Province A' },
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] },
    },
    {
      type: 'Feature',
      properties: { shapeName: 'Province B' },
      geometry: { type: 'Polygon', coordinates: [[[20, 0], [20, 10], [30, 10], [30, 0], [20, 0]]] },
    },
  ],
}

function hexFeature(ring, value) {
  return { type: 'Feature', properties: { __metricValue: value }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

describe('aggregatePopulationByProvince', () => {
  it('sums a point clearly inside one province into that province only', () => {
    const populationFeatures = {
      type: 'FeatureCollection',
      features: [hexFeature([[4, 4], [4, 6], [6, 6], [6, 4]], 100)], // centroid (5,5) -> Province A
    }
    const result = aggregatePopulationByProvince(populationFeatures, provinces, 'shapeName')
    const a = result.features.find((f) => f.properties.provinceName === 'Province A')
    const b = result.features.find((f) => f.properties.provinceName === 'Province B')
    expect(a.properties.totalPopulation).toBe(100)
    expect(b.properties.totalPopulation).toBe(0)
  })

  it('excludes a point outside every province without erroring', () => {
    const populationFeatures = {
      type: 'FeatureCollection',
      features: [hexFeature([[14, 4], [14, 6], [16, 6], [16, 4]], 999)], // centroid (15,5) -> no province
    }
    expect(() => aggregatePopulationByProvince(populationFeatures, provinces, 'shapeName')).not.toThrow()
    const result = aggregatePopulationByProvince(populationFeatures, provinces, 'shapeName')
    const total = result.features.reduce((sum, f) => sum + f.properties.totalPopulation, 0)
    expect(total).toBe(0)
  })

  it('sums multiple points falling in the same province', () => {
    const populationFeatures = {
      type: 'FeatureCollection',
      features: [
        hexFeature([[4, 4], [4, 6], [6, 6], [6, 4]], 100), // (5,5) -> A
        hexFeature([[1, 1], [1, 3], [3, 3], [3, 1]], 50), // (2,2) -> A
      ],
    }
    const result = aggregatePopulationByProvince(populationFeatures, provinces, 'shapeName')
    const a = result.features.find((f) => f.properties.provinceName === 'Province A')
    expect(a.properties.totalPopulation).toBe(150)
  })

  it('returns zero totals for every province given an empty population-features input', () => {
    const result = aggregatePopulationByProvince({ type: 'FeatureCollection', features: [] }, provinces, 'shapeName')
    expect(result.features).toHaveLength(2)
    for (const f of result.features) expect(f.properties.totalPopulation).toBe(0)
  })

  it('builds an always-on map label combining the province name and abbreviated population', () => {
    const populationFeatures = {
      type: 'FeatureCollection',
      features: [hexFeature([[4, 4], [4, 6], [6, 6], [6, 4]], 482_000)], // (5,5) -> A
    }
    const result = aggregatePopulationByProvince(populationFeatures, provinces, 'shapeName')
    const a = result.features.find((f) => f.properties.provinceName === 'Province A')
    expect(a.properties.__provinceLabel).toBe('Province A\n482K')
  })
})
