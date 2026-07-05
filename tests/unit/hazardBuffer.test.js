import { describe, it, expect } from 'vitest'
import { defaultBufferRadiusKm, SEVERITY_RADIUS_KM } from '@/lib/hazardBuffer.js'

describe('defaultBufferRadiusKm', () => {
  it('uses the magnitude formula for earthquakes', () => {
    expect(defaultBufferRadiusKm({ type: 'earthquake', magnitude: 5 })).toBe(32)
    expect(defaultBufferRadiusKm({ type: 'earthquake', magnitude: 6.2 })).toBeCloseTo(2 ** 6.2)
    expect(defaultBufferRadiusKm({ type: 'earthquake', magnitude: 0 })).toBe(1)
  })

  it.each(Object.entries(SEVERITY_RADIUS_KM))('uses the severity table (%s -> %skm) for non-earthquake types', (severity, km) => {
    expect(defaultBufferRadiusKm({ type: 'wildfire', severity })).toBe(km)
    expect(defaultBufferRadiusKm({ type: 'flood', severity })).toBe(km)
  })

  it('falls back to the severity table for an unknown hazard type', () => {
    expect(defaultBufferRadiusKm({ type: 'unknown_future_hazard', severity: 'high' })).toBe(25)
  })

  it('falls back to moderate when severity itself is missing/unrecognized', () => {
    expect(defaultBufferRadiusKm({ type: 'flood', severity: 'nonsense' })).toBe(10)
    expect(defaultBufferRadiusKm({ type: 'flood' })).toBe(10)
  })
})
