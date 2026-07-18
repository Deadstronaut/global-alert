# Quickstart: Validating the OSM/Overpass Road Network Exposure Source

Prerequisites: feature 008 (Impact Analysis / `exposure_datasets`/`exposure_features`) and feature
038 (Kontur Population — this feature reuses/generalizes its writer) already live. Requires one new
migration (data-model.md §1–3): widened `hazard_type` CHECK (`'roads'`), a `hazard_types` row, and
one seed `data_sources` row. Turkey must already be an onboarded served country
(`country_boundaries` row exists); Madagascar must be onboarded the same way before its road import
can succeed (spec.md Assumptions — this feature does not perform that onboarding itself).

## 1. Apply the migration and confirm the seed row

```sql
select name, hazard_type, health_state, last_success_at
from data_sources where hazard_type = 'roads';
```

Expected: one row, `OpenStreetMap Roads`, `health_state: "healthy"`, `last_success_at: null`
(pending first import) — same as any newly registered source.

## 2. Confirm `geometryToWkt.ts`'s LineString support before anything else

```bash
deno test --no-check supabase/functions/shared/geometryToWkt.test.ts
```

Expected: existing Point/Polygon/MultiPolygon cases still pass unmodified; new LineString/
MultiLineString cases pass. This is a prerequisite for every other step below — if this fails,
nothing downstream can succeed (research.md §7).

## 3. Live-verify the Overpass query against Turkey (reference country, research.md §8)

- Manually run the `area["ISO3166-1"="TR"][admin_level=2]->.searchArea; ... out geom;` query
  (research.md §2) against Overpass directly (e.g. via `curl`) before wiring it into
  `osmRoadsFetch.ts`, to confirm response size/time are within Overpass's `[timeout:180]` and, once
  wired, within the Edge Function's execution limit.
- Expected outcome documented in this task's implementation notes (mirrors spec 038 T015's
  "confirm within resource/time limits before finishing" convention) — if Turkey's query is too
  large for one request, the admin-boundary query-splitting fallback (plan.md Complexity Tracking)
  becomes a blocking finding to resolve before proceeding, not something to silently work around.

## 4. Verify auto-imported road coverage appears without manual upload (User Story 1)

- Pick a served country with **no** manually uploaded road `exposure_datasets` row (Turkey, per
  step 3, is the reference case).
- Invoke `import-osm-roads` manually (direct Edge Function call).
- Expected: a new `exposure_datasets` row appears for that country with `source_name: 'osm'` and
  `metric_property_name: 'length_m'`; its `exposure_features` rows are present and queryable via the
  existing `compute_zonal_stats`/`compute_boundary_breakdown` RPCs exactly as a manually uploaded
  dataset's features would be (spec SC-001).
- Open the Impact Analysis Wizard's asset-layer selection step: confirm the new dataset is
  selectable and labeled with its source.
- Repeat for Madagascar once its `country_boundaries` row exists (spec.md Assumptions) — this is
  the feature's actual MVP success bar (spec SC-001 names both countries explicitly).

## 5. Verify health tracking parity (User Story 2)

- Temporarily point the Overpass endpoint URL used by `osmRoadsFetch.ts` at an invalid URL, trigger
  `import-osm-roads`.
- Expected: the `OpenStreetMap Roads` row's `health_state` degrades after crossing
  `down_after_consecutive_failures`, a `source_state_transitions` row is written — identical
  behavior to Kontur Population or any hazard source (spec SC-002/SC-003).
- Restore the valid endpoint, trigger an import: the row returns to `healthy`.

## 6. Verify invalid-record rejection and per-country isolation (User Story 3)

- Run `deno test supabase/functions/shared/validateRoadRecord.test.ts` — covers: zero/negative
  length, invalid/empty geometry, out-of-coverage country code, an unsupported `highway` value, and
  a batch of only-invalid records (import still reports success, mirroring research.md §5's
  "zero valid records is not a failure" convention).
- Simulate one served country's Overpass query failing (e.g. malformed mock response) while another
  succeeds; confirm the failing country is omitted from that run's result and logged, while the
  succeeding country's import completes normally (FR-009).
- Trigger an import where the response includes at least one invalid record (or mock one at the
  `osmRoadsFetch.ts` boundary). Expected: the invalid record never appears in `exposure_features`; a
  `rejected_payloads` row is written with `hazard_type: 'roads'` and a reason; the import's response
  still reports `200`/success for the valid portion (spec SC-004).

## 7. Verify supersession behavior (data-model.md's writer section)

- Run `import-osm-roads` twice in a row for the same country.
- Expected: exactly one `exposure_datasets` row exists for `(source_name: 'osm', country_code)`
  afterward — the first run's dataset (and cascaded features) is gone, replaced by the second run's;
  the country is never left with zero road features between the two runs.

## 8. Confirm the Kontur write path is unaffected (regression check for the `writeExposureDataset` generalization)

```bash
deno test --no-check supabase/functions/shared/supersedeExposureDataset.test.ts
deno test --no-check supabase/functions/shared/populationImportPartition.test.ts
```

Expected: spec 038's existing test suite passes unmodified — `writePopulationDataset` is now a thin
wrapper over the new `writeExposureDataset`, with no behavior change (plan.md Complexity Tracking).

## 9. Run the full new test suite

```bash
deno test --no-check --allow-net --allow-env supabase/functions/shared/
```

```bash
deno check supabase/functions/import-osm-roads/index.ts \
  supabase/functions/shared/validateRoadRecord.ts \
  supabase/functions/shared/roadRecord.ts \
  supabase/functions/shared/osmRoadsFetch.ts \
  supabase/functions/shared/roadImportPartition.ts \
  supabase/functions/shared/writeExposureDataset.ts \
  supabase/functions/shared/geometryToWkt.ts
```
