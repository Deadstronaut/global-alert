import { describe, it, expect } from 'vitest'
import { getChildren, wouldCreateCycle } from '@/stores/hazardTypes.js'

const types = [
  { code: 'flood', parent_code: null },
  { code: 'flash_flood', parent_code: 'flood' },
  { code: 'coastal_flood', parent_code: 'flood' },
  { code: 'wildfire', parent_code: null },
]

describe('getChildren', () => {
  it('returns an empty array when a hazard type has no children', () => {
    expect(getChildren(types, 'wildfire')).toEqual([])
  })

  it('returns a single child', () => {
    const single = [...types, { code: 'wildland_urban_fire', parent_code: 'wildfire' }]
    expect(getChildren(single, 'wildfire').map((h) => h.code)).toEqual(['wildland_urban_fire'])
  })

  it('returns multiple children', () => {
    expect(getChildren(types, 'flood').map((h) => h.code)).toEqual(['flash_flood', 'coastal_flood'])
  })

  it('handles an empty/undefined list', () => {
    expect(getChildren([], 'flood')).toEqual([])
    expect(getChildren(undefined, 'flood')).toEqual([])
  })
})

describe('wouldCreateCycle', () => {
  it('returns false when no candidate parent is given', () => {
    expect(wouldCreateCycle(types, 'flood', null)).toBe(false)
    expect(wouldCreateCycle(types, 'flood', '')).toBe(false)
  })

  it('returns true for self-reference', () => {
    expect(wouldCreateCycle(types, 'flood', 'flood')).toBe(true)
  })

  it('returns true for a direct cycle (A parent of B, B parent of A)', () => {
    // flash_flood's parent is already flood — assigning flood's parent to flash_flood is a cycle
    expect(wouldCreateCycle(types, 'flood', 'flash_flood')).toBe(true)
  })

  it('returns true for a transitive cycle (A -> B -> C -> A)', () => {
    const chain = [
      { code: 'a', parent_code: null },
      { code: 'b', parent_code: 'a' },
      { code: 'c', parent_code: 'b' },
    ]
    // assigning a's parent to c would create a -> c -> b -> a
    expect(wouldCreateCycle(chain, 'a', 'c')).toBe(true)
  })

  it('returns false for a valid, non-cyclic assignment', () => {
    expect(wouldCreateCycle(types, 'wildfire', 'flood')).toBe(false)
  })
})
