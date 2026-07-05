# Quickstart: Validating Data Source Health, State Tracking & Payload Validation

Prerequisites: local Supabase project linked (`supabase/migrations` applied), `.env` with
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set, `npm install` run.

## 1. Apply the new migration

```bash
supabase db push
# or, for local dev:
supabase migration up
```
Confirms `data_sources`, `source_state_transitions`, `rejected_payloads` tables exist with RLS
enabled (see data-model.md).

## 2. Seed the 5 existing sources as `data_sources` rows

Run once (via SQL console or a one-off script) to backfill config rows for the sources that
already exist as hard-coded fetchers, e.g.:

**Important**: `name` must exactly match the string each `fetch-*` function passes to
`resolveSourceId(hazardType, name)` — this is how health tracking finds the right
`data_sources` row. Current names used in code:

```sql
insert into data_sources (name, hazard_type, endpoint_url, poll_interval_seconds) values
  ('USGS', 'earthquake', 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', 60),
  ('EMSC', 'earthquake', 'https://www.seismicportal.eu/fdsnws/event/1/query', 60),
  ('AFAD', 'earthquake', 'https://deprem.afad.gov.tr/apiv2/event/filter', 60),
  ('Kandilli', 'earthquake', 'https://api.orhanaydogdu.com.tr/deprem/kandilli/live', 60),
  ('NASA FIRMS', 'wildfire', 'https://firms.modaps.eosdis.nasa.gov/api/area/json', 900),
  ('GloFAS/Copernicus', 'flood', 'https://www.globalfloods.eu/glofas-forecasting/glofas-api/', 300),
  ('ReliefWeb', 'flood', 'https://api.reliefweb.int/v1/disasters', 300),
  ('FEWS NET', 'drought', 'https://fdw.fews.net/api/ipcpackage/', 3600),
  ('WFP HungerMap', 'food_security', 'https://api.hungermapdata.org/v2/info/country', 3600);
```

If a source's `data_sources` row does not exist yet, `resolveSourceId()` returns `null` and
the corresponding fetcher runs exactly as before this feature (no health/validation
tracking) — this feature is additive and never blocks existing ingestion (plan.md Constraints).
Expected: `GET /manage-data-sources` (or the health dashboard UI) shows all 5 with
`health_state: "healthy"` and `last_success_at: null` (pending first fetch).

## 3. Verify health-state transitions (User Story 1)

- Trigger a fetch cycle for one source manually (invoke its Edge Function directly).
- Expected: `last_success_at`/`last_attempt_at` update; `health_state` stays/becomes `healthy`.
- Temporarily point that source's `endpoint_url` at an invalid URL (via `PATCH`), then trigger
  another fetch.
- Expected: `consecutive_failures` increments, `health_state` becomes `degraded`; after reaching
  `down_after_consecutive_failures` consecutive failures, `health_state` becomes `down`; a
  `source_state_transitions` row is written for each state change (not for repeated failures
  within the same state).
- Restore the valid `endpoint_url`, trigger a fetch: `health_state` returns to `healthy`
  automatically, another transition row is written recording recovery.

## 4. Verify source registration/disable/remove (User Story 2)

- `POST /manage-data-sources` with a new source of an already-supported `hazard_type`.
- Expected: appears in dashboard immediately as `healthy`/pending; included in next poll cycle.
- `PATCH .../:id` with `is_active: false`.
- Expected: `health_state` becomes `disabled`; subsequent scheduled polls skip this source (verify
  via Edge Function logs or `last_attempt_at` no longer advancing); a transition row is recorded.
- `DELETE .../:id` on a source with previously-ingested events.
- Expected: `data_sources` row and its `source_state_transitions` are gone (cascade); the
  hazard-type event rows it previously ingested (e.g., in the `earthquake` table) still exist
  unchanged.

## 5. Verify payload validation & rejection (User Story 3)

- Temporarily feed a malformed record through `validatePayload()` (unit test, or a manual call
  with a record missing `lat`/`lng`, or with `lat: 137.4`).
- Expected: `validatePayload()` returns `{ valid: false, reason: "..." }`; the record never
  reaches `normalize()`/`upsertEvents()`; a `rejected_payloads` row is written with that reason.
- Feed a batch containing one malformed and one valid record through a `fetch-*` function.
- Expected: the valid record is upserted normally; the malformed one is rejected and logged; the
  function's response `meta` still reports success/partial status without crashing (matches
  existing `fetchErrors`/`dbErrors` reporting shape in `fetch-earthquakes/index.ts`).

## 6. Verify audit queryability (FR-014)

- `GET /manage-data-sources/:id/audit?from=<date>&to=<date>` as a `super_admin` profile.
- Expected: returns both `transitions` and `rejected_payloads` entries for that source within
  range, sufficient to reconstruct what happened without server logs (spec SC-004).
- Repeat as a `viewer` or `org_admin` profile.
- Expected: `403` (audit history is `super_admin`-only per research.md §4).

## 7. Run automated tests

```bash
npm run test        # Vitest — validatePayload.test.js, sourceHealth.test.js (new script, added in tasks)
deno test supabase/functions/shared/   # Deno-native tests for the Edge Function-side logic
```
All tests pass; `sourceHealth.test.js`/`.ts` explicitly covers every transition in the state
diagram in data-model.md (including the "no transition row written when state doesn't actually
change" rule).
