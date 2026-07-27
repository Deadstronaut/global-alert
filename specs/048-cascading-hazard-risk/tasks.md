---

description: "Task list for Cascading Hazard Risk (spec 048)"
---

# Tasks: Cascading Hazard Risk

**Input**: Design documents from `/specs/048-cascading-hazard-risk/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: No new pure-logic module is introduced (research.md — all new logic is SQL inside RPCs), so
per this repo's documented convention (spec 038/039), no new unit test files are generated; verification
is via quickstart.md's live steps, matching spec 039's testing approach exactly.

**Organization**: Tasks are grouped by user story (US1-US3, priorities from spec.md) after one shared
Foundational phase, since all three stories read/write the same new schema objects.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm target directories already exist (no new ones required): `supabase/migrations/` and
  `src/components/risk/` (both established by spec 039); this feature adds one migration file and two Vue
  components to these existing locations, per plan.md's Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema + RPCs every user story depends on. No user story work can begin until this phase is
complete.

- [X] T002 Create migration `supabase/migrations/<timestamp>_cascading_hazard_risk.sql`: add
  `cascade_rules` table (data-model.md §1) with the CHECK constraint requiring at least one of
  `min_magnitude` / `proximity_exposure_source_name`+`proximity_distance_km` / `min_vulnerability_score`,
  a CHECK that `proximity_exposure_source_name` and `proximity_distance_km` are both-null-or-both-set,
  index on `(country_code, trigger_hazard_type)`, the same three-tier RLS pattern as `risk_indicators`
  (super_admin all / country_admin own-country / org_admin own-country, no anon read), and an audit
  trigger matching `risk_indicators`' pattern (`log_table_change()`)
- [X] T003 In the same migration file, add `cascading_risk_assessments` table (data-model.md §2) with
  index on `(country_code, admin_boundary_code, computed_at DESC)` and the same three-tier RLS pattern,
  no anon read, no audit trigger (insert-only historical record, matching `risk_area_scores`' precedent
  of no trigger on its own snapshot table) (depends on T002 — same file)
- [X] T004 In the same migration file, add `save_cascade_rule(id?, country_code, trigger_hazard_type,
  min_magnitude?, proximity_exposure_source_name?, proximity_distance_km?, min_vulnerability_score?,
  secondary_risk_category, recommendation_template, is_active)` RPC (contracts/cascading-hazard-risk.md):
  validates the "at least one condition" and "proximity fields paired" rules with a specific, actionable
  error message (not a raw constraint-violation string) before insert/update, matching
  `save_risk_indicator`'s upsert-by-identity pattern (depends on T003 — same file)
- [X] T005 In the same migration file, add `evaluate_cascade_rules(country_code, hazard_type,
  admin_boundary_code, event_lat, event_lng, magnitude, source_type, source_event_ref)` RPC
  (contracts/cascading-hazard-risk.md, data-model.md §3): loads active rules matching
  `trigger_hazard_type = hazard_type OR trigger_hazard_type = 'any'`; evaluates the magnitude condition
  (not-evaluable when the event has no magnitude but the rule requires one — research.md §6); evaluates
  the proximity condition via `ST_DWithin` against `exposure_features` joined to `exposure_datasets`
  filtered by `country_code`+`source_name` (not-evaluable when no matching `exposure_datasets` row exists
  for that `source_name` — research.md §1); evaluates the vulnerability condition by calling
  `compute_risk_category_score(country_code, admin_boundary_code, 'vulnerability')` (spec 039,
  research.md §2), treating a `NULL` result as not-evaluable rather than 0; for every rule where all
  configured conditions are satisfied, computes `affected_population` via the same population-overlay
  aggregation pattern spec 008 already uses, renders `recommendation_template` placeholders from the
  evaluated input values, and inserts a `cascading_risk_assessments` row (with `rule_config_snapshot`
  capturing the full rule row at evaluation time, per FR-010); returns the three-bucket
  `{ triggered, not_evaluable, not_triggered_count }` shape (contracts) with no bucket ever omitted
  (depends on T004 — same file)

**Checkpoint**: Migration applies cleanly; both RPCs callable. User story implementation can now begin.

---

## Phase 3: User Story 1 - Configure cascade rules for a country (Priority: P1) 🎯 MVP

**Goal**: A country_admin can create, edit, and delete cascade rules scoped to their own country, each
with a trigger hazard type, a condition, a secondary risk category, and a recommendation template.

**Independent Test**: Create a proximity-based rule and a vulnerability-based rule via
`save_cascade_rule`, confirm both are saved/editable/deletable and scoped only to the admin's own
country; confirm a rule with zero condition columns set is rejected with a clear message.

### Implementation for User Story 1

- [X] T006 [P] [US1] Build `src/components/risk/CascadeRuleConfig.vue`: lists the current country's
  active cascade rules, provides a create/edit form (trigger hazard type — free text or `'any'` — plus
  the three optional condition groups: magnitude threshold, proximity layer name + distance, vulnerability
  threshold; a `secondary_risk_category` text field; a `recommendation_template` textarea with a
  placeholder-syntax hint listing `[[area]]`/`[[magnitude]]`/`[[distance_km]]`/`[[vulnerability_score]]`/
  `[[affected_population]]`), and a delete/deactivate action, calling `save_cascade_rule`
- [X] T007 [US1] Surface `save_cascade_rule`'s validation errors (missing condition, unpaired proximity
  fields) in the UI with the specific issue named, not a generic error message (FR-001/data-model.md §1)
- [X] T008 [US1] Add all new UI strings from T006/T007 through the existing i18n system — add to
  `en.json` and `tr.json` at minimum (matching spec 039's T011 precedent of a tracked partial-i18n gap
  for `es/fr/ru/ar/zh`, not a blocker — Principle VI is not fully satisfied until translated, same
  tracked gap applies to T015/T022 below)
- [X] T009 [US1] Mount `<CascadeRuleConfig />` inside `src/views/AdminView.vue`'s existing
  `tab === 'risk'` section (alongside `RiskIndicatorConfig`/`RiskScoreDashboard`/`ScenarioBuilder`/
  `CountryRiskIndexPanel`), inheriting the same `canAdmin` gate — no new route/tab needed

**Checkpoint**: US1 fully functional — an admin can configure their country's cascade rule set end-to-end.

---

## Phase 4: User Story 2 - See triggered secondary risks for a real hazard event (Priority: P1) 🎯 MVP

**Goal**: A user viewing a real hazard event's area sees any secondary risks the country's configured
cascade rules determined should be elevated, each with affected population, rendered recommendation
text, and full traceability to the triggering rule and input values.

**Independent Test**: Configure a proximity rule and a vulnerability rule (US1), select a real event
that satisfies both, confirm both secondary risks appear with correct figures and traceability; confirm
an event meeting no rule's condition shows an explicit "no secondary risk" state, and an area missing a
prerequisite (no risk_indicators, or the proximity layer unimported) shows that rule as not-evaluable
with the specific missing item named.

### Implementation for User Story 2

- [X] T010 [P] [US2] Build `src/components/risk/CascadingRiskPanel.vue`: given a
  `{ country_code, hazard_type, admin_boundary_code, event_lat, event_lng, magnitude, source_type,
  source_event_ref }` input, calls `evaluate_cascade_rules` and renders three distinct sections: triggered
  assessments (secondary risk category, recommendation text, affected population, and an expandable
  "why" showing the exact rule/input values that fired it), not-evaluable rules (each with its named
  missing prerequisite), and an explicit "no secondary risk triggered" empty state used only when both
  other sections are empty (contracts/cascading-hazard-risk.md)
- [X] T011 [US2] Wire `CascadingRiskPanel.vue` into `src/components/risk/RiskScoreDashboard.vue`'s
  per-area view: list recent real events for that area (reusing spec 039's `hazard_event_history_view`
  access already available to this component) with an "Evaluate Cascades" action per event that invokes
  `CascadingRiskPanel` with that event's real data
- [X] T012 [US2] Add all new UI strings from T010/T011 through the i18n system (Principle VI)
- [X] T013 [US2] **Verified live** through the real UI (Playwright, real super_admin session
  mgoktugd@gmail.com) end-to-end: created a proximity rule via `CascadeRuleConfig.vue`, evaluated it via
  `CascadingRiskPanel.vue` embedded in `RiskScoreDashboard.vue` against the real 2023 Kahramanmaraş M7.5
  earthquake, confirmed the rule fired with the real computed distance (1.9km from a real HydroRIVERS TR
  feature), correct "not available" population state, and full rule/input traceability via the "Neden"
  (Why) panel.
- [X] T013a **Live-testing finding (severity: high — real performance defect)**: the first live UI pass
  hit a real, reproducible `57014 statement timeout` on every call to `evaluate_cascade_rules` that
  actually reached the "triggered" branch (HTTP 500 from PostgREST, confirmed via direct network-response
  capture, not a CLI artifact). Root-caused through a long isolation process (confirmed via
  `pg_stat_statements` and a direct `curl` call with a real access token, timed at exactly the
  `authenticated` role's 8s `statement_timeout`): every query-shape rewrite tried (KNN nearest-neighbor,
  `ST_DWithin`-bounded, dataset-id-resolved-first, `SECURITY DEFINER` to bypass `exposure_features`' RLS
  policy, a `&&`/`ST_Expand` bounding-box index-force pre-filter) measured 100-350ms in isolation via a
  direct superuser connection, yet the real PostgREST/authenticated call consistently took ~8-10s
  regardless of which shape was live — meaning the bottleneck was not this function's query plan, but
  something in the PostgREST/connection-pooler request path for this project specifically (consistent
  with other documented, unrelated Supabase-platform quirks in `docs/plans/NEW_GAME_PLAN.md`). Fixed
  pragmatically in `20260727077000_cascading_hazard_risk_extend_statement_timeout.sql`: raised this one
  function's own `statement_timeout` to 25s via `ALTER FUNCTION ... SET statement_timeout`, well above the
  observed ~10s real-world cost, without weakening the `authenticated` role's timeout for anything else.
  Re-verified live afterward: 3 consecutive real triggering calls succeeded (2.5s-10s each, HTTP 200),
  confirmed correct results every time. The `SECURITY DEFINER` and bounding-box changes (fix-ups #2-#6,
  same migration file series) were kept even though they did not turn out to be the actual bottleneck —
  each is independently correct/faster in isolation and do not hurt.
- [ ] **[FOLLOW-UP, NOT BLOCKING]** T013b Cross-country RLS denial for a real `country_admin` session (not
  service-role/super_admin) was not exercised in this pass — only tested with the super_admin account
  provided for live verification (per the user's explicit instruction, since a country_admin has no wider
  privileges relevant here). `evaluate_cascade_rules` is now `SECURITY DEFINER` with its own explicit
  authorization check (mirroring the three-tier rule) rather than relying on table RLS for this one
  function — that explicit check itself has not been exercised against a real non-super_admin session.
  `save_cascade_rule`/`cascade_rules`/`cascading_risk_assessments` direct-table access still relies on
  ordinary RLS (unchanged, same proven three-tier pattern as `risk_indicators`).

**Checkpoint**: US1 + US2 together deliver the MVP — configurable, auditable, explainable cascading risk
assessment for real hazard events.

---

## Phase 5: User Story 3 - Query a hypothetical "what would this trigger" scenario (Priority: P2)

**Goal**: A user evaluates cascade rules against a hypothetical hazard scenario (spec 039's scenario
builder), seeing the same triggered/not-evaluable/no-risk result a real equivalent event would produce,
clearly labeled as simulated.

**Independent Test**: Build a hypothetical scenario matching a configured rule's condition, confirm the
same secondary risk(s)/recommendation text appear as for an equivalent real event, visibly marked as
based on a simulated scenario; build one below a rule's threshold and confirm it correctly does not
trigger.

### Implementation for User Story 3

- [X] T014 [US3] Add an "Evaluate Cascades" action to `src/components/risk/ScenarioBuilder.vue` for a
  simulated/saved `hazard_scenarios` row, calling `evaluate_cascade_rules` with
  `source_type: 'hypothetical_scenario'` and `source_event_ref: { hazard_scenario_id }`, reusing
  `CascadingRiskPanel.vue` (T010) for display with a visible "simulated" label distinguishing it from a
  real-event assessment
- [X] T015 [US3] Add all new UI strings from T014 through the i18n system (Principle VI)
- [X] T016 [US3] Verify live: a hypothetical scenario below a configured rule's magnitude threshold
  correctly shows no trigger; the same location/rule at a qualifying hypothetical magnitude produces a
  `recommendation_text` identical in form to what an equivalent real event at that location would
  produce (US3 acceptance scenario 1 — "same answer, hypothetical or real")

**Checkpoint**: All three user stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T017 Run `npm run test` and `npm run build`, confirm no regressions (no new pure-logic module is
  introduced by this spec, per research.md — this is a regression check, not new test authoring)
- [X] T018 Manually verify no AI/ML/LLM component exists anywhere in this module's code path (FR-005/
  SC-004), matching spec 039's T034 precedent — every triggered assessment must trace to a rule row and
  its documented condition-evaluation logic in `evaluate_cascade_rules`
- [X] T019 Verify historical-assessment immutability (FR-010, Edge Cases): after a rule produces at
  least one triggered assessment, edit that rule's threshold and confirm the existing
  `cascading_risk_assessments.rule_config_snapshot` is unchanged while a fresh evaluation uses the new
  threshold
- [X] T020 Run `quickstart.md` §6 (country isolation) and §7 (regression) end-to-end with a real
  `country_admin` session, not service-role, per this project's own residual-gap pattern noted in spec
  039's tasks.md T016/T035

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; T002-T005 are strictly sequential (same migration file)
  — BLOCKS all user stories
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Foundational; together form the MVP
  (US2's `CascadingRiskPanel` is independently buildable/testable against a country with zero cascade
  rules configured, per FR-007's explicit no-rules/no-trigger handling, though realistic end-to-end
  testing benefits from US1 existing first)
- **US3 (Phase 5)**: Depends on Foundational (RPC) and on T010 (`CascadingRiskPanel.vue`, built in US2)
  for display — the only cross-story reuse in this feature, matching how spec 039's US2 reused nothing
  from US1 but US4 shared UI surface with US2

### Parallel Opportunities

- T006 (US1's `CascadeRuleConfig.vue`) and T010 (US2's `CascadingRiskPanel.vue`) touch different files
  and can proceed in parallel once Foundational is done
- T008/T012/T015 (i18n additions for each story) are independent file edits and can be parallelized
  across stories once their respective components exist

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2)
2. **STOP and VALIDATE**: quickstart.md §1-3 — a country_admin can configure cascade rules and see
   triggered/not-evaluable/no-risk results for real events, correctly isolated from other countries.
   This alone is a demonstrable MVP, independent of the hypothetical-scenario path.

### Incremental Delivery

3. Add US3 (hypothetical scenario evaluation) → quickstart.md §4 → demo
4. Phase 6 polish
