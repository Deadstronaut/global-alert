import { describe, it, expect } from 'vitest'
import { boundsToImageCoordinates } from '@/utils/windLayerData.js'

describe('boundsToImageCoordinates', () => {
  it('converts [west, south, east, north] into top-left/top-right/bottom-right/bottom-left order', () => {
    const bounds = [-180, -85, 180, 85]
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [-180, 85],
      [180, 85],
      [180, -85],
      [-180, -85],
    ])
  })

  it('handles a small regional bbox the same way', () => {
    const bounds = [25.5, 35.7, 44.9, 43.1]
    expect(boundsToImageCoordinates(bounds)).toEqual([
      [25.5, 43.1],
      [44.9, 43.1],
      [44.9, 35.7],
      [25.5, 35.7],
    ])
  })
})
