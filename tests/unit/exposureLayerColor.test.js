import { describe, it, expect } from 'vitest'
import { colorForDataset, isPopulationSource, populationFillExpression } from '@/utils/exposureLayerColor.js'

describe('colorForDataset', () => {
  it('returns the same color for the same dataset id every time', () => {
    const dataset = { id: 'a1b2c3d4-uuid' }
    expect(colorForDataset(dataset)).toBe(colorForDataset(dataset))
  })

  it('spreads different unknown-source dataset ids across the palette, not all onto one color', () => {
    const colors = new Set(
      Array.from({ length: 20 }, (_, i) => colorForDataset({ id: `dataset-${i}`, source_name: 'future-source' })),
    )
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles null/undefined/empty input without throwing', () => {
    expect(() => colorForDataset(null)).not.toThrow()
    expect(() => colorForDataset(undefined)).not.toThrow()
    expect(() => colorForDataset({})).not.toThrow()
  })

  it('returns a valid hex color string', () => {
    expect(colorForDataset({ id: 'some-id' })).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('gives rivers, basins, and roads their fixed real-world-convention colors', () => {
    expect(colorForDataset({ id: 'x', source_name: 'hydrorivers' })).toBe('#08306b')
    expect(colorForDataset({ id: 'x', source_name: 'hydrobasins' })).toBe('#a8d8f0')
    expect(colorForDataset({ id: 'x', source_name: 'osm' })).toBe('#6c757d')
  })

  it('gives population sources a representative swatch color, independent of dataset id', () => {
    expect(colorForDataset({ id: 'a', source_name: 'kontur' })).toBe(colorForDataset({ id: 'b', source_name: 'kontur' }))
    expect(colorForDataset({ id: 'a', source_name: 'worldpop' })).toBe(colorForDataset({ id: 'a', source_name: 'kontur' }))
  })
})

describe('isPopulationSource', () => {
  it('recognizes kontur and worldpop as population sources', () => {
    expect(isPopulationSource('kontur')).toBe(true)
    expect(isPopulationSource('worldpop')).toBe(true)
  })

  it('does not treat other sources as population sources', () => {
    expect(isPopulationSource('osm')).toBe(false)
    expect(isPopulationSource('hydrorivers')).toBe(false)
    expect(isPopulationSource(undefined)).toBe(false)
  })
})

describe('populationFillExpression', () => {
  it('returns a flat color when there are no features', () => {
    expect(populationFillExpression({ features: [] })).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('returns a flat color when every feature has the same metric value', () => {
    const geojson = { features: [{ properties: { __metricValue: 5 } }, { properties: { __metricValue: 5 } }] }
    expect(populationFillExpression(geojson)).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('returns a MapLibre interpolate expression when values vary', () => {
    const geojson = { features: [{ properties: { __metricValue: 0 } }, { properties: { __metricValue: 100 } }] }
    const expr = populationFillExpression(geojson)
    expect(Array.isArray(expr)).toBe(true)
    expect(expr[0]).toBe('interpolate')
  })

  it('ignores features with a missing/non-numeric metric value', () => {
    const geojson = { features: [{ properties: {} }, { properties: { __metricValue: 'n/a' } }] }
    expect(populationFillExpression(geojson)).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})
