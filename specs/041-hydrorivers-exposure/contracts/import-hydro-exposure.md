# Contract: `import-hydrorivers` / `import-hydrobasins` (Edge Functions)

Two independent Edge Functions, same request/response shape, mirroring
`import-osm-roads` (spec 040) exactly.

## Request

```
POST /functions/v1/import-hydrorivers
POST /functions/v1/import-hydrobasins
Authorization: Bearer <service-role or admin JWT>
Content-Type: application/json

{ "countryCode"?: "tr" }   // optional — omit to process every served country
```

## Response

```json
{
  "countriesProcessed": 1,
  "countriesSkipped": [],
  "featuresImported": 65010,
  "rejected": 0
}
```

Same semantics as `import-osm-roads`'s contract: a country with zero valid records after clipping
is "skipped," not a failure; a country-level download/parse failure is caught and that country is
omitted from the run without failing the whole invocation (FR-008's per-country isolation).

## Non-goals

- No live per-request fetch — this is a scheduled/manual batch import against a static continental
  source file, matching spec.md's explicit scope decision.
- No partial-level HydroBASINS selection via request parameter in this MVP — level 6 is fixed
  (research.md §3); a future `level` request parameter is a natural, low-risk extension if a
  different granularity is ever needed, but is not built now (YAGNI).
