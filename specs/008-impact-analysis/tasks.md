# Tasks: Impact Analysis & Exposure Modelling

**Input**: Design documents from `specs/008-impact-analysis/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/impact-analysis.md, quickstart.md

**Context**: Full scope (frontend + PostGIS), greenfield — no exposure/spatial data exists today.

## Phase 1: Setup

- [X] T001 Create migration file `supabase/migrations/20260706170000_impact_analysis.sql` with the standard header comment (purpose, covered FRs), including `CREATE EXTENSION IF NOT EXISTS postgis;`.

## Phase 2: Foundational (blocking prerequisites)

- [X] T002 In the migration, create `exposure_datasets` (id, name, description, metric_property_name, feature_count, country_code, org_id, created_by, created_at) per data-model.md.
- [X] T003 In the migration, create `exposure_features` (id, dataset_id FK CASCADE, geom geometry(Geometry,4326), metric_value, properties JSONB) with a GiST index on `geom`.
- [X] T004 In the migration, create `impact_scenarios` (id, name, hazard_event_snapshot JSONB, exposure_dataset_id FK SET NULL, radius_km_override, result_snapshot JSONB, country_code, org_id, created_by, created_at) per data-model.md.
- [X] T005 In the migration, add RLS policies for all three tables mirroring the existing `cap_drafts`/`org_admin_cap_own`/`country_admin_cap_own` scoping pattern (super_admin all; country_admin own country_code; org_admin own country_code+org_id; viewer no access), with `exposure_features` visibility derived via a join/EXISTS check against its parent `exposure_datasets` row.
- [X] T006 In the migration, create `compute_zonal_stats(dataset_id, center_lat, center_lng, radius_km)` RPC using `ST_DWithin(geom::geography, ST_MakePoint(center_lng,center_lat)::geography, radius_km*1000)` + `SUM(metric_value)`/`COUNT(*)` (research.md §3).
- [X] T007 In the migration, create `get_intersecting_features(dataset_id, center_lat, center_lng, radius_km)` RPC returning per-feature `id, geom_geojson (via ST_AsGeoJSON), metric_value, properties` for GeoJSON export (data-model.md).
- [X] T008 In the migration, add the existing generic `audit_*` trigger (`log_table_change()`) to `exposure_datasets` and `impact_scenarios`, mirroring specs 004/006/007.
- [X] T009 Create `supabase/functions/shared/geojsonValidation.ts` exporting `validateGeojson(geojson, metricPropertyName)` — checks FeatureCollection structure, WGS84 coordinate bounds, absence of a non-default `crs` member, and that `metricPropertyName` is numeric on every feature; returns `{valid:true}` or `{valid:false, error}`.
- [X] T010 [P] Create `supabase/functions/shared/geojsonValidation.test.ts` (Deno) covering: valid FeatureCollection passes; missing/wrong `type` fails; out-of-bounds coordinates fail; non-default `crs` fails; non-numeric metric property fails; empty FeatureCollection fails.
- [X] T011 Create `src/lib/hazardBuffer.js` exporting `defaultBufferRadiusKm(event)` — dispatch by `event.type`: `earthquake` → `2 ** event.magnitude`, all other types → severity lookup table (critical=50, high=25, moderate=10, low=5, minimal=2) (research.md §2).
- [X] T012 [P] Create `tests/unit/hazardBuffer.test.js` (Vitest) covering: earthquake magnitude formula for several magnitudes; each severity level's fallback radius for a non-earthquake type; unknown type still falls back to the severity table.
- [X] T013 [P] Create `src/lib/trendSparkline.js` exporting `classifyTrend(recentCounts)` returning `{direction, points}` (research.md §6).
- [X] T014 [P] Create `tests/unit/trendSparkline.test.js` (Vitest) covering: increasing/decreasing/flat count sequences classify correctly; empty/single-point input handled without error.

**Checkpoint**: Schema, RPCs, RLS, and pure-logic modules are ready — Edge Functions and UI work can begin.

---

## Phase 3: User Story 1 - Upload and manage an exposure dataset (Priority: P1)

**Goal**: An authorized admin can upload a GeoJSON exposure dataset and see/delete it in a list.

**Independent Test**: Upload a valid GeoJSON as org_admin, confirm it lists with correct feature count; upload an invalid file, confirm rejection with nothing stored.

- [X] T015 [US1] Create `supabase/functions/upload-exposure-dataset/index.ts` — resolve caller via `admin.auth.getUser()`, look up profile/role (mirrors `create-user`), reject non-admin roles, call `validateGeojson`, on success insert one `exposure_datasets` row + batched `exposure_features` rows scoped to caller's country_code/org_id, return `{datasetId, featureCount}`.
- [X] T016 [US1] Create `src/components/impact/ExposureDatasetManager.vue` — file picker + name/description/metric-property-name inputs, calls the Edge Function, lists existing datasets (`supabase.from('exposure_datasets').select('*')`), delete button per row.
- [X] T017 [US1] Wire `ExposureDatasetManager.vue` into `src/views/AdminView.vue` as a new tab (or sub-section) gated to org_admin/country_admin/super_admin, consistent with existing tab patterns.

**Checkpoint**: Exposure datasets can be uploaded, listed, and deleted with proper validation and scoping.

---

## Phase 4: User Story 2 - Run a spatial impact query (Priority: P1)

**Goal**: Select a hazard event + exposure dataset, compute and display zonal statistics.

**Independent Test**: Select a known hazard event and dataset, confirm the computed sum is correct; select a non-overlapping combination, confirm a clear zero-overlap message.

- [X] T018 [US2] Create `src/components/impact/ImpactPanel.vue` — step 1: hazard event selector (from the existing disaster store's `allEvents`), step 2: exposure dataset selector, "Run Analysis" button calling `defaultBufferRadiusKm()` (T011) then `supabase.rpc('compute_zonal_stats', {...})`.
- [X] T019 [US2] In `ImpactPanel.vue`, render the result: summed metric value + feature count, or a distinct "no exposure data intersects this area" message when `feature_count === 0`.
- [X] T020 [US2] In `ImpactPanel.vue`, allow overriding the default buffer radius with a manual input, re-running the analysis with the override.

**Checkpoint**: Core zonal-statistics workflow is functional end-to-end.

---

## Phase 5: User Story 3 - Save and reload an impact analysis scenario (Priority: P2)

**Goal**: Save a named hazard+exposure+parameter combination and reload it later.

**Independent Test**: Save a scenario, navigate away, reload it, confirm identical selections/result.

- [X] T021 [US3] In `ImpactPanel.vue`, add "Save Scenario" (name input) inserting into `impact_scenarios` per contracts/impact-analysis.md, including `hazard_event_snapshot` and `result_snapshot`.
- [X] T022 [US3] In `ImpactPanel.vue`, add a saved-scenarios list/selector that loads a scenario via `select('*, exposure_datasets(id,name)')`, restoring hazard/dataset/radius selections, and showing "referenced data no longer available" when the joined `exposure_datasets` is null (FK went SET NULL).

**Checkpoint**: Scenarios can be saved and faithfully reloaded, including the deleted-dataset edge case.

---

## Phase 6: User Story 4 - Split-view map with a detail panel (Priority: P2)

**Goal**: Persistent side panel showing selected event details + impact workflow, map stays visible.

**Independent Test**: Click a hazard event, confirm details appear in a persistent panel (not a popup covering the map); selecting another event updates the panel live.

- [X] T023 [US4] In `src/components/MapView.vue`, add a `selectedEvent` ref set on marker/hex click, and mount `ImpactPanel.vue` as a persistent side panel (CSS layout alongside the map canvas, not an overlay popup) bound to `selectedEvent`.
- [X] T024 [US4] In `MapView.vue`, ensure existing popup-based interactions still work for map exploration, while the impact-analysis-specific workflow (Stories 1-3) lives in the new side panel exclusively.

**Checkpoint**: Split-view is live; impact analysis has a persistent home alongside the map.

---

## Phase 7: User Story 5 - Geocoding search (Priority: P2)

**Goal**: Search box recenters the map to a matched location.

**Independent Test**: Search a known place, confirm recenter; search nonsense, confirm "no results".

- [X] T025 [US5] Create `supabase/functions/geocode-search/index.ts` — proxies `query` to a per-deployment-configured endpoint (`GEOCODING_API_URL`/`GEOCODING_API_KEY` secrets), returns normalized `{results:[{lat,lng,label}]}`.
- [X] T026 [US5] Create `src/components/impact/GeocodingSearch.vue` — input + submit calling the Edge Function, emits a `location-selected` event with `{lat,lng}`; shows a "no results" state for an empty result array.
- [X] T027 [US5] In `MapView.vue`, mount `GeocodingSearch.vue` and recenter/zoom the MapLibre instance on `location-selected`.

**Checkpoint**: Geocoding search is functional with a clear no-results state.

---

## Phase 8: User Story 6 - Export impact analysis results (Priority: P3)

**Goal**: Export a completed analysis as CSV, JSON, or GeoJSON.

**Independent Test**: Run an analysis, export all three formats, confirm each matches the on-screen result.

- [X] T028 [US6] In `ImpactPanel.vue`, add CSV/JSON export buttons reusing `rowsToCsv`/`rowsToJson`/`triggerDownload` from `src/lib/auditExport.js` (spec 007 — generic enough to reuse for this summary-row export) for the summary statistics.
- [X] T029 [US6] In `ImpactPanel.vue`, add a GeoJSON export button calling `supabase.rpc('get_intersecting_features', {...})` (T007) and reassembling a FeatureCollection client-side from the returned `geom_geojson`/`metric_value`/`properties` rows, then downloading via `triggerDownload`.

**Checkpoint**: All three export formats work and match the on-screen result.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T030 [P] Add an `impact` i18n key block to `src/i18n/locales/tr.json` covering all new UI text (exposure manager, 2-step workflow, results/no-overlap state, scenario save/load, split-view panel labels, geocoding search, sparkline, export buttons).
- [X] T031 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/en.json`.
- [X] T032 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/es.json`.
- [X] T033 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/fr.json`.
- [X] T034 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/ru.json`.
- [X] T035 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/ar.json`.
- [X] T036 [P] Add the same `impact` i18n key block (translated) to `src/i18n/locales/zh.json`.
- [X] T037 Wire all new component text through `t('impact....')` using the new keys from T030-T036.
- [X] T038 Run `npm run test` and `deno test --no-check --allow-net --allow-env supabase/functions/shared/` and confirm zero regressions across all suites.
- [X] T039 Kod seviyesinde doğrulandı (2026-07-15): PostGIS + ilgili migration production'da uygulanmış olduğu REST API ile doğrulandı (`exposure_datasets` sorgulanabiliyor). Tarayıcıda elle click-through (10 senaryo) kullanıcıya bırakıldı.
- [X] T040 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: mark spec 008 complete, set the "Impact Analysis (Map Viz)" row's completion percentage, note what remains out of scope (Shapefile upload, weighted vulnerability/risk indices, forecast-integrated impact — Assumptions), and update the TOPLAM row.

