import { describe, it, expect } from 'vitest'
import { classifyTrend, buildSmoothSparklinePath } from '@/lib/trendSparkline.js'

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

describe('buildSmoothSparklinePath', () => {
  it('returns null for fewer than 2 points', () => {
    expect(buildSmoothSparklinePath([])).toBeNull()
    expect(buildSmoothSparklinePath([5])).toBeNull()
  })

  it('marks hasVariance false for a perfectly flat series', () => {
    const result = buildSmoothSparklinePath([3, 3, 3, 3])
    expect(result.hasVariance).toBe(false)
  })

  it('marks hasVariance true when values differ', () => {
    const result = buildSmoothSparklinePath([1, 4, 2, 6])
    expect(result.hasVariance).toBe(true)
  })

  it('produces an SVG path starting with M and containing cubic-bezier C segments', () => {
    const result = buildSmoothSparklinePath([1, 4, 2, 6, 3])
    expect(result.linePath.startsWith('M ')).toBe(true)
    expect(result.linePath).toContain(' C ')
  })

  it('the area path closes down to the bottom of the given height', () => {
    const result = buildSmoothSparklinePath([1, 4, 2], { width: 100, height: 30 })
    expect(result.areaPath.endsWith('Z')).toBe(true)
    expect(result.areaPath).toContain(',30 ')
  })

  it('the last point matches the last input value', () => {
    const result = buildSmoothSparklinePath([1, 4, 2, 9])
    expect(result.lastPoint.value).toBe(9)
  })

  it('respects custom width/height/padding', () => {
    const result = buildSmoothSparklinePath([0, 5], { width: 200, height: 60, padding: 5 })
    expect(result.lastPoint.x).toBeCloseTo(200)
  })
})
