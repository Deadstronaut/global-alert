import { describe, it, expect } from 'vitest'
import { getShelterMarkerColor } from '@/services/shelterMarkerStyle.js'

describe('getShelterMarkerColor', () => {
  it('returns green for open', () => {
    expect(getShelterMarkerColor('open')).toBe('#22c55e')
  })

  it('returns orange for full', () => {
    expect(getShelterMarkerColor('full')).toBe('#f97316')
  })

  it('returns gray for closed', () => {
    expect(getShelterMarkerColor('closed')).toBe('#94a3b8')
  })

  it('falls back to gray for an unknown status', () => {
    expect(getShelterMarkerColor('unknown')).toBe('#94a3b8')
  })

  it('falls back to gray for undefined status', () => {
    expect(getShelterMarkerColor(undefined)).toBe('#94a3b8')
  })
})