## Dependencies

- Phase 1→2 blocks all user stories (schema/RPCs/pure-logic modules).
- US1 (Phase 3) and US2 (Phase 4) are both P1 and sequential in practice (US2 needs at least one dataset from US1 to be useful), though technically independent to build.
- US3 (Phase 5) depends on US2's `ImpactPanel.vue` shell existing.
- US4 (Phase 6) depends on `ImpactPanel.vue` existing (T018) to have something to mount as the side panel.
- US5 (Phase 7) is independent of US1-US4 beyond sharing `MapView.vue` — can be built in parallel.
- US6 (Phase 8) depends on US2's result state (T019) and US4's panel (for a UI home for export buttons).
- Phase 9 (Polish) depends on all prior phases for complete i18n coverage.

## Parallel Execution Examples

- T010, T012, T014 (test files) can each run in parallel with their sibling implementation task's follow-on work once T009/T011/T013 land respectively.
- T030-T036 (7 locale files) are fully parallelizable.
- US5 (geocoding, Phase 7) can be built in parallel with US1-US4 by a different contributor once Phase 2 is done.

## Implementation Strategy

**MVP scope**: Phase 1 + Phase 2 + Phase 3 (US1) + Phase 4 (US2) — upload an exposure dataset and
compute zonal statistics against a selected hazard event. This is the module's core analytical
value; Stories 3-6 (scenarios, split-view, geocoding, export) are valuable, independently
deferrable increments on top of it.
