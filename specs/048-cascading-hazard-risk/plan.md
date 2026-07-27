# Implementation Plan: Cascading Hazard Risk

**Branch**: `048-cascading-hazard-risk` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/048-cascading-hazard-risk/spec.md`

## Summary

Adds a "Cascading Hazard Risk" module, a direct follow-on to spec 039 (Risk & Scenario Modeling). Where
spec 039 computes a single-hazard-type composite risk score per area, this module answers a different
question: given a primary hazard event (real or hypothetical), which *other* risks does it elevate in
the same area, and why? The mechanism is a country-scoped, admin-configurable `cascade_rules` registry —
each rule names a trigger hazard type, one or more deterministic conditions (a magnitude/severity
threshold, proximity to an existing exposure layer such as HydroRIVERS/HydroBASINS or a coastline, and/or
an area Vulnerability-score threshold reusing spec 039's `compute_risk_area_score`), a resulting secondary
risk category, and an admin-editable recommendation text template. A new `evaluate_cascade_rules` RPC
checks a real or hypothetical event's inputs against a country's active rules and persists a
`cascading_risk_assessments` row per rule that fires, each fully traceable to the rule and the specific
input values that satisfied it. No AI/ML/LLM component anywhere in this path (spec FR-005), for the same
explainability-to-UNDP reason as spec 039 (FR-005/FR-015).

## Technical Context

**Language/Version**: PostgreSQL SQL/PL-pgSQL for the new RPCs (`save_cascade_rule`,
`evaluate_cascade_rules`), matching spec 039's convention of keeping spatial aggregation
(`ST_DWithin` proximity checks, population overlay) in Postgres rather than the Edge Function layer. No
new Edge Function is required — unlike spec 039's `simulate-hazard-scenario`/`compute-risk-exceedance-
curve` (which needed iterative/random logic Postgres doesn't do cleanly), this module's evaluation is a
single deterministic pass over active rules with straightforward SQL conditions, so a plain RPC callable
via `supabase-js` is sufficient (Principle VIII — no new Edge Function unless the simpler option is shown
insufficient). Vue 3/JavaScript for the two new admin-facing UI pieces (rule configuration, triggered-
assessment view), added inside the existing `src/components/risk/` directory alongside spec 039's
components — no new frontend framework/library.

**Primary Dependencies**: None new. PostGIS (`ST_DWithin`, already enabled since spec 008) for proximity
conditions against `exposure_features.geom` (already a generic `geometry(Geometry, 4326)` column covering
points, lines, and polygons alike — HydroRIVERS lines and HydroBASINS polygons need no new geometry
handling). Reuses spec 039's `compute_risk_area_score` RPC as a subroutine for the Vulnerability-score
condition rather than recomputing it.

**Storage**: PostgreSQL via Supabase. New: `cascade_rules`, `cascading_risk_assessments` tables. Reused
unmodified: `exposure_datasets` (filtered by `source_name`, e.g. `'hydrorivers'`/`'hydrobasins'`, added in
spec 038/041), `exposure_features` (`geom`, `metric_value`, `admin_boundary_code`), `risk_indicators` +
`compute_risk_area_score`/`compute_risk_category_score` (spec 039), `hazard_event_history_view` (spec
039's additive UNION view over the 9 hazard tables), `hazard_scenarios` (spec 039).

**Testing**: No new pure-logic module is introduced (unlike spec 039's `hazardFootprint.ts`/
`seededRandom.ts`, which needed Deno unit tests because they contained real branching/iterative logic) —
this module's only new logic is SQL condition-matching inside RPCs, which this repo's documented
convention (spec 038/039 research) verifies via `quickstart.md` manual/live steps against real data, not
unit tests. `deno check`/`npm run test` regression pass still required as part of Polish.

**Target Platform**: Supabase Postgres RPCs, called directly via `supabase-js` from the frontend — no
Edge Function, no platform change.

**Project Type**: Web application (existing Vue 3 frontend + Supabase backend) — adds backend RPCs plus
two new admin-facing frontend surfaces (cascade rule configuration, triggered-assessment panel) inside
the existing `src/components/risk/` feature area established by spec 039.

**Performance Goals**: Not real-time. Evaluation is on-demand (user views a hazard event's area or
requests cascade evaluation for a saved hypothetical scenario), not triggered automatically by every
incoming hazard event — this module is explicitly decision-support only and does not feed the CAP/
dispatch pipeline (Constitution Principle II; spec Assumptions).

**Constraints**: MUST NOT introduce any AI/ML/LLM component anywhere in this module (spec FR-005,
non-negotiable, identical rationale to spec 039 FR-005/FR-015). MUST NOT hardcode any cascade rule,
including the three example rules named in the spec's motivating description (spec FR-002) — they are
seed *data* an admin creates through the generic mechanism, not special-cased code paths. MUST NOT
silently default a missing prerequisite (unimported exposure layer, unconfigured risk indicator, missing
footprint formula) to zero or skip it invisibly (spec FR-006, same "reject rather than guess" standard as
spec 039 FR-007 / Constitution Principle IV).

**Scale/Scope**: 2 new tables, 2 new RPCs, 1 new migration, 2 new/extended admin-facing frontend views
(cascade rule configuration; triggered-assessment display integrated into the existing Risk dashboard
area-detail view). No changes to CAP authoring, dissemination, hazard ingestion, or spec 039's existing
schema/RPCs (purely additive, reads from them).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. `trigger_hazard_type` and `secondary_risk_category`
  are free-text, admin-entered values, not an enum tied to specific hazard types in code; adding a new
  cascade relationship (e.g. for a hazard type onboarded after this module ships) requires only a new
  `cascade_rules` row, never a code change. A rule referencing a hazard type with no `hazardFootprint.ts`
  entry or no imported proximity layer degrades to "not evaluable" (FR-006) rather than blocking the
  module, matching spec 039's FR-010 precedent.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. Does not touch dissemination channels, identity/auth,
  or CAP ingestion/authoring. Evaluation is user-triggered/on-demand, explicitly not wired into the CAP
  broadcast or dispatch pipeline (spec Assumptions) — this module recommends, it does not alert.
- **III. CAP v1.2 Compliance** — N/A. No CAP authoring/export touched.
- **IV. Data Quality & Normalization** — PASS. FR-006/FR-007 require explicit "not evaluable" and "no
  secondary risk triggered" states rather than a fabricated or silently-zeroed result — a direct
  application of this principle, and a straight reuse of spec 039's identical FR-007 pattern.
- **V. Access Control & Auditability** — PASS. Both new tables follow the existing three-tier RLS pattern
  (super_admin/country_admin/org_admin, no anon read) identical to `risk_indicators`/`risk_area_scores`.
  `cascading_risk_assessments` snapshots the rule configuration that produced it (`rule_config_snapshot`,
  mirroring `risk_area_scores.indicator_config_snapshot`) so a later rule edit/delete cannot retroactively
  change what a past assessment showed (FR-010).
- **VI. Accessibility & Internationalization** — Applies at implementation time to the two new UI pieces;
  all new UI text MUST go through the existing i18n system, flagged for implementation-time attention
  (same open item spec 039 tracked for its own three views — `es/fr/ru/ar/zh` translation completeness).
- **VII. Performance & Resilience by Design** — PASS. On-demand evaluation only, no new polling/real-time
  requirement, no change to any hazard-source refresh cadence.
- **VIII. Simplicity & YAGNI** — PASS, with two additive tables recorded in Complexity Tracking below
  (both directly analogous to spec 039's already-justified `risk_indicators`/`risk_area_scores` pair). No
  new Edge Function, no new external dependency, no expression-language/rule-engine library — rule
  conditions are a small fixed set of typed columns (magnitude threshold, proximity, vulnerability
  threshold), not a general-purpose condition DSL, since the spec's examples and Assumptions do not call
  for arbitrary boolean composition beyond "all configured conditions on a rule must hold" (AND-only).

**Result**: No unjustified violations. Two additive schema objects recorded in Complexity Tracking, both
justified by direct precedent from spec 039's already-accepted equivalents.

## Project Structure

### Documentation (this feature)

```text
specs/048-cascading-hazard-risk/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── cascading-hazard-risk.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_cascading_hazard_risk.sql   # NEW: cascade_rules, cascading_risk_assessments,
                                                  #      save_cascade_rule, evaluate_cascade_rules RPCs

