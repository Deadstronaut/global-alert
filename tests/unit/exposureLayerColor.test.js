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

  it('returns a MapLibre step expression when values vary', () => {
    const geojson = { features: [{ properties: { __metricValue: 0 } }, { properties: { __metricValue: 100 } }] }
    const expr = populationFillExpression(geojson)
    expect(Array.isArray(expr)).toBe(true)
    expect(expr[0]).toBe('step')
  })

  it('ignores features with a missing/non-numeric metric value', () => {
    const geojson = { features: [{ properties: {} }, { properties: { __metricValue: 'n/a' } }] }
    expect(populationFillExpression(geojson)).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it('buckets by quantile (equal hex counts per color), not equal value range', () => {
    // Right-skewed distribution: 18 low-value hexes, 2 extreme outliers —
    // a linear min→max scale would put nearly everything in the first
    // bucket. Quantile buckets should spread the 18 low values across
    // multiple colors instead.
    const lowValues = Array.from({ length: 18 }, (_, i) => ({ properties: { __metricValue: i + 1 } }))
    const outliers = [{ properties: { __metricValue: 5000 } }, { properties: { __metricValue: 10000 } }]
    const geojson = { features: [...lowValues, ...outliers] }
    const expr = populationFillExpression(geojson)

    expect(expr[0]).toBe('step')
    // step breakpoints (the numeric stop values) live at odd indices after
    // the input expression and base color: ['step', input, color0, bp1, color1, bp2, color2, ...]
    const breakpoints = expr.slice(3).filter((_, i) => i % 2 === 0)
    // With a linear min→max (0..10000) scale every one of these breakpoints
    // would sit above ~2000; quantile breakpoints should stay within the
    // low-value cluster instead.
    expect(breakpoints.some((bp) => bp < 100)).toBe(true)
  })

  it('produces strictly ascending step breakpoints even with many duplicate values', () => {
    const geojson = {
      features: [
        ...Array.from({ length: 10 }, () => ({ properties: { __metricValue: 1 } })),
        { properties: { __metricValue: 500 } },
      ],
    }
    const expr = populationFillExpression(geojson)
    if (Array.isArray(expr) && expr[0] === 'step') {
      const breakpoints = expr.slice(3).filter((_, i) => i % 2 === 0)
      for (let i = 1; i < breakpoints.length; i++) {
        expect(breakpoints[i]).toBeGreaterThan(breakpoints[i - 1])
      }
    }
  })
})
