# Phase 1 Data Model: Forecast Map Display

No new database tables or columns — this feature reads spec 055's existing `forecast_snapshots`
table exactly as-is (see `specs/055-hazard-forecasting-dashboard/data-model.md`'s ForecastSnapshot
entity). The "entities" here are frontend-only state shapes.

## ForecastMapSelection (Pinia state, `src/stores/ui.js`)

| Field | Type | Notes |
|---|---|---|
| `selectedForecastVariable` | `string \| null` | One of the 14 `forecast_snapshots.variable` values, or `null` = forecast display off. Mirrors `activeOverlayKey`'s convention exactly. |
| `selectedForecastDayIndex` | `number` | Index into the currently-selected variable's fetched day list (research.md §3), default `0`. Reset to `0` whenever `selectedForecastVariable` changes (a stale index from a variable with more days could be out-of-bounds for one with fewer, e.g. switching from `temperature` (8 days) to `uv_index` (3 days)). |

Setters: `setSelectedForecastVariable(variable)` (also nulls `activeOverlayKey`, research.md §1)
and `setSelectedForecastDayIndex(index)`, following `setSelectedHeight`'s exact function shape.

## ForecastDayListEntry (in-memory, returned by `fetchForecastDayList`)

| Field | Type | Notes |
|---|---|---|
| `forecastStepHours` | `number` | e.g. `24`, `72`, ... — the raw value used to query the actual snapshot row. |
| `validAt` | `string` (ISO datetime) | Used to render the human-readable day label (FR-010), e.g. "Day 3 · Aug 9". |

Returned as an array, ascending by `forecastStepHours`, scoped to one variable's most recent
`issued_at` cycle (research.md §3) — this array's length is what the day Slider's range is built
from; it is NOT assumed to be length-8 for every variable.

## ForecastSnapshotView (in-memory, returned by `fetchForecastSnapshot`)

Same shape `fetchLatestOverlaySnapshot` already returns, for drop-in reuse in
`MapView.vue`'s existing raster-layer-adding code:

| Field | Type | Notes |
|---|---|---|
| `textureUrl` | `string` | Public Storage URL for the (variable, day) PNG. |
| `coordinates` | `[[lng,lat],[lng,lat],[lng,lat],[lng,lat]]` | Via the existing `boundsToImageCoordinates()` helper, unchanged. |
| `valueRange` | `[number, number]` | `[value_min, value_max]`. |
| `issuedAt` | `string` (ISO datetime) | The GFS cycle's issuance time (data freshness). |

`null` when no row exists for the requested (variable, forecastStepHours) — the FR-005 no-data
state trigger.

## Relationships

- `ForecastMapSelection` is pure UI state; it has no foreign key or persistence relationship to
  anything — it is reset to `null`/`0` on page reload (spec.md Edge Cases: "no forecast overlay is
  shown by default").
- `ForecastDayListEntry`/`ForecastSnapshotView` are read projections of `forecast_snapshots`; no
  new relationship is introduced to that table.
