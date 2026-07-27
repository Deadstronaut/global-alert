---

description: "Task list for Cascade Map Integration & Opt-In Auto-Evaluation (spec 049)"
---

# Tasks: Cascade Map Integration & Opt-In Auto-Evaluation

**Input**: Design documents from `/specs/049-cascade-map-and-auto-alert/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/, quickstart.md

**Tests**: No new pure-logic module (all new logic is SQL/triggers/thin frontend wiring); verified via
quickstart.md's live steps, matching spec 048's own convention.

**Organization**: Tasks are grouped by user story (US1-US2, priorities from spec.md) after one shared
Foundational phase.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Confirm no new directories required: this feature only adds one migration file to existing
  `supabase/migrations/` and modifies two existing Vue files (`src/components/impact/ImpactPanel.vue`,
  `src/components/risk/CascadeRuleConfig.vue`)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 Create migration `supabase/migrations/<timestamp>_cascade_map_and_auto_alert.sql`: add
  `country_cascade_settings` table (data-model.md §1) with the deliberate 2-tier RLS (super_admin all;
  country_admin own-country only; explicitly NO org_admin/viewer policy) and an audit trigger matching
  `cascade_rules`' pattern
- [X] T003 In the same migration file, add `cascading_risk_assessments.triggered_automatically` and
  `.acknowledged_at` additive columns (data-model.md §2) — no RLS change, existing policy already covers
  the new columns (depends on T002 — same file)
- [X] T004 In the same migration file, rename/extract the existing `evaluate_cascade_rules` function body
  into a new `_evaluate_cascade_rules_core(..., p_triggered_automatically BOOLEAN DEFAULT false)`
  (data-model.md §3) — identical logic to spec 048's current function, plus stamping
  `p_triggered_automatically` onto the inserted `cascading_risk_assessments` row; no authorization check
  in this internal function (depends on T003 — same file)
- [X] T005 In the same migration file, redefine `evaluate_cascade_rules` (data-model.md §4) as a thin
  wrapper: same public signature as spec 048, performs the existing interactive-user authorization check
  unchanged, then calls `_evaluate_cascade_rules_core(..., p_triggered_automatically := false)` — MUST
  produce byte-identical behavior to the pre-refactor function for every existing caller (FR-009)
  (depends on T004 — same file)
- [X] T006 In the same migration file, add `auto_evaluate_cascade()` trigger function (data-model.md §5):
  looks up `country_cascade_settings` for `NEW.country_code` and returns immediately if disabled/absent;
  otherwise resolves `admin_boundary_code` via the same `country_boundaries.geojson`/`ST_Within` technique
  spec 039's `compute_hazard_area_score` already uses, then calls `_evaluate_cascade_rules_core(...,
  p_triggered_automatically := true)`; wraps everything after the settings lookup in `EXCEPTION WHEN
  OTHERS THEN` so a failure here can never block/roll back the triggering hazard-event insert (depends on
  T005 — same file)
- [X] T007 In the same migration file, add the 9 `AFTER INSERT` triggers (one per hazard table:
  `earthquake`, `wildfire`, `flood`, `drought`, `tsunami`, `cyclone`, `volcano`, `epidemic`, `disaster`)
  calling `auto_evaluate_cascade()`, each passing that table's hazard-type literal (depends on T006 —
  same file)
- [X] T008 In the same migration file, add `save_country_cascade_setting(country_code, enabled)` RPC
  (contracts) — upserts `country_cascade_settings`, relies on table RLS for authorization (no duplicate
  check in the function body, matching `save_risk_indicator`'s precedent) (depends on T007 — same file)
- [X] T009 In the same migration file, add `acknowledge_cascade_assessment(assessment_id)` RPC
  (contracts) — idempotent `acknowledged_at = NOW()` update, no-op if already set (depends on T008 — same
  file)

**Checkpoint**: Migration applies cleanly; existing `evaluate_cascade_rules` callers unaffected; new
triggers/RPCs callable. User story implementation can now begin.

---

## Phase 3: User Story 1 - See cascading risks directly on the operational map (Priority: P1) 🎯 MVP

**Goal**: A user investigating a real event on the main map sees a "Cascading Risks" section in the
existing impact-analysis side panel, without switching to the Admin panel.

**Independent Test**: Select a real qualifying event on the map, confirm the side panel shows the same
result the admin dashboard would for the same event/area; select an event outside every loaded boundary
and confirm the explicit "cannot determine area" state.

### Implementation for User Story 1

- [X] T010 [US1] In `src/components/impact/ImpactPanel.vue`, add a computed/async resolution of
  `admin_boundary_code` for `props.selectedEvent` using `loadRegionBoundaries(effectiveCountryCode.value,
  'province')` (`src/data/boundaries/index.js`) + `findRegion(lat, lng, featureCollection, nameProperty)`
  (`src/utils/pointInPolygon.js`) — reusing both exactly as already used elsewhere in this project, no new
  boundary logic (contracts/cascade-map-and-auto-alert.md)
- [X] T011 [US1] In the same file, add a "Cascading Risks" section mounting the existing
  `CascadingRiskPanel.vue` with `source-type="real_event"`, `country-code`, `admin-boundary-code` (from
  T010), `hazard-type`/`event-lat`/`event-lng`/`magnitude` from `props.selectedEvent` — mounted only when
  T010 resolves a boundary; otherwise shows the explicit "cannot determine area for this location" state
  (FR-002)
- [X] T012 [US1] Add all new UI strings from T011 through the i18n system (Principle VI) — `en.json`/
  `tr.json` at minimum, matching spec 048's tracked partial-i18n gap for `es/fr/ru/ar/zh`
- [X] T013 [US1] **Verified live** (Playwright, real super_admin session): switched to 2D/"Durum" map
  mode, clicked a real `.disaster-marker` (a wildfire event with no resolvable country in this
  deployment's served set), confirmed the "Cascading Risks" section rendered under the event details in
  `ImpactPanel.vue` with zero console errors.
- [X] T013a **Live-testing finding (severity: medium — real FR-002 violation)**: the first live pass
  found `resolveCascadeBoundary()`'s early-return for "no country in focus at all" left both
  `cascadeBoundaryUnresolvable` and `cascadeBoundaryCode` at their initial falsy values — the section
  rendered its `<h4>` title with nothing beneath it, silently omitting the required explicit
  "cannot determine area" state (US1 acceptance scenario 2) instead of showing it. Fixed by setting
  `cascadeBoundaryUnresolvable.value = true` in that early-return branch. Re-verified live: the same
  wildfire event now correctly shows "Bu konum için idari bölge belirlenemedi — burada zincirleme risk
  değerlendirmesi yapılamıyor."
- [ ] **[FOLLOW-UP, NOT BLOCKING]** T013b The "happy path" (a TR/MG/MY event whose boundary *does*
  resolve, mounting `CascadingRiskPanel` itself inside `ImpactPanel.vue`) was not separately exercised via
  the map click in this pass — Playwright's marker selection is effectively random among ~1095 markers
  and didn't land on one in a served country. This code path reuses `CascadingRiskPanel.vue` and
  `findRegion`/`loadRegionBoundaries` completely unchanged from their own independently-verified behavior
  (spec 048's live tests; these utilities' existing use elsewhere in the app), so risk is low, but a
  direct confirmation with a TR-located marker is a reasonable follow-up if time allows.

**Checkpoint**: US1 fully functional — cascading risks visible directly from the operational map.

---

## Phase 4: User Story 2 - Country admin opts into automatic cascade evaluation (Priority: P2)

**Goal**: A country_admin can enable/disable automatic cascade evaluation for their own country only;
when enabled, qualifying real events auto-trigger evaluation, surfaced solely as an unacknowledged count.

**Independent Test**: Enable for one country as country_admin, confirm org_admin/viewer cannot see the
setting, confirm a qualifying real event auto-creates an assessment with zero CAP/dispatch side effects,
confirm the unacknowledged count reflects it and acknowledging clears it.

### Implementation for User Story 2

- [X] T014 [P] [US2] Add an auto-evaluate toggle to `src/components/risk/CascadeRuleConfig.vue` (or a new
  small section within it), visible only when the current session's role is `country_admin` or
  `super_admin` (never `org_admin`/`viewer` — FR-004), calling `save_country_cascade_setting`
- [X] T015 [US2] Add an unacknowledged-count display (query per contracts/cascade-map-and-auto-alert.md's
  count shape) near the toggle from T014, listing unacknowledged automatic assessments with an
  "Acknowledge" action calling `acknowledge_cascade_assessment`
- [X] T016 [US2] Add all new UI strings from T014/T015 through the i18n system (Principle VI)
- [X] T017 [US2] **Verified live** (Playwright, real super_admin session, plus direct RPC calls for the
  parts that must never touch a real hazard table — see T017a): toggled the setting on/off through the
  actual UI (`.risk-auto-evaluate` checkbox), confirmed `save_country_cascade_setting` round-trips
  correctly; generated a real auto-triggered assessment via `_evaluate_cascade_rules_core(...,
  p_triggered_automatically := true)` (the exact call `auto_evaluate_cascade()` makes) against the real
  2023 Kahramanmaraş earthquake coordinates, confirmed it appeared in the admin UI under "Onaylanmamış
  Otomatik Değerlendirmeler (1)" with correct area/category/recommendation text, and that clicking
  "Onayla" (Acknowledge) cleared it.
- [X] T017a **Live-testing finding (severity: high — real bug, caught before any real hazard event could
  hit it)**: the first attempt to load the unacknowledged list threw HTTP 400 `42703: column
  cascading_risk_assessments.secondary_risk_category does not exist` — `loadUnacknowledged()` queried a
  column that was never added to this table; `secondary_risk_category` only exists inside
  `rule_config_snapshot` (data-model.md §2, same as every other rule-authored field on a historical
  assessment). Fixed by selecting `rule_config_snapshot` instead and reading
  `a.rule_config_snapshot?.secondary_risk_category` in the template. Re-verified live: renders correctly.
- [X] T017b **Deliberately not exercised via a real hazard-table insert**: `earthquake`/etc. are live
  production tables the public map/globe view reads from — inserting a fake test row, even briefly, risks
  a real disaster marker flashing on a real user's screen. Substituted the equivalent direct call to
  `_evaluate_cascade_rules_core(..., p_triggered_automatically := true)` (T017 above), which is the exact
  function `auto_evaluate_cascade()` calls after its trigger-specific setup (settings lookup, boundary
  resolution) — covers the shared evaluation/stamping logic completely. What was *not* separately
  exercised: an actual `AFTER INSERT` firing on a real hazard table. Confirmed instead via catalog
  inspection (all 9 triggers present, correctly attached, per-table hazard-type literal verified) and code
  review of the `EXCEPTION WHEN OTHERS` resilience wrapper (T020) rather than a live fire-through-insert.
- [X] Confirmed live: `save_country_cascade_setting`/toggle is scoped by table RLS to
  super_admin/country_admin only — org_admin/viewer were not separately tested with real accounts in this
  pass (same residual gap pattern as spec 048's T013b/spec 039's T016), but the RLS policy itself contains
  no org_admin/viewer/anon grant at all (structurally verified by reading the applied migration), unlike
  every other cascade-related table's usual 3-tier pattern.

**Checkpoint**: Both user stories independently functional.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T018 `npm run test` → 230/230 passed; `npm run build` → clean (pre-existing large-chunk warnings
  only, unrelated to this feature)
- [X] T019 Re-verified `evaluate_cascade_rules`'s public behavior directly (M4.7 below-threshold call via
  the refactored wrapper → `not_triggered_count: 1`, `triggered: []`, identical to every pre-refactor
  result recorded in spec 048's own tasks.md) — confirms the thin-wrapper refactor (T004/T005) is
  behavior-preserving (FR-009). Did not re-run spec 048's full quickstart.md end-to-end line-by-line in
  this pass, but every distinct outcome category it covers (triggered/not-evaluable/not-triggered) was
  re-exercised across this feature's own live-testing (T013/T017 above) using the same underlying
  function.
- [X] T020 Verified by code review rather than a live fire-through-insert (see T017b for why): the
  `auto_evaluate_cascade()` trigger function wraps everything after the `country_cascade_settings` lookup
  in `EXCEPTION WHEN OTHERS THEN NULL` — structurally guarantees any failure inside boundary resolution or
  `_evaluate_cascade_rules_core` is swallowed and `RETURN NEW` still executes, so the triggering hazard
  insert always completes regardless. Not exercised by actually forcing an internal failure against a
  real insert.
- [X] T021 `grep`-verified zero AI/ML/LLM references in `20260727081000_cascade_map_and_auto_alert.sql`,
  `ImpactPanel.vue`, `CascadeRuleConfig.vue` — the automatic trigger's only "decision" is the
  `country_cascade_settings` boolean lookup, a plain deterministic condition.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: T002-T009 strictly sequential (same migration file) — BLOCKS both stories
- **US1 (Phase 3)** and **US2 (Phase 4)**: Both depend only on Foundational; independently testable and
  deliverable (US1 needs none of US2's schema; US2 needs none of US1's frontend work)
- **Polish (Phase 5)**: Depends on both stories being complete

### Parallel Opportunities

- T010/T011 (US1, `ImpactPanel.vue`) and T014/T015 (US2, `CascadeRuleConfig.vue`) touch different files
  and can proceed in parallel once Foundational is done

## Implementation Strategy

### MVP First

1. Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1)
2. **STOP and VALIDATE**: quickstart.md §1-2 — cascading risks visible from the map, spec 048's existing
   behavior unaffected. This alone is a demonstrable MVP, independent of the auto-evaluation opt-in.

### Incremental Delivery

3. Add US2 (opt-in automatic evaluation) → quickstart.md §3-6 → demo
4. Phase 5 polish
