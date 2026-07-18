# Contract: `import-osm-roads` (scheduled Edge Function)

Not an admin-facing CRUD endpoint — a scheduled/manually-triggerable import job, invoked the same
way `import-kontur-population` already is (pg_cron weekly trigger, per research.md §6; a manual
"run now" action from the Sources view if that already exists for other sources — reuse, don't add
a new trigger mechanism).

One Edge Function total (not one per country, not one per hazard-type-family) — matches the
one-function-per-independent-source convention `import-kontur-population` already established.

## Request

No admin auth required for the scheduled invocation path (matches every existing `fetch-*`/
`import-*` function, which runs with the service-role key server-side); if a manual "run now" admin
trigger is added, it follows `upload-exposure-dataset`'s existing bearer-token + role-check pattern.

```
POST /functions/v1/import-osm-roads
Body: {} (no parameters — imports for all countries the running instance serves, per
             getServedCountryCodes())
```

## Response

```ts
{
  countriesProcessed: number       // countries with a successful import this run
  countriesSkipped: string[]       // country codes with no country_boundaries row yet (not an error)
  featuresImported: number         // total exposure_features (road segment) rows written across all countries
  rejected: number                 // records excluded by validateRoadRecord()
}
```

`200` on any run that completed (even zero countries processed). Non-`200` only if the Overpass
query itself failed entirely for every country attempted (network error, unparseable response) —
this is when `recordFetchOutcome(sourceId, 'failure', ...)` is called; a `200` response always
corresponds to `recordFetchOutcome(sourceId, 'success', ...)`, per the same "zero valid records/
countries is not a failure" convention spec 038 established (research.md §5, FR-009's per-country
isolation).

## Internal contract: `osmRoadsFetch.ts`

```ts
function fetchOsmRoads(countryCodes: string[]): Promise<Map<string, RoadRecord[]>>
```

For each country code, issues one Overpass QL query (research.md §2) scoped to that country via
`area["ISO3166-1"="<code>"]`, and maps each returned `way` (with `out geom`-inlined coordinates)
into a `RoadRecord` (data-model.md). A single country's query failure (timeout, malformed response)
is caught and that country is omitted from the returned map — NOT thrown — so one country's failure
never blocks the other served countries' imports (FR-009). A total request-level failure (Overpass
endpoint unreachable for every country) throws, caught by the calling Edge Function.

## Internal contract: `validateRoadRecord()` (`shared/validateRoadRecord.ts`, new)

```ts
function validateRoadRecord(
  record: RoadRecord,
  servedCountryCodes: string[],
): { valid: true } | { valid: false; reason: string }
```

Checks (FR-005): geometry is `LineString`/`MultiLineString`-parseable via `geometryToWkt()`;
`lengthMeters` is a finite number `> 0`; `countryCode` is in `servedCountryCodes`; `properties.
highway` is one of the imported classification values (data-model.md). Invalid records are logged
via the existing `logRejectedPayload(sourceId, 'roads', reason, record)` and excluded from the
batch — never block the rest of the batch (mirrors `validatePopulationRecord`'s contract exactly).

## Internal contract: `writeExposureDataset()` (`shared/writeExposureDataset.ts`, new — generalized)

```ts
async function writeExposureDataset(
  sourceName: string,
  countryCode: string,
  metricPropertyName: string,
  features: { geometry: GeoJSONGeometry; metricValue: number; properties: Record<string, unknown> }[],
): Promise<{ datasetId: string; featureCount: number }>
```

1. Insert a new `exposure_datasets` row (`source_name: 'osm'`, `country_code`,
   `metric_property_name: 'length_m'`, `org_id: null`, `created_by: null`) + its
   `exposure_features` rows (chunked, 2000/insert — same PostgREST-size-limit mitigation spec 038
   applied), reusing `geometryToWkt()` (now LineString/MultiLineString-capable, data-model.md §6).
2. Only on successful insert of both: delete any *prior* `exposure_datasets` row(s) with the same
   `(source_name, country_code)` (cascades to their `exposure_features`).
3. If the insert fails partway, roll back the new dataset row and leave the prior dataset for that
   source/country untouched — identical guarantee to `writePopulationDataset` today, because this
   *is* the same code path, generalized (plan.md Complexity Tracking).

`writePopulationDataset()` (spec 038) becomes a thin wrapper over this function — no behavior
change for Kontur, verified by its existing test suite passing unmodified.
