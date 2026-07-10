# Quickstart: Validating Risk & Scenario Modeling

Prerequisites: specs 008 (Impact Analysis) and 034 (Impact Analysis Gaps) live — reuses
`exposure_datasets`/`exposure_features` (including `admin_boundary_code`, spec 034) unmodified. Requires
one new migration (data-model.md): `risk_indicators`, `risk_area_scores`, `hazard_scenarios`,
`hazard_event_history_view`.

## 1. Configure Vulnerability/Coping Capacity indicators for a country (US1)

- Upload two GeoJSON exposure datasets via the existing spec 008 upload path (e.g., a poverty-rate layer
  and a health-access layer), each with `admin_boundary_code` set per feature (spec 034 convention).
- Call `save_risk_indicator` for each: tag one `vulnerability` weight `1.0`, the other `coping_capacity`
  weight `1.0` (single indicator per category for this smoke test).
- Expected: both save successfully; a third attempt with a category weight that doesn't sum to 1.0 is
  rejected with a specific validation message (FR-002).

## 2. View a composite risk score (US2)

- Call `compute_risk_area_score` for an administrative area covered by both indicators above and by
  existing hazard/exposure data.
- Expected: response includes all four factor scores (0-10) and a non-null `composite_score`.
- Repeat for an area with no configured exposure dataset: expect `exposure_score: null` and
  `composite_score: null` with `missing_factors: ["exposure"]` (FR-007) — not a silently-low score.

## 3. Simulate a hypothetical earthquake scenario (US3)

- Call `simulate-hazard-scenario` with `hazard_type: "earthquake"`, a known magnitude and epicenter, and
  the exposure dataset ID from step 1.
- Expected: `footprint_geojson` radius matches `src/lib/hazardBuffer.js`'s existing magnitude-derived
  formula for the same magnitude (same formula, reused server-side per research.md §5); `estimated_impact`
  matches a manual `ST_DWithin` sum for that radius against the same dataset.
- Call with `hazard_type: "cyclone"` (no formula yet, FR-010): expect the `no_formula_available` response,
  not a fabricated result.
- Save the scenario, reload it, confirm identical inputs/outputs (FR-011).

## 4. Verify a probabilistic exceedance curve (US4)

- Pick an area/hazard_type with ≥ the minimum historical record threshold (data-model.md §6); call
  `compute-risk-exceedance-curve` twice with the same seed.
- Expected: both calls return an identical curve (reproducibility, research.md §6) plus the
  `historical_record_count` used.
- Repeat for an area/hazard_type below the threshold: expect `insufficient_historical_data`, not a curve
  built from too few points (FR-013).

## 5. Verify country isolation (FR-014, SC-002)

- As a country_admin for country A, attempt to read/write country B's `risk_indicators` and
  `risk_area_scores` rows directly.
- Expected: RLS denies both, identical to the existing `exposure_datasets` country-scoping pattern.

## 6. Run automated tests

```bash
deno test --no-check --allow-net --allow-env supabase/functions/shared/
```
Covers: composite-score combination logic, weight-sum validation, the earthquake footprint formula
(shared/pure logic only — matches this repo's existing convention of testing pure functions, not
DB-touching RPCs, per spec 038's documented testing-convention finding).
