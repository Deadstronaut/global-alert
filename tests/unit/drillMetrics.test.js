import { describe, it, expect } from 'vitest'
import { computeResponseTimeSeconds, computeAckRate } from '@/utils/drillMetrics.js'

describe('computeResponseTimeSeconds', () => {
  it('returns null when no alert was ever issued', () => {
    expect(computeResponseTimeSeconds('2026-07-06T10:00:00Z', null)).toBe(null)
  })

  it('returns the elapsed seconds between start and first alert', () => {
    expect(computeResponseTimeSeconds('2026-07-06T10:00:00Z', '2026-07-06T10:05:00Z')).toBe(300)
  })
})

describe('computeAckRate', () => {
  it('returns null when nothing was sent', () => {
    expect(computeAckRate(0, 0)).toBe(null)
  })

  it('returns sent/acknowledged counts unchanged', () => {
    expect(computeAckRate(5, 3)).toEqual({ sent: 5, acknowledged: 3 })
  })

  it('treats zero acknowledgments with a nonzero sent count as a valid, displayable rate', () => {
    expect(computeAckRate(5, 0)).toEqual({ sent: 5, acknowledged: 0 })
  })
})
