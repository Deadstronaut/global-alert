---

description: "Task list for Multi-Horizon Hazard Forecasting Dashboard"

---

# Tasks: Multi-Horizon Hazard Forecasting Dashboard

**Input**: Design documents from `specs/055-hazard-forecasting-dashboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/forecast-read-contract.md, quickstart.md

**Tests**: Not explicitly requested for this feature beyond the constitution's non-negotiable
zones (dedup, severity mapping, CAP XML, proximity — none of which this feature touches), so this
list follows `wind-importer`'s existing convention: manual live-verification via quickstart.md for
ingestion, plus `vitest` unit tests for pure frontend data-shaping logic (matching
`tests/unit/windLayerData.test.js`).

**Organization**: Tasks are grouped by user story (US1 = 15-day, US2 = 1-month, US3 = 3-month),
matching spec.md's priorities exactly.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Add `forecast-snapshots` Supabase Storage bucket + `forecast_snapshots` table + RLS +
      audit trigger migration in `supabase/migrations/<ts>_forecast_snapshots.sql`, following the
      exact shape of `supabase/migrations/20260805120000_overlay_snapshots.sql` (see
      data-model.md's ForecastSnapshot table)
- [X] T002 Add `forecast_outlooks` table + RLS + audit trigger migration in
      `supabase/migrations/<ts>_forecast_outlooks.sql`, same RLS/audit convention (see
      data-model.md's ForecastOutlook table)
- [X] T003 [P] Add 90-day retention function + daily cron job for `forecast_snapshots` in
      `supabase/migrations/<ts>_forecast_snapshots_retention.sql`, modeled on
      `supabase/migrations/20260805130000_overlay_snapshot_retention.sql` but with a 90-day
      window (FR-012) instead of 7, scheduled at a time slot that doesn't collide with the
      existing 02:30/02:35 UTC jobs (e.g. 02:40 UTC)
- [X] T004 [P] Add 90-day retention function + daily cron job for `forecast_outlooks` in
      `supabase/migrations/<ts>_forecast_outlooks_retention.sql`, same pattern, scheduled at
      02:45 UTC

**Checkpoint**: Schema exists; ingestion and frontend work can now begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared ingestion scaffolding all three horizons build on.

- [X] T005 Add `--forecast-horizon={15d,1mo,3mo}` argument parsing to `wind-importer/main.py`,
      alongside the existing `--layer-type`/`--overlay-type` flags (same `argparse` structure),
      each horizon reading its own `FORECAST_15D_ENABLED`/`FORECAST_1MO_ENABLED`/
      `FORECAST_3MO_ENABLED` env var (default `true`) and exiting immediately with a log line if
      disabled (research.md §5, FR-009/FR-010)
- [X] T006 [P] Add `forecast-15d-importer-scheduled`, `forecast-1mo-importer-scheduled`,
      `forecast-3mo-importer-scheduled` services to `docker-compose.yml`, same
      `image: mhews-wind-importer:latest` / `restart: unless-stopped` / `env_file: ./server/.env`
      shape as `wind-importer-scheduled`, each with its own `command`
      (`["--forecast-horizon=15d"]` etc.)

**Checkpoint**: Container scaffolding ready; US1/US2/US3 ingestion logic can now be filled in independently.

---

## Phase 3: User Story 1 - Short-range operational forecast (Priority: P1) 🎯 MVP

**Goal**: Admin picks a region and the 15-day horizon and sees a day-by-day deterministic
wind/precipitation/temperature forecast, clearly labeled and timestamped.

**Independent Test**: Run `docker compose run --rm wind-importer --forecast-horizon=15d --once`,
confirm rows land in `forecast_snapshots` (quickstart.md §1), then open the dashboard and confirm
the Forecast panel renders a 15-day view for a region with ingested data.

### Implementation for User Story 1

- [X] T007 [US1] Add `fetch_latest_forecast_grib2(variable, forecast_step_hours)` to
      `wind-importer/fetch_gfs.py`, reusing `latest_available_cycle()`/`_download()`/the
      `filename(forecast_hour=...)` parameter already present, looping the step list
      `[24, 72, 120, 168, 216, 264, 312, 360]` (research.md §1) for `variable` in
      `{wind_speed, precipitation, temperature}` — reuse the existing wind U/V, precip, and
      temperature GRIB2 field-fetching logic already in this file, just called at each future
      `forecast_hour` instead of only `f000`
- [X] T008 [US1] Create `wind-importer/forecast_texture.py`: convert each fetched forecast-step
      GRIB2 into a PNG texture, reusing `grib_to_texture.py`'s/`overlay_texture.py`'s existing
      decode-range and color-ramp helpers rather than duplicating them (import and call, don't
      copy-paste)
- [X] T009 [US1] Wire the `--forecast-horizon=15d` branch in `wind-importer/main.py`: for each
      variable, fetch all forecast steps (T007), texture-ize each (T008), upload to the
      `forecast-snapshots` bucket, and upsert one `forecast_snapshots` row per
      (variable, forecast_step_hours) via the Supabase service-role client (same upload/insert
      pattern already used for `flow_snapshots`/`overlay_snapshots` elsewhere in `main.py`)
- [X] T010 [P] [US1] Create `src/components/dashboard/ForecastPanel.vue`: horizon selector
      (15 days / 1 month / 3 months — this task wires the 15-day branch only, US2/US3 add their
      branches later), region input (reusing the free-text `region_code` pattern from
      `ContactFormModal.vue`), and a day-by-day chart/table for the selected variable using the
      existing `src/components/ui/chart/*` primitives, reading via the `forecast_snapshots` query
      in `contracts/forecast-read-contract.md`
- [X] T011 [US1] Add the "as of \<GFS cycle time\>" freshness label (FR-007) and the "forecast
      unavailable" empty-state (FR-010) to `ForecastPanel.vue` for the 15-day view, per
      quickstart.md §3 steps 3 and 6
- [X] T012 [US1] Mount `ForecastPanel.vue` in the dashboard overview grid in
      `src/components/DashboardPlaceholder.vue`, alongside the existing `Earthquake*Chart`
      components (same `grid auto-rows-min gap-4 md:grid-cols-3` container, around line 197-205)
- [X] T013 [P] [US1] Add `dashboard.forecast*` i18n keys (panel title, horizon labels, "as of",
      "unavailable", "not configured for this deployment") to all 7 locale files under
      `src/i18n/locales/` (tr, en, es, fr, ru, ar, zh), matching Constitution Principle VI
- [X] T014 [P] [US1] Add `tests/unit/forecastData.test.js` covering the pure data-shaping helpers
      in `ForecastPanel.vue` (e.g. mapping `forecast_step_hours` to display days, freshness-age
      calculation, empty-state detection), matching the existing `tests/unit/windLayerData.test.js`
      convention

**Checkpoint**: User Story 1 fully functional — 15-day forecast ingestion + dashboard display
works end-to-end and is independently demoable (MVP).

---

## Phase 4: User Story 2 - Monthly outlook for near-term planning (Priority: P2)

**Goal**: Admin picks the 1-month horizon and sees a probabilistic (below/near/above-normal)
outlook per region, visually and textually distinguished from the 15-day deterministic view.

**Independent Test**: Run `docker compose run --rm wind-importer --forecast-horizon=1mo --once`,
confirm rows land in `forecast_outlooks` with `horizon='1mo'` (quickstart.md §2), then select the
1-month horizon on the dashboard and confirm the probabilistic summary renders.

### Implementation for User Story 2

- [X] T015 [US2] Create `wind-importer/fetch_cfsv2.py`: fetch the latest CFSv2 monthly-mean
      ensemble GRIB2 fields (precipitation, temperature) from
      `https://nomads.ncep.noaa.gov/pub/data/nccf/com/cfs/prod/` (research.md §2), with the same
      GRIB2-magic-byte validation pattern `fetch_gfs.py`'s `_download()` already uses
- [X] T016 [US2] Create `wind-importer/forecast_outlook.py`: given a fetched CFSv2 field and a
      static climatological reference table (documented per-region/per-month baseline values,
      checked into `wind-importer/` as a small data file), compute the per-region
      `below_normal`/`near_normal`/`above_normal` classification (research.md §3) for a list of
      configured region codes
- [X] T017 [US2] Wire the `--forecast-horizon=1mo` branch in `wind-importer/main.py`: fetch (T015),
      classify per region (T016), and upsert `forecast_outlooks` rows with `horizon='1mo'`
- [X] T018 [US2] Extend `ForecastPanel.vue`'s horizon selector to handle the 1-month branch:
      render the `forecast_outlooks` classification (not a day-by-day chart) with a visibly
      different presentation (e.g. a labeled badge/tercile bar, not a line chart) per FR-008, plus
      the "as of \<CFSv2 issuance\>" freshness label and unavailable/not-configured states
- [X] T019 [P] [US2] Add a short inline explanation ("this is a probabilistic outlook, not a
      day-by-day forecast") to the 1-month view per spec.md User Story 2's acceptance scenario 2,
      through the same i18n keys extended in T013

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Seasonal outlook for resource pre-positioning (Priority: P3)

**Goal**: Admin picks the 3-month horizon and sees a seasonal likelihood classification
(e.g. drought/flood-relevant precipitation outlook) per region, with long-range-uncertainty
caveats.

**Independent Test**: Run `docker compose run --rm wind-importer --forecast-horizon=3mo --once`,
confirm rows land in `forecast_outlooks` with `horizon='3mo'`, then select the 3-month horizon on
the dashboard and confirm the seasonal outlook renders.

### Implementation for User Story 3

- [X] T020 [US3] Extend `fetch_cfsv2.py` (T015) with a `--lead-months=3` seasonal-mean fetch path
      (same NOMADS source, longer lead time per research.md §2)
- [X] T021 [US3] Extend `forecast_outlook.py` (T016) to accept the 3-month seasonal field using
      the same climatological-reference classification approach, reusing the function rather than
      duplicating it
- [X] T022 [US3] Wire the `--forecast-horizon=3mo` branch in `wind-importer/main.py`, mirroring
      T017 with `horizon='3mo'`
- [X] T023 [US3] Extend `ForecastPanel.vue`'s horizon selector to handle the 3-month branch,
      reusing US2's probabilistic-display component (T018) with a seasonal-specific caveat string
      ("long-range guidance for planning purposes, not a prediction of specific events" —
      spec.md's acceptance scenario 2 wording) added via i18n

**Checkpoint**: All three horizons independently functional — full spec.md scope delivered.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T024 [P] Run `quickstart.md` end-to-end (all 5 sections) against a local Supabase +
      `docker compose` stack and record any deviations
- [X] T025 [P] Verify FR-009/FR-010 per-deployment disable behavior for all three horizons
      (`FORECAST_15D_ENABLED`/`FORECAST_1MO_ENABLED`/`FORECAST_3MO_ENABLED=false`) shows the
      correct distinct "not configured" copy, not the generic "unavailable" copy
- [ ] T026 Verify RLS: confirm anon/authenticated roles can `SELECT` but not `INSERT`/`UPDATE`/
      `DELETE` on `forecast_snapshots`/`forecast_outlooks` (matches Constitution Principle V)
- [ ] T027 Update `specs/055-hazard-forecasting-dashboard/checklists/requirements.md`'s Notes with
      final implementation status once all stories are verified

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — migrations can be written and applied immediately
- **Foundational (Phase 2)**: Depends on Setup (tables must exist before the CLI flag/compose
  services that write to them are meaningful to test) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational — delivers the MVP alone
- **User Story 2 (Phase 4)**: Depends on Foundational; T018 depends on `ForecastPanel.vue`
  existing from T010/T012 (US1), but US2's ingestion (T015-T017) is fully independent of US1's
  ingestion and can be built in parallel
- **User Story 3 (Phase 5)**: Depends on Foundational; reuses US2's `fetch_cfsv2.py`/
  `forecast_outlook.py`/probabilistic-display component by extension, not duplication — build
  after US2 for that reason, though it does not block US2's own independent test
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### Parallel Opportunities

- T003/T004 (retention migrations) in parallel once T001/T002 land
- T006 (compose services) in parallel with T005 once both are drafted (T006 just needs T005's
  flag names, not its full implementation)
- T010/T013/T014 (frontend panel skeleton, i18n keys, unit tests) in parallel with T007-T009
  (ingestion) within US1 — different files, no shared dependency until integration
- T024/T025 in parallel during Polish

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and VALIDATE**: run quickstart.md §1 and §3 (15-day only), confirm the dashboard shows a
   real 15-day forecast for at least one region
3. This alone satisfies spec.md's SC-001/SC-002/SC-003 for the 15-day horizon and is demoable/
   deployable on its own — US2/US3 add horizons incrementally without touching US1's code paths

### Incremental Delivery

1. Setup + Foundational → schema and container scaffolding ready
2. US1 → 15-day forecast live → demo/deploy (MVP)
3. US2 → 1-month outlook added → demo/deploy
4. US3 → 3-month outlook added (reuses US2's fetcher/classifier) → demo/deploy
5. Polish → cross-cutting verification, close out spec 055
