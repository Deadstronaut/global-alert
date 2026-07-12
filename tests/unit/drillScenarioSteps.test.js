import { describe, it, expect } from 'vitest'
import { nextStepOrder } from '@/stores/drillScenarioSteps.js'

describe('nextStepOrder', () => {
  it('returns 0 for an empty/undefined step list', () => {
    expect(nextStepOrder([])).toBe(0)
    expect(nextStepOrder(undefined)).toBe(0)
    expect(nextStepOrder(null)).toBe(0)
  })

  it('returns one past the highest existing step_order', () => {
    expect(nextStepOrder([{ step_order: 0 }])).toBe(1)
    expect(nextStepOrder([{ step_order: 0 }, { step_order: 1 }, { step_order: 2 }])).toBe(3)
  })

  it('is robust to out-of-order input', () => {
    expect(nextStepOrder([{ step_order: 3 }, { step_order: 0 }, { step_order: 1 }])).toBe(4)
  })
})
