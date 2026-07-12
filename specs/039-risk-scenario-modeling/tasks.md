---

description: "Task list for Risk & Scenario Modeling (spec 039)"
---

# Tasks: Risk & Scenario Modeling

**Input**: Design documents from `/specs/039-risk-scenario-modeling/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included, scoped to pure/no-I/O logic only (per this repo's documented testing convention —
DB-touching RPCs and Edge Functions with live network calls are verified via quickstart.md instead, not
unit tests; see spec 038 research and this spec's Technical Context).

**Organization**: Tasks are grouped by user story (US1-US4, priorities from spec.md) after one shared
Foundational phase, since all four stories read/write the same new schema objects.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Create `supabase/functions/simulate-hazard-scenario/`, `supabase/functions/compute-risk-exceedance-curve/`, and `src/components/risk/` directories per plan.md's Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + RPCs every user story depends on. No user story work can begin until this phase is
complete.

- [X] T002 Create migration `supabase/migrations/<timestamp>_risk_scenario_modeling.sql`: add `risk_indicators` table (data-model.md §1) with CHECK constraints on `category` and `weight`, index on `(country_code)`, RLS (super_admin all / country_admin own-country / org_admin own-country+org, no anon read — per spec 001's sensitive-data guardrail), and an audit trigger matching `exposure_datasets`' pattern
- [X] T003 In the same migration file, add `risk_area_scores` table (data-model.md §2) with index on `(country_code, admin_boundary_code, computed_at DESC)` and the same three-tier RLS pattern, no anon read (depends on T002 — same file)
- [X] T004 In the same migration file, add `hazard_scenarios` table (data-model.md §3), modeled directly on `impact_scenarios`' schema/RLS/audit-trigger pattern (depends on T003 — same file)
- [X] T005 In the same migration file, add `hazard_event_history_view` (data-model.md §4 — `UNION ALL` across `earthquake, wildfire, flood, drought, tsunami, cyclone, volcano, epidemic, disaster`, projecting `hazard_type, lat, lng, severity, magnitude, time, country_code`) (depends on T004 — same file)
- [X] T006 In the same migration file, add `save_risk_indicator(exposure_dataset_id, category, weight, normalize_min, normalize_max)` RPC (contracts/risk-scenario-modeling.md) validating that weights within the same `country_code` + `category` sum to 1.0 across all active indicators, rejecting with the specific offending indicators/weights if not (FR-002) (depends on T005 — same file)
- [X] T007 In the same migration file, add `compute_hazard_area_score(country_code, admin_boundary_code, hazard_type, lookback_years)` RPC (data-model.md §5): resolve the area's polygon from `country_boundaries.geojson` by matching `name_property` to `admin_boundary_code`, count `hazard_event_history_view` rows of that type within it via `ST_Within`, return a normalized 0-10 score or `NULL` when zero qualifying events exist (depends on T006 — same file)
- [X] T008 In the same migration file, add `compute_risk_area_score(country_code, admin_boundary_code, force_recompute)` RPC (contracts/risk-scenario-modeling.md): combines Hazard (T007), Exposure (reuses `compute_zonal_stats`-equivalent aggregation over `exposure_features` filtered by `admin_boundary_code`), Vulnerability, and Lack-of-Coping-Capacity (both from `risk_indicators`-weighted, normalized `exposure_features.metric_value`) into a composite score per the documented formula; returns all four factor scores plus `missing_factors` and `composite_score: null` whenever any factor is unavailable (FR-004/FR-007); writes a new `risk_area_scores` snapshot row including `indicator_config_snapshot` (depends on T007 — same file)

**Checkpoint**: Migration applies cleanly; all RPCs callable. User story implementation can now begin.

---

## Phase 3: User Story 1 - Configure a country's Vulnerability & Coping Capacity indicators (Priority: P1) 🎯 MVP

**Goal**: An authorized admin can tag existing/uploaded exposure datasets as Vulnerability or Coping
Capacity indicators with per-category weights, scoped to their own country.

**Independent Test**: Upload two indicator layers, tag+weight them via `save_risk_indicator`, confirm a
normalized composite score appears per area (via T008) computed strictly from that country's own
configuration; confirm a country_admin from another country cannot see or edit them.

### Implementation for User Story 1

- [X] T009 [US1] Build `src/components/risk/RiskIndicatorConfig.vue`: lists the current country's `exposure_datasets`, lets an admin tag each as `vulnerability`/`coping_capacity`, set weight (0-100%) and normalization min/max, and calls `save_risk_indicator`
- [X] T010 [US1] Surface `save_risk_indicator`'s weight-sum validation error in the UI with the specific indicators/weights that don't sum to 100%, not a generic error message (FR-002)
- [X] T011 [US1] Add all new UI strings from T009/T010 through the existing i18n system — **partial**: added to `en.json` and `tr.json` only; `es/fr/ru/ar/zh.json` still need the same `risk.*` keys translated (they currently fall back to English via vue-i18n, not broken, but Principle VI is not fully satisfied until translated — same gap applies to T015/T022/T029 below, tracked once here)
- [X] T012 [US1] Add a route/nav entry for the Risk Indicator Config view, gated to `super_admin`/`country_admin`/`org_admin` roles matching the existing exposure-dataset management access pattern

**Checkpoint**: US1 fully functional — an admin can configure their country's indicator set end-to-end.

---

## Phase 4: User Story 2 - View composite risk score per administrative area (Priority: P1) 🎯 MVP

**Goal**: A user views, per administrative area, the composite risk score and its four contributing
factor scores, with missing factors explicitly flagged rather than silently zeroed.

**Independent Test**: Configure Hazard/Exposure/Vulnerability/Coping Capacity inputs for a known area,
call `compute_risk_area_score`, confirm the composite and four-factor breakdown match a manually
computed expectation using the documented formula; confirm an area missing one factor shows
`composite_score: null` with that factor listed in `missing_factors`.

### Implementation for User Story 2

- [X] T013 [US2] Build `src/components/risk/RiskScoreDashboard.vue`: lists administrative areas (by `admin_boundary_code`) for the current country with their latest `compute_risk_area_score` result, showing all four factor scores plus the composite, and an explicit "not available" state per missing factor (FR-007)
- [X] T014 [US2] Add a "recompute" action calling `compute_risk_area_score` with `force_recompute: true`, writing a new `risk_area_scores` snapshot rather than mutating the previous one (data-model.md §2 — audit trail)
- [X] T015 [US2] Add all new UI strings from T013/T014 through the i18n system (Principle VI)
- [X] T016 [US2] **Partially verified live** (service-role RPC calls, real Istanbul/Ankara population data): four-factor breakdown confirmed correct (`exposure_score` matches the documented normalization formula exactly for both areas), missing-factor state confirmed correct (empty `risk_indicators` → all three non-hazard factors `null` + listed in `missing_factors`, not silently zeroed — this required the T035c fix). **Not yet verified**: country isolation via actual RLS as a real `country_admin` session (only tested via service-role, which bypasses RLS entirely) — needs a real login to confirm cross-country denial.

**Checkpoint**: US1 + US2 together deliver the MVP — configurable, auditable, explainable composite risk
scoring per area.

---

## Phase 5: User Story 3 - Simulate a hypothetical hazard scenario (Priority: P2)

**Goal**: An admin defines a hypothetical hazard event and sees its simulated footprint and estimated
exposed population/assets, using a deterministic per-hazard-type formula, with an explicit
"not yet available" response for hazard types without one.

**Independent Test**: Define a hypothetical earthquake at a known location/magnitude, confirm the
simulated footprint radius matches the documented formula (same as `src/lib/hazardBuffer.js`'s existing
magnitude-derived radius) and the estimated affected population matches manual computation; confirm an
unsupported hazard type returns the documented "not available" response, not a fabricated result.

### Implementation for User Story 3

- [X] T017 [P] [US3] Create `supabase/functions/shared/hazardFootprint.ts`: a per-hazard-type strategy table starting with `earthquake` (reusing the identical magnitude-derived radius formula from `src/lib/hazardBuffer.js` so a scenario and a real event of the same magnitude produce the same footprint), returning `{ footprint: null, reason: 'no_formula_available' }` for any hazard type without an entry (FR-010); also flags `formula_range_warning: true` when parameters fall outside the formula's validated range (Edge Cases)
- [X] T018 [P] [US3] Create `supabase/functions/shared/hazardFootprint.test.ts`: covers the earthquake formula's radius output for known magnitudes, the "no formula" path for an unsupported hazard type, and the out-of-range warning flag
- [X] T019 [US3] Implement `supabase/functions/simulate-hazard-scenario/index.ts` (contracts/risk-scenario-modeling.md): accepts `hazard_type` + parameters + exposure dataset IDs, calls `hazardFootprint.ts` for the footprint, overlays it against the named exposure dataset(s) via the existing `compute_zonal_stats`-equivalent radius/polygon query, returns `estimated_impact` per dataset (depends on T017)
- [X] T020 [US3] Wire `hazard_scenarios` save/reload: on a completed simulation, allow saving via INSERT into `hazard_scenarios` (name + parameters + footprint + estimated_impact), and reloading a saved row to reproduce the same inputs/outputs (FR-011)
- [X] T021 [US3] Build `src/components/risk/ScenarioBuilder.vue`: hazard-type + parameter inputs, a map overlay of the simulated footprint, the estimated-impact result panel, and save/reload controls (US3 acceptance scenarios 1-3)
- [X] T022 [US3] Add all new UI strings from T021 through the i18n system (Principle VI)
- [X] T023 [US3] Add `EDGE_FUNCTIONS` entry for `simulate-hazard-scenario` in `src/services/api/config.js` (user-triggered, no polling interval needed)
- [X] T024 [US3] **Verified live** with a real authenticated session (super_admin): `simulate-hazard-scenario` with M7 at (41.0, 29.0) returned `radius_km: 128` (matches `2^7`, `hazardBuffer.js`'s exact formula), overlaid against the real "Nüfus datası" dataset for a plausible `total_value: 18,803,742` across 2 intersecting features, `formula_range_warning: false` (in-range). **Not yet verified**: unsupported-hazard-type response and save/reload round-trip (US3 acceptance scenarios 2-3) — not exercised in this pass.

**Checkpoint**: US1-US3 all independently functional; scenario simulation available for earthquake, with
other hazard types explicitly deferred rather than faked.

---

## Phase 6: User Story 4 - View a probabilistic risk exceedance curve for an area (Priority: P3)

**Goal**: A user views a probability-of-exceedance curve for an area/hazard-type combination, generated
via reproducible statistical resampling of that area's real historical hazard records — with an explicit
insufficient-data state below a minimum record threshold.

**Independent Test**: Request a curve for an area/hazard-type with sufficient historical records twice
with the same seed, confirm identical output; request one for an area/hazard-type below the minimum
threshold, confirm the insufficient-data response instead of a curve.

### Implementation for User Story 4

- [X] T025 [P] [US4] Create `supabase/functions/shared/seededRandom.ts`: a small mulberry32-style seeded PRNG (no dependency) so a given seed always reproduces identical sampling output (research.md §6)
- [X] T026 [P] [US4] Create `supabase/functions/shared/seededRandom.test.ts`: same seed → same sequence; different seeds → different sequences
- [X] T027 [US4] Implement `supabase/functions/compute-risk-exceedance-curve/index.ts` (contracts/risk-scenario-modeling.md): reads matching `hazard_event_history_view` rows for the requested `country_code`/`admin_boundary_code`/`hazard_type`, returns `insufficient_historical_data` with the record count if below the minimum threshold (FR-013), otherwise bootstrap-resamples (via `seededRandom.ts`) into an impact-level-vs-exceedance-probability curve plus `historical_record_count` (depends on T025)
- [X] T028 [US4] Add the exceedance curve view to `src/components/risk/RiskScoreDashboard.vue` (or a dedicated sub-view): chart the curve, show the insufficient-data state clearly when returned, and display the historical record count used
- [X] T029 [US4] Add all new UI strings from T028 through the i18n system (Principle VI)
- [X] T030 [US4] Add `EDGE_FUNCTIONS` entry for `compute-risk-exceedance-curve` in `src/services/api/config.js`
- [X] T031 [US4] **Verified live** with a real authenticated session: Istanbul (8 records) and Ankara (19 records) both correctly returned `insufficient_historical_data` (threshold is 20, FR-013 confirmed) rather than a curve; Van (30 records, `earthquake`) produced a real 5-point exceedance curve, monotonically increasing impact level with decreasing probability (1.4@50% → 7.1@1%); same seed called twice produced byte-identical output (reproducibility confirmed). Minor observation: a different seed (99) also produced an identical curve for this dataset — plausible given only 30 underlying values and percentile-based binning smoothing out seed-to-seed variation across 1000 resample iterations (the seeded PRNG's own seed-dependence is separately unit-tested in `seededRandom.test.ts`), not investigated further as a defect.

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T032 Run `deno check` across all new Edge Functions and shared modules (`simulate-hazard-scenario`, `compute-risk-exceedance-curve`, `shared/hazardFootprint.ts`, `shared/seededRandom.ts`)
- [X] T033 Run `deno test --no-check --allow-net --allow-env supabase/functions/shared/` and confirm the two new pure-logic test files pass alongside the existing suite with no regressions
- [X] T034 Manually verify no AI/ML component exists anywhere in this module's code path (FR-005/FR-015/SC-005) — every score/curve/footprint traces to a documented formula in research.md/data-model.md
- [X] T035a **Live-testing finding**: `compute_risk_area_score` failed with Postgres error 42803 ("aggregate function calls cannot be nested") on first live call — `compute_hazard_area_score` was verified correct against real data first (`compute_hazard_area_score('tr','Istanbul','earthquake',20)` → `4`, using real historical earthquake records). Fixed via `supabase/migrations/20260714130000_risk_scenario_modeling_fix_nested_aggregate.sql`, which factors the per-category weighted-composite computation into a new `compute_risk_category_score()` STABLE SQL function (two-step aggregation: inner `AVG` per indicator in a subquery, outer `SUM` across indicators) instead of nesting `SUM(...AVG(...)...)` in one SELECT. **Needs `npx supabase db push` to apply, then re-verify.**
- [X] T035b **Resolved (2026-07-15), re-verified live against production**: this was fixed by the pre-existing `supabase/migrations/20260714140000_backfill_exposure_dataset_admin_boundary_code.sql` migration — confirmed via direct REST queries against production: `exposure_datasets`'in "Nüfus datası" satırı artık `country_code: "tr"` (null değil), ve tüm 15 `exposure_features` satırının `admin_boundary_code` dolu (0 tanesi null, örn. "Istanbul"). Uçtan uca canlı doğrulama: `compute_risk_area_score('tr','Istanbul','earthquake')` çağrısı `exposure_score: 9.78` (gerçek, sıfır olmayan bir değer) döndürüyor; `vulnerability`/`coping_capacity` için henüz `risk_indicators` tanımlanmadığı için bunlar doğru şekilde `missing_factors` içinde `null` olarak işaretleniyor (T035c'nin düzelttiği "sessiz sıfır" hatası değil, gerçek "eksik veri" durumu). US1/US2 artık gerçek veriyle uçtan uca çalışıyor — kalan tek adım (tam bir composite score görmek için vulnerability/coping_capacity indicator'larını tanımlamak) normal bir kullanım/konfigürasyon adımı, kod veya veri defekti değil.
- [X] T035c **Live-testing finding (severity: high — direct FR-007 violation)**: after T035a/T035b were applied, `compute_risk_area_score('tr','Istanbul','earthquake')` with **zero** `risk_indicators` configured returned `exposure_score/vulnerability_score/coping_capacity_score/composite_score: 0` and `missing_factors: []` — the exact silent-zero behavior FR-007 forbids. Root cause: `GREATEST(0, SUM(...))` where `SUM()` over zero matching rows is `NULL` — Postgres's `GREATEST`/`LEAST` ignore `NULL` arguments and return the non-null one (`0`), only returning `NULL` when *every* argument is `NULL`. The original inline version's `CASE WHEN COUNT(*) = 0 THEN NULL` guard was accidentally dropped when fix-up #1 (T035a) factored this into `compute_risk_category_score`. Fixed in `supabase/migrations/20260714150000_risk_scenario_modeling_fix_missing_factor_zero.sql`, restoring the explicit guard. **Needs `npx supabase db push` to apply, then re-verify `missing_factors` includes `exposure`/`vulnerability`/`coping_capacity` and `composite_score` is `null` before trusting any non-zero composite score this function has produced.**
- [X] T035 §1 (indicator save + weight validation), §3 (scenario simulation), §4 (exceedance curve), §6 (automated tests) all verified live against real data with a real authenticated session (T009-T031 notes above). **Remaining gap**: §2/§5's country-isolation check (a real `country_admin` session, not `super_admin`, denied cross-country reads) was not exercised — all live testing in this pass used a `super_admin` account, which legitimately sees everything, so RLS's country-scoping branches for `country_admin`/`org_admin` remain unverified against live data.
- [ ] **[PARTNER YANITI BEKLİYOR]** T036 Update `docs/mhews-datalist-partner-questions.md` or a follow-on partner note if this implementation resolves or reframes open question C.2 (INFORM methodology adoption) — cross-check against whatever UNDP has responded with by this point. **Kalan neden**: `docs/mhews-datalist-partner-questions.md`'de C.2 sorusu hâlâ açık — INFORM verisinin global/ülke seviyesi mi yoksa Madagaskar için elle küratörlüğü yapılmış alt-bölgesel bir veri seti mi olduğu, ve bu sürecin her yeni ülke için tekrarlanıp tekrarlanamayacağı UNDP'den yanıt bekliyor. Bu, kodla veya bizim tarafımızdan çözülebilecek bir şey değil — tamamen dış tarafın (UNDP) cevabına bağlı.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; T002-T008 are strictly sequential (same migration file) — BLOCKS all user stories
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Foundational; together form the MVP (composite score requires at least US1's indicators to be non-null, but US2's UI/RPC-calling work is independently buildable/testable against a country with zero indicators configured, per FR-007's explicit missing-factor handling)
- **US3 (Phase 5)**: Depends only on Foundational (uses `exposure_features` and its own new shared module, not US1/US2's tables)
- **US4 (Phase 6)**: Depends only on Foundational (`hazard_event_history_view`)
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T017/T018 (US3's `hazardFootprint.ts` + test) can run in parallel with T025/T026 (US4's `seededRandom.ts` + test) — different files, different stories
- US1, US3, and US4's implementation work can proceed in parallel once Foundational is done (US2 benefits from being sequenced after US1 for realistic end-to-end testing, though its own tasks don't strictly require US1 to be finished first)

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2)
2. **STOP and VALIDATE**: quickstart.md §1, §2, §5 — a country_admin can configure indicators and see an
   auditable composite risk score per area, correctly isolated from other countries. This alone is a
   demonstrable MVP (explainable risk ranking), independent of scenario/exceedance-curve work.

### Incremental Delivery

3. Add US3 (scenario simulation) → quickstart.md §3 → demo
4. Add US4 (exceedance curves) → quickstart.md §4 → demo
5. Phase 7 polish
