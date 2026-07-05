# Contracts: Impact Analysis & Exposure Modelling

## Upload exposure dataset (Edge Function, service role)

```
POST /functions/v1/upload-exposure-dataset
Authorization: Bearer <user JWT>
Body: { name, description, metricPropertyName, geojson: <FeatureCollection> }
```

- Resolves caller via `admin.auth.getUser()`, looks up profile (role/country_code/org_id) —
  mirrors `create-user`/`suspend-user` pattern (specs 004).
- Rejects if role is not org_admin/country_admin/super_admin.
- Runs `validateGeojson(geojson, metricPropertyName)` from `shared/geojsonValidation.ts` —
  on failure, returns 400 with the validation error, writes nothing.
- On success: inserts one `exposure_datasets` row, then one `exposure_features` row per feature
  (batched insert), setting `country_code`/`org_id` from the caller's profile.
- Response: `{ datasetId, featureCount }`.

## List / delete exposure datasets (direct Supabase-JS, RLS-enforced)

```js
supabase.from('exposure_datasets').select('*').order('created_at', { ascending: false })
supabase.from('exposure_datasets').delete().eq('id', datasetId)
```

No Edge Function needed — RLS already scopes visibility/deletion rights.

## Run impact analysis (RPC, direct Supabase-JS)

```js
const radiusKm = radiusOverride ?? defaultBufferRadiusKm(hazardEvent) // src/lib/hazardBuffer.js
const { data, error } = await supabase.rpc('compute_zonal_stats', {
  dataset_id: datasetId,
  center_lat: hazardEvent.lat,
  center_lng: hazardEvent.lng,
  radius_km: radiusKm,
})
// data: [{ total_value, feature_count }]
```

A `feature_count === 0` result is rendered as "no exposure data intersects this area" (FR-007),
distinct from `error` (a real failure) or a loading state.

## Save / load scenario (direct Supabase-JS)

```js
supabase.from('impact_scenarios').insert({
  name, hazard_event_snapshot: hazardEvent, exposure_dataset_id: datasetId,
  radius_km_override: radiusOverride, result_snapshot: { total_value, feature_count },
  country_code: auth.countryCode, org_id: auth.session?.orgId,
})

supabase.from('impact_scenarios').select('*, exposure_datasets(id,name)').eq('id', scenarioId).maybeSingle()
// if the joined exposure_datasets is null (dataset was deleted, FK went SET NULL),
// the UI shows "referenced data no longer available" per FR-009
```

## Geocoding search (Edge Function)

```
POST /functions/v1/geocode-search
Authorization: Bearer <user JWT>
Body: { query: string }
Response: { results: [{ lat, lng, label }] }  // empty array => "no results" state (FR-011)
```

Proxies to a per-deployment-configured provider (`GEOCODING_API_URL`/`GEOCODING_API_KEY` Edge
Function secrets) — no provider specifics in application code (research.md §5).

## Export impact analysis result (client-side, mirrors specs 006/007's export pattern)

```js
rowsToCsv([{ dataset: datasetName, hazard: hazardEvent.title, radius_km, total_value, feature_count }])
rowsToJson({ dataset: datasetName, hazard: hazardEvent, radius_km, total_value, feature_count })
// GeoJSON export: fetch intersecting features via a `.rpc` or direct RLS-scoped query filtered
// by the same ST_DWithin condition (exposed as a second RPC `get_intersecting_features(...)`
// returning geometry+properties+metric_value for GeoJSON re-assembly client-side)
```
