# Quickstart: Validating Cascading Hazard Risk

Prerequisites: spec 039 (Risk & Scenario Modeling) live — reuses `risk_indicators`/
`compute_risk_category_score`/`hazard_event_history_view`/`hazard_scenarios` unmodified. Requires one new
migration (data-model.md): `cascade_rules`, `cascading_risk_assessments`, `save_cascade_rule`,
`evaluate_cascade_rules`. A country with at least one real HydroRIVERS/HydroBASINS `exposure_datasets`
row (spec 041) makes the proximity example fully testable end-to-end; without it, step 2's proximity
rule is expected to show as `not_evaluable`, which is itself a pass, not a failure.

## 1. Configure a proximity-based cascade rule (US1)

- Create a rule: `trigger_hazard_type: "earthquake"`, `min_magnitude: 6.0`,
  `proximity_exposure_source_name: "hydrorivers"`, `proximity_distance_km: 15`,
  `secondary_risk_category: "secondary_flood_risk"`, a recommendation template with `[[area]]`,
  `[[magnitude]]`, `[[distance_km]]`, `[[affected_population]]` placeholders.
- Expected: saves successfully; a second attempt omitting every condition column (no magnitude, no
  proximity, no vulnerability threshold) is rejected with a clear validation message (data-model.md §1
  CHECK), not a raw constraint error.
- As a country_admin for a different country, confirm this rule is not visible (RLS).

## 2. Configure a vulnerability-based cascade rule (US1)

- Create a second rule: `trigger_hazard_type: "any"`, `min_vulnerability_score: 6.0`,
  `secondary_risk_category: "building_collapse_risk"`.
- Expected: saves successfully alongside the first rule.

## 3. Evaluate cascades for a real qualifying event (US2)

- Call `evaluate_cascade_rules` for a real earthquake event whose magnitude and location satisfy rule 1
  (within 15km of an actually-imported HydroRIVERS feature for that country) and whose area has a
  Vulnerability score ≥ 6.0 configured (spec 039 US1).
- Expected: `triggered` contains two assessments (one per rule), each with the correct
  `input_values`/`affected_population`/rendered `recommendation_text`, and a `rule_id` traceable back to
  the exact rule (FR-003 acceptance scenario 4).
- Repeat for an area with no Vulnerability indicators configured at all: expect rule 2 to appear in
  `not_evaluable` with `"no vulnerability indicators configured for this area"`, not silently omitted or
  falsely triggered (FR-006).
- Repeat for a real event that meets neither rule's thresholds: expect `triggered: []`,
  `not_evaluable: []`, and the dashboard showing the explicit "no secondary risk triggered" state
  (FR-007), not a blank panel.

## 4. Evaluate cascades for a hypothetical scenario (US3)

- Using spec 039's scenario builder, define a hypothetical M4.7 earthquake at a location matching rule 1's
  proximity condition but below its `min_magnitude: 6.0` threshold.
- Call cascade evaluation for that saved scenario (`source_type: "hypothetical_scenario"`).
- Expected: `triggered: []` (magnitude condition not met) with the result visibly labeled as based on a
  simulated scenario, not a live assessment — confirming "if X happened today" correctly reflects the
  configured thresholds rather than always firing.
- Repeat with a hypothetical M6.5 at the same location: expect rule 1 to trigger, with
  `recommendation_text` rendered identically to how a real M6.5 event at that location would render it
  (US3 acceptance scenario 1 — same answer, hypothetical or real).

## 5. Verify historical assessments survive rule edits (FR-010)

- After step 3 produces at least one triggered assessment, edit that rule's `min_magnitude` threshold.
- Expected: the previously-created `cascading_risk_assessments` row is unchanged (`rule_config_snapshot`
  still shows the old threshold) — re-running `evaluate_cascade_rules` for the same event now uses the
  new threshold for any *new* evaluation, but does not rewrite the old row.

## 6. Verify country isolation (FR-009)

- As a country_admin for country A, attempt to read/write country B's `cascade_rules` and
  `cascading_risk_assessments` rows directly.
- Expected: RLS denies both, identical to the existing `risk_indicators`/`risk_area_scores` pattern
  (spec 039).

## 7. Run regression checks

```bash
npm run test
npm run build
```
No new pure-logic module is introduced in this spec (research.md — the only new logic is SQL inside
RPCs, verified live above per this repo's documented convention), so no new Deno unit test file is
expected; this step confirms no existing test/build regressed.
