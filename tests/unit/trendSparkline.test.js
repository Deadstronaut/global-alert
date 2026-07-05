import { describe, it, expect } from 'vitest'
import { classifyTrend } from '@/lib/trendSparkline.js'

describe('classifyTrend', () => {
  it('classifies a clearly increasing sequence as up', () => {
    expect(classifyTrend([2, 3, 5, 10]).direction).toBe('up')
  })

  it('classifies a clearly decreasing sequence as down', () => {
    expect(classifyTrend([10, 6, 3, 1]).direction).toBe('down')
  })

  it('classifies a flat sequence as stable', () => {
    expect(classifyTrend([5, 5, 5, 5]).direction).toBe('stable')
  })

  it('classifies a small fluctuation within threshold as stable', () => {
    expect(classifyTrend([10, 11, 10, 10]).direction).toBe('stable')
  })

  it('handles an empty array without error', () => {
    expect(classifyTrend([])).toEqual({ direction: 'stable', points: [] })
  })

  it('handles a single-point array without error', () => {
    expect(classifyTrend([5])).toEqual({ direction: 'stable', points: [5] })
  })

  it('preserves the original points in the result', () => {
    expect(classifyTrend([1, 2, 3]).points).toEqual([1, 2, 3])
  })
})
