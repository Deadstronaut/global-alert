import { describe, it, expect } from 'vitest'
import { formatPopulationLabel } from '@/utils/formatPopulationLabel.js'

describe('formatPopulationLabel', () => {
  it('returns a plain rounded number below 1000', () => {
    expect(formatPopulationLabel(482)).toBe('482')
    expect(formatPopulationLabel(999)).toBe('999')
    expect(formatPopulationLabel(0)).toBe('0')
  })

  it('abbreviates thousands with a K suffix', () => {
    expect(formatPopulationLabel(1000)).toBe('1K')
    expect(formatPopulationLabel(1500)).toBe('1.5K')
    expect(formatPopulationLabel(482_000)).toBe('482K')
  })

  it('abbreviates millions with an M suffix', () => {
    expect(formatPopulationLabel(1_000_000)).toBe('1M')
    expect(formatPopulationLabel(2_340_000)).toBe('2.3M')
  })

  it('preserves a negative sign', () => {
    expect(formatPopulationLabel(-482_000)).toBe('-482K')
  })

  it('returns an empty string for null/undefined/NaN', () => {
    expect(formatPopulationLabel(null)).toBe('')
    expect(formatPopulationLabel(undefined)).toBe('')
    expect(formatPopulationLabel(NaN)).toBe('')
  })
})
