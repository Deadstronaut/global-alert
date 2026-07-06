import { describe, it, expect } from 'vitest'
import { resolveThresholds } from '@/stores/hazardTypes.js'

const GLOBAL_EARTHQUAKE = [
  { min_value: 0, severity: 'minimal' },
  { min_value: 2.5, severity: 'low' },
  { min_value: 4.0, severity: 'moderate' },
  { min_value: 5.5, severity: 'high' },
  { min_value: 7.0, severity: 'critical' },
]

const OVERRIDE_XX_EARTHQUAKE = {
  metric_name: 'magnitude',
  unit: 'Mw',
  breakpoints: [
    { min_value: 0, severity: 'low' },
    { min_value: 3.0, severity: 'moderate' },
    { min_value: 5.0, severity: 'high' },
  ],
}

const OVERRIDES = {
  XX: { earthquake: OVERRIDE_XX_EARTHQUAKE },
}

describe('resolveThresholds', () => {
  it('returns globalThresholds unchanged when no countryCode is provided (legacy two-arg behavior)', () => {
    expect(resolveThresholds('earthquake', undefined, GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(GLOBAL_EARTHQUAKE)
    expect(resolveThresholds('earthquake', null, GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(GLOBAL_EARTHQUAKE)
  })

  it('falls back to globalThresholds when countryCode is provided but no override exists (FR-002)', () => {
    expect(resolveThresholds('earthquake', 'YY', GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(GLOBAL_EARTHQUAKE)
  })

  it('returns the override breakpoints when one exists for the exact hazard-type/country pair (FR-003)', () => {
    expect(resolveThresholds('earthquake', 'XX', GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(OVERRIDE_XX_EARTHQUAKE.breakpoints)
  })

  it('ignores an override for a different hazard type in the same country (FR-004)', () => {
    expect(resolveThresholds('flood', 'XX', GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(GLOBAL_EARTHQUAKE)
  })

  it('ignores an override for the same hazard type in a different country (FR-005)', () => {
    expect(resolveThresholds('earthquake', 'ZZ', GLOBAL_EARTHQUAKE, OVERRIDES)).toBe(GLOBAL_EARTHQUAKE)
  })

  it('handles an empty/undefined overrides map without throwing', () => {
    expect(resolveThresholds('earthquake', 'XX', GLOBAL_EARTHQUAKE, {})).toBe(GLOBAL_EARTHQUAKE)
    expect(resolveThresholds('earthquake', 'XX', GLOBAL_EARTHQUAKE, undefined)).toBe(GLOBAL_EARTHQUAKE)
  })
})