src/
└── components/risk/
    ├── CascadeRuleConfig.vue                    # NEW (US1)
    ├── CascadingRiskPanel.vue                   # NEW (US2/US3) — triggered-assessment display,
    │                                             #   embedded into RiskScoreDashboard.vue's area view
    ├── RiskScoreDashboard.vue                   # MODIFIED: adds a "Cascading Risks" section per area,
    │                                             #   listing real events with an "Evaluate" action
    └── ScenarioBuilder.vue                      # MODIFIED: adds an "Evaluate Cascades" action on a
                                                    #   simulated/saved hazard_scenario (US3)
```

**Structure Decision**: Follows spec 039's established Supabase Postgres RPC + Vue 3 frontend structure
exactly, extending the same `src/components/risk/` feature area rather than creating a new one. All
condition-evaluation logic (proximity `ST_DWithin`, vulnerability-score lookup via
`compute_risk_area_score`, rule matching) lives in Postgres RPCs, matching spec 039's precedent that
spatial/aggregate computation stays in the database; the frontend only calls RPCs and renders results,
no client-side geometry math.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New `cascade_rules` table | A rule needs a shape (`trigger_hazard_type`, threshold columns, proximity reference, `secondary_risk_category`, recommendation template) that no existing table has room for; `risk_indicators` describes a single-factor weight, not a cross-hazard relationship. | Overloading `risk_indicators` or `hazard_thresholds` with these columns — rejected for the same reason spec 039 rejected overloading `exposure_datasets` with risk-specific fields: it would leave the new columns permanently NULL for every unrelated row of that table. |
| New `cascading_risk_assessments` table (rather than reusing `risk_area_scores`) | FR-010 requires a past assessment to remain attributable to the exact rule configuration that produced it even after the rule is later edited/deleted, and its shape (triggering event/scenario reference, secondary risk category, recommendation text) is structurally different from a composite Hazard×Exposure×Vulnerability×CopingCapacity score row. | Adding cascade-specific nullable columns to `risk_area_scores` — rejected because it conflates two different kinds of output (a single-hazard composite score vs. a cross-hazard triggered assessment) in one table, exactly the anti-pattern spec 039 itself avoided when it kept `risk_area_scores` separate from `exposure_datasets`. |
