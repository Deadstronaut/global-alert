# Contract: Exposure Dataset Upload (Shapefile addition)

The `upload-exposure-dataset` Edge Function's contract (spec 008) is **unchanged** by this
feature. This document records what stays the same and what's new only on the client side.

## Unchanged: Edge Function payload and behavior

**Operation**: `supabase.functions.invoke('upload-exposure-dataset', { body: { name, description,
metricPropertyName, geojson } })`

Identical request shape, identical validation (`geojsonValidation.ts`: structural + WGS84 CRS +
per-feature numeric metric check), identical PostGIS write path
(`geometryToWkt()` → `exposure_datasets`/`exposure_features`), identical response shape and error
messages — regardless of whether `geojson` originated from a directly-uploaded `.geojson` file or
was converted from a Shapefile client-side.

## New: client-side file-type handling

| Selected file | `detectParserType()` result | Behavior |
|---|---|---|
| `data.geojson` / `data.json` | `'geojson'` | Read as text, `JSON.parse` — identical to today |
| `data.zip` (valid Shapefile bundle, WGS84) | `'shapefile'` | Read as `ArrayBuffer`, converted via `shpjs` to a `FeatureCollection`, then uploaded exactly as GeoJSON is today |
| `data.zip` (Shapefile bundle, non-WGS84 coordinates) | `'shapefile'` | Conversion succeeds, but the existing WGS84 check in `geojsonValidation.ts` rejects the upload at the Edge Function (FR-004) — no new client-side CRS check is added |
| `data.zip` (malformed/incomplete Shapefile) | `'shapefile'` | `shpjs` conversion itself throws — surfaced to the user as an upload error before any Edge Function call (FR-005) |
| `data.csv`, `data.txt`, or no recognizable extension | `null` | Rejected immediately with an "unsupported file type" message, before any read/parse attempt |
