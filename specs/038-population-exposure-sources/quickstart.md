# Quickstart: Validating Population Exposure Data Sources

Prerequisites: feature 008 (Impact Analysis / `exposure_datasets`/`exposure_features`) already
live. Requires one new migration (data-model.md §1, §4, §5): widened `hazard_type` CHECK,
`exposure_datasets.source_name` column, and the new `population_source_country_datasets` table.

**Note**: this feature ships 1 source (Kontur Population) — WorldPop, Meta/HDX Population, and
GHSL are all deferred (see spec.md's three Amendments).

## 1. Apply the migration and seed the `data_sources` row

```sql
insert into data_sources (name, hazard_type, endpoint_url, poll_interval_seconds, staleness_threshold_seconds, country_code) values
  ('Kontur Population', 'population', 'https://data.humdata.org/api/3/action/', 604800, 2592000, null);
```

Expected: the row appears in the Sources tab, `health_state: "healthy"`, `last_success_at: null`
(pending first import) — same as any newly registered source (spec Edge Cases, US2 baseline).

## 1a. Resolve Kontur's dataset for the reference country (Turkey)

- Run `resolveHdxCountryDataset('kontur', 'tur')` (data-model.md §5a).
- Expected: a `population_source_country_datasets` row is written, with `resolved_by: 'hdx_search'`.
  If it returns `null` (zero/ambiguous matches), stop and add the row manually — do not proceed to
  step 2 with no row present (it will simply skip Turkey, per the Edge Cases convention, which
  would defeat this validation step's purpose).

## 2. Verify auto-imported population coverage appears without manual upload (User Story 1)

- Pick a served country with **no** manually uploaded population `exposure_datasets` row (Turkey,
  per step 1a, is the reference case).
- Invoke one of the 3 `import-<source>-population` functions manually (direct Edge Function call).
- Expected: a new `exposure_datasets` row appears for that country with `source_name` set to the
  matching source and `metric_property_name: 'population'`; its `exposure_features` rows are
  present and queryable via the existing `compute_zonal_stats`/`compute_boundary_breakdown` RPCs
  exactly as a manually uploaded dataset's features would be (spec SC-001).
- Open the Impact Analysis Wizard's asset-layer selection step: confirm the new dataset is
  selectable and labeled with its source.

## 3. Verify health tracking parity (User Story 2)

- Temporarily point one source's `endpoint_url` at an invalid URL, trigger its import function.
- Expected: only that one row's `health_state` degrades after crossing
  `down_after_consecutive_failures`, a `source_state_transitions` row is written — identical
  behavior to any existing hazard source (spec SC-002/SC-003).
- Restore the valid URL, trigger an import: the row returns to `healthy`.

## 4. Verify invalid-record rejection (User Story 3)

- Run `deno test supabase/functions/shared/validatePopulationRecord.test.ts` — covers: negative
  population value, non-numeric population value, invalid/empty geometry, out-of-coverage country
  code, and a batch of only-invalid records (import still reports success, per research.md §3).
- Trigger a live import where the upstream response includes at least one invalid record (or mock
  one at the `<source>Fetch.ts` boundary).
- Expected: the invalid record never appears in `exposure_features`; a `rejected_payloads` row is
  written with `hazard_type: 'population'` and a reason; the import's response still reports
  `200`/success for the valid portion (spec SC-004).

## 5. Verify supersession behavior (data-model.md §4)

- Run the same source's import twice in a row for the same country (second run simulating a
  routine re-import).
- Expected: exactly one `exposure_datasets` row exists for that `(source_name, country_code)` pair
  afterward — the first run's dataset (and its cascaded features) is gone, replaced by the second
  run's; at no point between the two runs is that country left with zero population features for
  that source (spec Edge Cases: prior data is only removed after the new import's insert commits).

## 6. Run automated tests

```bash
deno test --no-check --allow-net --allow-env supabase/functions/shared/
```
New tests (`validatePopulationRecord.test.ts`, and per-source `*Fetch.test.ts` covering the
upstream-shape-to-`PopulationRecord` mapping once confirmed live per research.md §4) pass alongside
existing suite, no regressions.

```bash
deno check supabase/functions/import-kontur-population/index.ts \
  supabase/functions/import-ghsl-population/index.ts \
  supabase/functions/import-meta-hdx-population/index.ts \
  supabase/functions/shared/validatePopulationRecord.ts \
  supabase/functions/shared/geometryToWkt.ts \
  supabase/functions/shared/resolveHdxCountryDataset.ts
```
