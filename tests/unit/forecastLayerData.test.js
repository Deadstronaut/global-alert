import { describe, it, expect, vi } from 'vitest'

const mockResult = { data: [], error: null }

vi.mock('@/services/api/config.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve(mockResult),
          }),
        }),
      }),
    }),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/x.png' } }) }) },
  },
}))

const { fetchForecastDayList } = await import('@/utils/forecastLayerData.js')

describe('fetchForecastDayList', () => {
  it('returns [] on a query error', async () => {
    mockResult.data = null
    mockResult.error = { message: 'boom' }
    expect(await fetchForecastDayList('temperature')).toEqual([])
  })

  it('returns [] when no rows exist', async () => {
    mockResult.data = []
    mockResult.error = null
    expect(await fetchForecastDayList('uv_index')).toEqual([])
  })

  it('keeps only the latest issued_at cycle, sorted ascending by forecast_step_hours', async () => {
    mockResult.error = null
    mockResult.data = [
      // stale cycle — must be dropped entirely
      { forecast_step_hours: 24, valid_at: '2026-08-06T00:00:00Z', issued_at: '2026-08-05T06:00:00Z' },
      // latest cycle, deliberately out of order
      { forecast_step_hours: 72, valid_at: '2026-08-09T06:00:00Z', issued_at: '2026-08-06T06:00:00Z' },
      { forecast_step_hours: 24, valid_at: '2026-08-07T06:00:00Z', issued_at: '2026-08-06T06:00:00Z' },
    ]
    expect(await fetchForecastDayList('temperature')).toEqual([
      { forecastStepHours: 24, validAt: '2026-08-07T06:00:00Z' },
      { forecastStepHours: 72, validAt: '2026-08-09T06:00:00Z' },
    ])
  })

  it('reflects a genuinely short list (e.g. uv_index) without padding it out', async () => {
    mockResult.error = null
    mockResult.data = [
      { forecast_step_hours: 24, valid_at: '2026-08-07T06:00:00Z', issued_at: '2026-08-06T06:00:00Z' },
      { forecast_step_hours: 72, valid_at: '2026-08-09T06:00:00Z', issued_at: '2026-08-06T06:00:00Z' },
      { forecast_step_hours: 120, valid_at: '2026-08-11T06:00:00Z', issued_at: '2026-08-06T06:00:00Z' },
    ]
    const result = await fetchForecastDayList('uv_index')
    expect(result).toHaveLength(3)
  })
})
