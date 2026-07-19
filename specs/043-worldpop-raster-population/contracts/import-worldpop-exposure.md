# Contract: `import-worldpop` (Edge Function)

Mirrors `import-osm-roads`/`import-hydrorivers` (specs 040/041) exactly.

## Request

```
POST /functions/v1/import-worldpop
Authorization: Bearer <service-role or admin JWT>
Content-Type: application/json

{ "countryCode"?: "tr" }   // optional — omit to process every served country
```

## Response

```json
{
  "countriesProcessed": 1,
  "countriesSkipped": [],
  "featuresImported": 5233,
  "rejected": 0
}
```

Same semantics as spec 040/041's contracts: a country with no WorldPop coverage (edge case in
spec.md) is "skipped," not a failure; a country-level download/read/aggregation failure is caught
and that country is omitted from the run without failing the whole invocation (FR-009's
per-country isolation).

## Non-goals

- No live per-request raster fetch on every map load — this is a scheduled/manual batch import
  against WorldPop's published rasters, matching spec.md's explicit scope.
- No year/resolution selection via request parameter in this MVP — the latest available year (per
  WorldPop's own API response ordering) and H3 resolution 7 are fixed (research.md §3); a future
  `year` or `resolution` request parameter is a natural, low-risk extension if ever needed, but is
  not built now (YAGNI).
- No support for a raster source other than WorldPop in this Edge Function — FR-011's genericity
  requirement is satisfied at the `RasterSourceConfig`/`rasterToHexagon.ts` module level, not by
  this Edge Function accepting an arbitrary source parameter; a future raster source gets its own
  Edge Function (mirroring `import-hydrorivers` vs `import-hydrobasins` being two functions, not
  one parameterized function), reusing `rasterToHexagon.ts`.
