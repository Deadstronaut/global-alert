/**
 * Pure data-shaping helpers for the Forecast dashboard panel (spec 055
 * US1) — kept separate from ForecastPanel.vue so they're testable without
 * mounting a component (matches this repo's convention of extracting
 * pure logic into src/utils/, e.g. windLayerData.js).
 */
import { supabase } from '@/services/api/config.js'

// GFS publishes a new cycle every 6h (wind-importer/fetch_gfs.py's
// CYCLE_HOURS) — a snapshot older than ~2 cycles means ingestion has
// stalled, not just "the next cycle hasn't landed yet" (spec.md's Edge
// Cases: surface staleness rather than silently showing it as current).
const STALE_AFTER_HOURS = 13

/**
 * `forecast_step_hours` (24, 72, 120, ...) -> "Day N" index for display,
 * per data-model.md's ForecastSnapshot.forecast_step_hours being an hour
 * count, not a day count.
 */
export function forecastStepToDayNumber(forecastStepHours) {
  return Math.round(forecastStepHours / 24)
}

/**
 * How many hours old `issuedAt` is relative to `now` (both accept Date or
 * ISO string) — the basis for both the "as of" label (FR-007) and the
 * stale/unavailable check below.
 */
export function freshnessAgeHours(issuedAt, now = new Date()) {
  const issued = issuedAt instanceof Date ? issuedAt : new Date(issuedAt)
  const current = now instanceof Date ? now : new Date(now)
  return (current.getTime() - issued.getTime()) / 3_600_000
}

/**
 * FR-010's "forecast unavailable" state — true when there is no data at
 * all, or the freshest row is older than a plausible missed-cycle window.
 * Never returns false for empty input (an empty array must never render
 * as if it were fresh, zeroed data — Constitution Principle IV).
 */
export function isForecastStale(rows, now = new Date()) {
  if (!rows || rows.length === 0) return true
  const latestIssuedAt = rows.reduce(
    (latest, row) => (new Date(row.issued_at) > new Date(latest) ? row.issued_at : latest),
    rows[0].issued_at,
  )
  return freshnessAgeHours(latestIssuedAt, now) > STALE_AFTER_HOURS
}

/**
 * Groups forecast_snapshots rows (already filtered to one variable) into
 * ascending-day-order points for the 15-day chart, keeping only the
 * latest issued_at cycle's rows (contracts/forecast-read-contract.md).
 */
export function toDailySeries(rows) {
  if (!rows || rows.length === 0) return []
  const latestIssuedAt = rows.reduce(
    (latest, row) => (new Date(row.issued_at) > new Date(latest) ? row.issued_at : latest),
    rows[0].issued_at,
  )
  return rows
    .filter((row) => row.issued_at === latestIssuedAt)
    .map((row) => ({
      day: forecastStepToDayNumber(row.forecast_step_hours),
      forecastStepHours: row.forecast_step_hours,
      validAt: row.valid_at,
      valueMin: row.value_min,
      valueMax: row.value_max,
      textureStoragePath: row.texture_storage_path,
    }))
    .sort((a, b) => a.forecastStepHours - b.forecastStepHours)
}

/** Fetches forecast_snapshots for one variable — contracts/forecast-read-contract.md §15-day. */
export async function fetchForecastSnapshots(variable) {
  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('variable, forecast_step_hours, valid_at, issued_at, texture_storage_path, value_min, value_max, bounds, source_name')
    .eq('variable', variable)
    .order('forecast_step_hours', { ascending: true })
  if (error) throw error
  return data ?? []
}

/** Fetches the latest forecast_outlooks row per variable for one horizon+region — contracts/forecast-read-contract.md §1mo/3mo. */
export async function fetchForecastOutlook(horizon, regionCode, variable) {
  const { data, error } = await supabase
    .from('forecast_outlooks')
    .select('variable, classification, confidence, valid_period_start, valid_period_end, issued_at, source_name')
    .eq('horizon', horizon)
    .eq('region_code', regionCode)
    .eq('variable', variable)
    .order('issued_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data?.[0] ?? null
}
