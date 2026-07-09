# Contract: `import-population-source` family (3 scheduled Edge Functions)

Not admin-facing CRUD endpoints — these are scheduled/manually-triggerable import jobs, invoked
the same way existing `fetch-*` functions are (client-driven polling per `POLLING_INTERVALS`, or a
manual "run now" action from the Sources view, if that already exists for other sources — reuse,
don't add a new trigger mechanism).

One Edge Function per source (matching the existing one-function-per-source-family convention,
*not* GDACS's folded-in exception — population sources don't share dedup state with each other or
with hazard sources, so there's no reason to fold them together):

- `import-kontur-population`
- `import-ghsl-population`
- `import-meta-hdx-population`

**`import-worldpop-population` does not exist in this feature** — WorldPop is deferred, see
plan.md's Summary and data-model.md §5b.

Each shares the same shape, differing only in its own `<source>Fetch.ts` module:

## Request

No admin auth required for the scheduled invocation path (matches existing `fetch-*` functions,
which run with the service-role key server-side); if a manual "run now" admin trigger is added, it
follows `upload-exposure-dataset`'s existing bearer-token + role-check pattern (`org_admin` /
`country_admin` / `super_admin`).

```
POST /functions/v1/import-kontur-population
Body: {} (no parameters — imports for all countries the running instance serves, per
             getServedCountryCodes(), data-model.md §4a)
```

## Response

```ts
{
  countriesProcessed: number       // countries with a successful import this run
  countriesSkipped: string[]       // country codes with no upstream data available (not an error)
  featuresImported: number         // total exposure_features rows written across all countries
  rejected: number                 // records excluded by validatePopulationRecord()
}
```

`200` on any run that completed (even zero countries processed — "no new data this cycle" is
success, per research.md §3). Non-`200` only if the upstream fetch/download itself failed
entirely (network error, unparseable response) — this is when `recordFetchOutcome(sourceId,
'failure', ...)` is called; a `200` response always corresponds to `recordFetchOutcome(sourceId,
'success', ...)`.

## Internal contract: `<source>Fetch.ts`

```ts
function fetch<Source>Population(countryCodes: string[]): Promise<PopulationRecord[]>
```

One module per source (`konturFetch.ts`, `ghslFetch.ts`, `metaHdxFetch.ts`), each responsible for
its own upstream access pattern — for Kontur/Meta: look up `population_source_country_datasets`
(data-model.md §5) for that country's resolved HDX dataset ID, then download and parse that
dataset's resource (GeoPackage for Kontur, CSV/zip for Meta — both verified live, research.md §4);
for GHSL: bounding-box tile download, no per-country lookup — and for mapping its own response
shape into the shared `PopulationRecord[]` (data-model.md). Never throws for per-record issues
(those become `rejected` via `validatePopulationRecord`); may throw for whole-request failures
(network/parse error), caught by the calling Edge Function and turned into a `failure` outcome for
that source's `data_sources` row.

## Internal contract: `validatePopulationRecord()` (`shared/validatePopulationRecord.ts`, new)

```ts
function validatePopulationRecord(
  record: PopulationRecord,
  servedCountryCodes: string[],
): { valid: true } | { valid: false; reason: string }
```

Checks (FR-004): geometry is a supported type (`geometryToWkt`-parseable) with valid coordinates;
`population` is a finite number `>= 0`; `countryCode` is in `servedCountryCodes`. Invalid records
are logged via the existing `logRejectedPayload(sourceId, 'population', reason, record)` and
excluded from the batch written to `exposure_features` — never block the rest of the batch.

## Internal contract: `resolveHdxCountryDataset()` (`shared/resolveHdxCountryDataset.ts`, new)

```ts
async function resolveHdxCountryDataset(
  sourceOrg: 'kontur' | 'meta',
  countryIso3Lower: string,
): Promise<{ datasetId: string; title: string } | null>
```

Called once per `(source, country)` pair at onboarding time (not by the scheduled import
functions themselves), per data-model.md §5a. Queries HDX's `package_search` with
`fq=organization:<sourceOrg>+AND+groups:<countryIso3Lower>` (verified live against the real HDX
API during planning). Writes a `population_source_country_datasets` row on an unambiguous single
match; returns `null` (no row written) on zero or multiple matches, surfaced to the caller
(onboarding flow / admin action) as "needs manual entry" rather than guessed. `konturFetch.ts` and
`metaHdxFetch.ts` read the already-resolved row from `population_source_country_datasets` — they do
NOT call this function themselves.

## Internal contract: dataset supersession helper (`shared/supersedeExposureDataset.ts`, new)

```ts
async function writePopulationDataset(
  sourceName: 'kontur' | 'ghsl' | 'meta_hdx',
  countryCode: string,
  records: PopulationRecord[],
): Promise<{ datasetId: string; featureCount: number }>
```

1. Insert a new `exposure_datasets` row (`source_name`, `country_code`, `metric_property_name:
   'population'`, `org_id: null`, `created_by: null`) + its `exposure_features` rows, reusing the
   shared `geometryToWkt()` helper (data-model.md).
2. Only on successful insert of both: delete any *prior* `exposure_datasets` row(s) with the same
   `(source_name, country_code)` (cascades to their `exposure_features`), per data-model.md §4's
   supersession rule.
3. If the insert fails partway, roll back the new dataset row (mirrors
   `upload-exposure-dataset/index.ts`'s existing rollback-on-partial-failure behavior) and leave
   the prior dataset for that source/country untouched.
