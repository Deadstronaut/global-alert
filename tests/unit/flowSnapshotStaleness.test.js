import { describe, it, expect } from 'vitest'
import { isFlowSnapshotStale } from '@/utils/flowSnapshotStaleness.js'

const NOW = new Date('2026-08-05T12:00:00Z')

describe('isFlowSnapshotStale', () => {
  it('is not stale for data issued within the cadence window', () => {
    expect(isFlowSnapshotStale('2026-08-05T09:00:00Z', NOW)).toBe(false) // 3h old, cadence 6h
  })

  it('is not stale exactly at the 2x-cadence threshold', () => {
    expect(isFlowSnapshotStale('2026-08-05T00:00:00Z', NOW)).toBe(false) // exactly 12h old
  })

  it('is stale just past the 2x-cadence threshold', () => {
    expect(isFlowSnapshotStale('2026-08-04T23:59:00Z', NOW)).toBe(true) // 12h01m old
  })

  it('is clearly stale for data issued days ago', () => {
    expect(isFlowSnapshotStale('2026-08-01T12:00:00Z', NOW)).toBe(true)
  })

  it('is stale when issuedAt is missing', () => {
    expect(isFlowSnapshotStale(null, NOW)).toBe(true)
    expect(isFlowSnapshotStale(undefined, NOW)).toBe(true)
  })

  it('is stale when issuedAt is unparseable', () => {
    expect(isFlowSnapshotStale('not-a-date', NOW)).toBe(true)
  })

  it('respects a custom cadence', () => {
    // 3h old, but cadence is 1h -> stale threshold is 2h
    expect(isFlowSnapshotStale('2026-08-05T09:00:00Z', NOW, 1)).toBe(true)
  })
})
