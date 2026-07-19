import { describe, it, expect } from 'vitest'
import { colorForDataset } from '@/utils/exposureLayerColor.js'

describe('colorForDataset', () => {
  it('returns the same color for the same dataset id every time', () => {
    const id = 'a1b2c3d4-uuid'
    expect(colorForDataset(id)).toBe(colorForDataset(id))
  })

  it('spreads different dataset ids across the palette, not all onto one color', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `dataset-${i}`)
    const colors = new Set(ids.map(colorForDataset))
    expect(colors.size).toBeGreaterThan(1)
  })

  it('handles null/undefined/empty input without throwing', () => {
    expect(() => colorForDataset(null)).not.toThrow()
    expect(() => colorForDataset(undefined)).not.toThrow()
    expect(() => colorForDataset('')).not.toThrow()
  })

  it('returns a valid hex color string', () => {
    expect(colorForDataset('some-id')).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})
