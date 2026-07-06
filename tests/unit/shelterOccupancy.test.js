import { describe, it, expect } from 'vitest'
import { occupancyPercentage } from '@/stores/shelters.js'

describe('occupancyPercentage', () => {
  it('returns the correct percentage for a normal case', () => {
    expect(occupancyPercentage({ capacity_total: 100, capacity_occupied: 40 })).toBe(40)
  })

  it('returns 100 for full occupancy', () => {
    expect(occupancyPercentage({ capacity_total: 100, capacity_occupied: 100 })).toBe(100)
  })

  it('returns 0 for zero occupancy', () => {
    expect(occupancyPercentage({ capacity_total: 100, capacity_occupied: 0 })).toBe(0)
  })

  it('rounds to the nearest whole percentage', () => {
    expect(occupancyPercentage({ capacity_total: 3, capacity_occupied: 1 })).toBe(33)
    expect(occupancyPercentage({ capacity_total: 3, capacity_occupied: 2 })).toBe(67)
  })

  it('falls back to 0 for a falsy/zero capacity_total without throwing (FR-011 defensive guard)', () => {
    expect(occupancyPercentage({ capacity_total: 0, capacity_occupied: 0 })).toBe(0)
    expect(occupancyPercentage({ capacity_total: undefined, capacity_occupied: 5 })).toBe(0)
    expect(occupancyPercentage({})).toBe(0)
  })
})
