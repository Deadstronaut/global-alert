# Forecast Read Contract (frontend ↔ Supabase)

No new Edge Function / REST endpoint — the Forecast panel reads directly from Supabase via the
existing `@supabase/supabase-js` client, same pattern as `EarthquakeHourlyChart.vue` and other
dashboard charts querying tables directly under RLS.

This is the contract layer FR-011 refers to as reusable by a future main-screen surface: two
plain query shapes, no bespoke API.

## 15-day horizon (short-range, deterministic)

```js
const { data } = await supabase
  .from('forecast_snapshots')
  .select('variable, forecast_step_hours, valid_at, issued_at, texture_storage_path, value_min, value_max, bounds, source_name')
  .eq('variable', variable) // 'wind_speed' | 'precipitation' | 'temperature'
  .gte('issued_at', latestCycleFloor) // filters to the most recent GFS cycle's rows only
  .order('forecast_step_hours', { ascending: true })
```

Empty result (or `issued_at` older than ~2 GFS cycles, i.e. >12h stale) → panel renders the
"forecast unavailable" state (FR-010), not a blank chart.

## 1-month / 3-month horizon (medium/long-range, probabilistic)

```js
const { data } = await supabase
  .from('forecast_outlooks')
  .select('variable, classification, confidence, valid_period_start, valid_period_end, issued_at, source_name')
  .eq('horizon', horizon) // '1mo' | '3mo'
  .eq('region_code', regionCode)
  .order('issued_at', { ascending: false })
  .limit(1) // one row per variable — caller loops variables (precipitation, temperature)
```

Empty result, or no row for the selected `region_code` at all → panel renders "region not
supported for this horizon" (edge case in spec.md), distinct from the "stale/unavailable" state
above.

## Freshness contract (FR-007, applies to both queries above)

The panel always renders `issued_at` next to the data (e.g. "GFS cycle: 2026-08-06 06:00 UTC" /
"CFSv2 outlook issued: 2026-08-01"), computed client-side as `now - issued_at`, never omitted.
