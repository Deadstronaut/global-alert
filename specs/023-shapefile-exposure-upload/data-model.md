# Data Model: Shapefile Exposure Dataset Upload

No new entities and no schema change — this feature adds a second accepted *source file format*
for the existing `exposure_datasets`/`exposure_features` entities (spec 008), which are otherwise
untouched.

## New pure functions: `detectParserType()` / `parseExposureFile()`

```
detectParserType(fileName: string): 'geojson' | 'shapefile' | null
```

Returns `'geojson'` for a name ending in `.json` or `.geojson` (case-insensitive), `'shapefile'`
for a name ending in `.zip` (case-insensitive), `null` for anything else (FR-002).

```
parseExposureFile(file: File): Promise<GeoJSON.FeatureCollection>
```

Calls `detectParserType(file.name)`; if `'geojson'`, reads the file as text and `JSON.parse`s it
(identical to the existing behavior); if `'shapefile'`, reads the file as an `ArrayBuffer` and
converts it via `shpjs` — `shpjs` returns an **array** of `FeatureCollection`s instead of a single
one when the `.zip` contains multiple `.shp` layers, so `parseExposureFile()` throws a clear
"multiple layers not supported" error in that case rather than passing the array through; if
`null`, throws before reading the file at all, with a message identifying the file as an
unsupported type.

## Effect on the existing `upload-exposure-dataset` Edge Function contract

No change. Both parser paths converge on the same `GeoJSON.FeatureCollection` shape, passed as the
`geojson` field of the exact same `supabase.functions.invoke('upload-exposure-dataset', { body:
{ name, description, metricPropertyName, geojson } })` call already used today — the Edge
Function cannot distinguish (and does not need to know) whether the `geojson` payload originated
from a `.geojson` file or a converted Shapefile.
