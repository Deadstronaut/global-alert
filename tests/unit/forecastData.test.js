import { describe, it, expect } from 'vitest'
import {
  forecastStepToDayNumber,
  freshnessAgeHours,
  isForecastStale,
  toDailySeries,
} from '@/utils/forecastData.js'

const NOW = new Date('2026-08-06T12:00:00Z')

describe('forecastStepToDayNumber', () => {
  it('converts forecast_step_hours to a day index', () => {
    expect(forecastStepToDayNumber(24)).toBe(1)
    expect(forecastStepToDayNumber(72)).toBe(3)
    expect(forecastStepToDayNumber(360)).toBe(15)
  })
})

describe('freshnessAgeHours', () => {
  it('computes age in hours between issuedAt and now', () => {
    expect(freshnessAgeHours('2026-08-06T06:00:00Z', NOW)).toBe(6)
  })

  it('accepts Date instances for both arguments', () => {
    expect(freshnessAgeHours(new Date('2026-08-06T09:00:00Z'), NOW)).toBe(3)
  })
})

describe('isForecastStale', () => {
  it('is stale for empty input — never treats missing data as fresh', () => {
    expect(isForecastStale([], NOW)).toBe(true)
    expect(isForecastStale(null, NOW)).toBe(true)
  })

  it('is not stale when the latest row is within the GFS 2-cycle window (13h)', () => {
    const rows = [{ issued_at: '2026-08-06T06:00:00Z' }] // 6h old
    expect(isForecastStale(rows, NOW)).toBe(false)
  })

  it('is stale when the latest row is older than the 13h window', () => {
    const rows = [{ issued_at: '2026-08-05T22:00:00Z' }] // 14h old
    expect(isForecastStale(rows, NOW)).toBe(true)
  })

  it('uses the freshest row when multiple cycles are present', () => {
    const rows = [
      { issued_at: '2026-08-05T00:00:00Z' }, // very old
      { issued_at: '2026-08-06T06:00:00Z' }, // 6h old — this one should win
    ]
    expect(isForecastStale(rows, NOW)).toBe(false)
  })
})

describe('toDailySeries', () => {
  it('returns an empty array for no rows', () => {
    expect(toDailySeries([])).toEqual([])
  })

  it('keeps only the latest cycle\'s rows, sorted ascending by forecast step', () => {
    const rows = [
      // stale cycle, should be dropped entirely
      { issued_at: '2026-08-05T06:00:00Z', forecast_step_hours: 24, valid_at: '2026-08-06T06:00:00Z', value_min: 1, value_max: 2, texture_storage_path: 'old/a.png' },
      // latest cycle, out of order on purpose to verify sorting
      { issued_at: '2026-08-06T06:00:00Z', forecast_step_hours: 72, valid_at: '2026-08-09T06:00:00Z', value_min: 3, value_max: 5, texture_storage_path: 'new/b.png' },
      { issued_at: '2026-08-06T06:00:00Z', forecast_step_hours: 24, valid_at: '2026-08-07T06:00:00Z', value_min: 2, value_max: 4, texture_storage_path: 'new/a.png' },
    ]
    expect(toDailySeries(rows)).toEqual([
      { day: 1, forecastStepHours: 24, validAt: '2026-08-07T06:00:00Z', valueMin: 2, valueMax: 4, textureStoragePath: 'new/a.png' },
      { day: 3, forecastStepHours: 72, validAt: '2026-08-09T06:00:00Z', valueMin: 3, valueMax: 5, textureStoragePath: 'new/b.png' },
    ])
  })
})
