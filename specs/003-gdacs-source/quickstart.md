# Quickstart: Validating the GDACS Global Data Source

Prerequisites: features 001 (data_sources/health tracking) and 002 (country scoping) already
live. No new migration needed for this feature.

**Note**: GDACS is integrated into the 4 existing `fetch-earthquakes`/`fetch-wildfires`/
`fetch-floods`/`fetch-droughts` functions, not a standalone `fetch-gdacs` function — this was
revised during implementation because this app's deduplication runs in-memory inside each
single-hazard function, and a standalone function would never see the other sources' events for
the same hazard type in the same batch (research.md §6).

## 1. Seed the 4 GDACS data_sources rows

Via the existing admin CRUD (Sources tab, as `super_admin`) or a one-off SQL insert, create 4
rows per data-model.md:

```sql
insert into data_sources (name, hazard_type, endpoint_url, poll_interval_seconds, country_code) values
  ('GDACS', 'earthquake', '<GDACS GeoJSON event-list endpoint>', 300, null),
  ('GDACS', 'wildfire',   '<GDACS GeoJSON event-list endpoint>', 300, null),
  ('GDACS', 'flood',      '<GDACS GeoJSON event-list endpoint>', 300, null),
  ('GDACS', 'drought',    '<GDACS GeoJSON event-list endpoint>', 300, null);
```

Expected: all 4 rows appear in the Sources tab's **Global** group (per feature 002's grouping),
each `health_state: "healthy"`, `last_success_at: null` (pending first fetch) — for every admin,
regardless of their own country (spec SC-001).

## 2. Verify multi-hazard routing (User Story 1)

- Invoke `fetch-earthquakes`, `fetch-wildfires`, `fetch-floods`, and `fetch-droughts` manually
  (direct Edge Function calls) — each now independently pulls GDACS's feed and folds in its own
  hazard type's events alongside that function's other existing sources.
- Expected: earthquake/wildfire/flood/drought events from GDACS appear in their respective
  existing map layers, indistinguishable in structure from events sourced elsewhere (spec SC-002).
- Confirm all 4 GDACS `data_sources` rows show updated `last_success_at`/`last_attempt_at` after
  their respective function runs.

## 3. Verify out-of-scope category exclusion (User Story 2 — the higher-risk story)

- Run `deno test supabase/functions/shared/gdacsSplit.test.ts` and confirm it covers: a batch
  with a TC record, a VO record, and valid EQ/WF/FL/DR records.
- Expected: TC/VO records never appear in any hazard bucket — they appear in `dropped` with a
  reason; the in-scope records still get routed correctly in the same call (spec SC-003).
- Trigger a live `fetch-earthquakes` run where GDACS's response happens to include a TC or VO
  event (or mock one).
- Expected: **no** `rejected_payloads` row is written for the TC/VO record (that table's
  `hazard_type` CHECK constraint doesn't accept them — research.md §7); instead, the exclusion
  appears in the Edge Function's logs and in the response's `meta.droppedCategories` array with a
  reason like `"unsupported GDACS eventtype: TC"`. The fetch's `meta.status` is still
  `"ok"`/`"partial"` based on the in-scope records alone, never treated as an error because of the
  dropped categories.

## 4. Verify health tracking parity and cross-source deduplication (User Story 3)

- Temporarily point one GDACS `data_sources` row's `endpoint_url` at an invalid URL via the admin
  UI, trigger that hazard type's function.
- Expected: only that one GDACS row's `health_state` degrades (each of the 4 functions records
  GDACS's outcome independently against its own hazard-type row) — a `source_state_transitions`
  row is written for that row, same behavior as any existing source (spec SC-004).
- Restore the valid URL, trigger a fetch: the row returns to `healthy`.
- Feed a GDACS earthquake with the same approximate location/time as an already-ingested USGS
  earthquake, then run `fetch-earthquakes`.
- Expected: only one event is retained — GDACS's contribution now joins `fetch-earthquakes`'s
  existing in-memory dedup step (alongside USGS/EMSC/AFAD/Kandilli) before the single
  `upsertEvents()` call, so cross-source dedup works correctly (this is the exact behavior a
  standalone `fetch-gdacs` function would NOT have provided — see research.md §6).
- Repeat the equivalent check for `fetch-wildfires` (vs. NASA FIRMS) and `fetch-droughts` (vs.
  FEWS NET) — both gained a dedup step for the first time as part of this feature, since they
  previously had only one source each.

## 5. Run automated tests

```bash
deno test --no-check --allow-net --allow-env supabase/functions/shared/
```
`gdacsSplit.test.ts`'s tests (routing + drop behavior + empty-feed case) pass alongside the
existing 001-era `validatePayload`/`sourceHealth` Deno tests, with no regressions.

```bash
deno check supabase/functions/fetch-earthquakes/index.ts supabase/functions/fetch-wildfires/index.ts \
  supabase/functions/fetch-floods/index.ts supabase/functions/fetch-droughts/index.ts \
  supabase/functions/shared/gdacsSplit.ts supabase/functions/shared/gdacsFetch.ts supabase/functions/shared/dedup.ts
```
No new type errors introduced (pre-existing `esm.sh`/strict-catch type errors from before this
feature are expected and unrelated — see 001's T031 notes).
