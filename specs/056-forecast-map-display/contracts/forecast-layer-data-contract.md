# Forecast Layer Data Contract (`src/utils/forecastLayerData.js`)

Two functions, mirroring `windLayerData.js`'s existing exported shape — no REST endpoint, direct
Supabase client queries (consistent with every other map-layer data fetch in this codebase).

## `fetchForecastDayList(variable)`

```js
export async function fetchForecastDayList(variable) {
  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('forecast_step_hours, valid_at, issued_at')
    .eq('variable', variable)
    .order('issued_at', { ascending: false })
    .limit(100) // enough rows to cover the latest cycle's full step set even with some retention overlap

  if (error || !data?.length) return []

  const latestIssuedAt = data.reduce((latest, row) => (row.issued_at > latest ? row.issued_at : latest), data[0].issued_at)
  return data
    .filter((row) => row.issued_at === latestIssuedAt)
    .map((row) => ({ forecastStepHours: row.forecast_step_hours, validAt: row.valid_at }))
    .sort((a, b) => a.forecastStepHours - b.forecastStepHours)
}
```

Returns `[]` (not `null`) when nothing is available — `FlowControlPanel.vue` treats an empty list
as "no forecast data for this variable at all", a stricter version of the FR-005 no-data state.

## `fetchForecastSnapshot(variable, forecastStepHours)`

```js
export async function fetchForecastSnapshot(variable, forecastStepHours) {
  const { data, error } = await supabase
    .from('forecast_snapshots')
    .select('texture_storage_path, value_min, value_max, bounds, issued_at')
    .eq('variable', variable)
    .eq('forecast_step_hours', forecastStepHours)
    .order('issued_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const { data: urlData } = supabase.storage.from('forecast-snapshots').getPublicUrl(data.texture_storage_path)
  if (!urlData?.publicUrl) return null

  return {
    textureUrl: urlData.publicUrl,
    coordinates: boundsToImageCoordinates(data.bounds),
    valueRange: [data.value_min, data.value_max],
    issuedAt: data.issued_at,
  }
}
```

Identical shape to `fetchLatestOverlaySnapshot`'s return value (data-model.md's
ForecastSnapshotView) — `MapView.vue`'s existing `map.addSource({type:'image', ...})` /
`map.addLayer({type:'raster', ...})` code can consume it with no adaptation.

## Freshness

Every consumer of `fetchForecastSnapshot`'s result renders `issuedAt` alongside the layer (in
`FlowControlPanel.vue`'s Forecast row, next to the day label) — never omitted, matching spec
055's own FR-007 precedent.
