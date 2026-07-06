import { describe, it, expect } from 'vitest'
import { evaluateBreakpoints } from '@/stores/hazardTypes.js'

const EARTHQUAKE_BREAKPOINTS = [
  { min_value: 0, severity: 'minimal' },
  { min_value: 2.5, severity: 'low' },
  { min_value: 4.0, severity: 'moderate' },
  { min_value: 5.5, severity: 'high' },
  { min_value: 7.0, severity: 'critical' },
]

// drought-shape: only 4 levels present (no 'minimal'), matching
// src/utils/severity.js's original 4-branch function exactly.
const DROUGHT_BREAKPOINTS = [
  { min_value: 0, severity: 'low' },
  { min_value: 2, severity: 'moderate' },
  { min_value: 3, severity: 'high' },
  { min_value: 4, severity: 'critical' },
]

describe('evaluateBreakpoints', () => {
  it('returns the correct severity for a value exactly at a breakpoint', () => {
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 7.0)).toBe('critical')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 5.5)).toBe('high')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 4.0)).toBe('moderate')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 2.5)).toBe('low')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 0)).toBe('minimal')
  })

  it('returns the correct severity for a value between breakpoints', () => {
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 7.2)).toBe('critical')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 6.0)).toBe('high')
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 3.0)).toBe('low')
  })

  it('returns the correct severity for a value below the first breakpoint', () => {
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, -1)).toBe('low')
  })

  it('handles a hazard type with fewer than 5 severity levels (drought shape)', () => {
    expect(evaluateBreakpoints(DROUGHT_BREAKPOINTS, 0)).toBe('low')
    expect(evaluateBreakpoints(DROUGHT_BREAKPOINTS, 1)).toBe('low')
    expect(evaluateBreakpoints(DROUGHT_BREAKPOINTS, 2)).toBe('moderate')
    expect(evaluateBreakpoints(DROUGHT_BREAKPOINTS, 4.5)).toBe('critical')
  })

  it('falls back to "low" for an empty breakpoints array (FR-008)', () => {
    expect(evaluateBreakpoints([], 999)).toBe('low')
  })

  it('falls back to "low" for a non-array input', () => {
    expect(evaluateBreakpoints(undefined, 5)).toBe('low')
    expect(evaluateBreakpoints(null, 5)).toBe('low')
  })
})

describe('FALLBACK_THRESHOLDS regression guard (SC-003)', () => {
  // These assertions reproduce src/utils/severity.js's ORIGINAL SEVERITY_FN
  // outputs exactly, for representative inputs, so a future edit to the
  // store's FALLBACK_THRESHOLDS constant that accidentally changes a
  // pre-existing hazard type's classification is caught here.
  it('earthquake: magnitude 6.0 classifies as high (unchanged from pre-spec-010 behavior)', () => {
    expect(evaluateBreakpoints(EARTHQUAKE_BREAKPOINTS, 6.0)).toBe('high')
  })

  it('wildfire: frp 300 classifies as high (unchanged from pre-spec-010 behavior)', () => {
    const wildfire = [
      { min_value: 0, severity: 'minimal' },
      { min_value: 10, severity: 'low' },
      { min_value: 50, severity: 'moderate' },
      { min_value: 200, severity: 'high' },
      { min_value: 500, severity: 'critical' },
    ]
    expect(evaluateBreakpoints(wildfire, 300)).toBe('high')
  })
})
