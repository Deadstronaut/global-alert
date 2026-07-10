# Implementation Plan: Risk & Scenario Modeling

**Branch**: `039-risk-scenario-modeling` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/039-risk-scenario-modeling/spec.md`

## Summary

Adds the "Risk & Scenario Modeling" module explicitly deferred out of spec 008 as a future roadmap item.
Computes a deterministic, INFORM-methodology-style composite risk score
(`Hazard × Exposure × Vulnerability × Lack of Coping Capacity`, each factor a normalized 0-10 weighted
composite) per administrative area, using only data already flowing into this system: hazard event
history (verified live to already persist in the 9 existing per-type tables — earthquake, wildfire,
flood, drought, tsunami, cyclone, volcano, epidemic, disaster) and exposure datasets (spec 008/034/038).
Vulnerability and Coping Capacity are new country-configurable composite indices built from the same
generic exposure-dataset upload path, tagged with a small new metadata table. Scenario modeling adds
deterministic (non-ML) hazard-footprint simulation, extending the existing `hazardBuffer.js`
magnitude-derived earthquake formula server-side, explicitly declining to fabricate formulas for hazard
types without one yet (FR-010). Probabilistic exceedance curves use seeded bootstrap resampling of real
historical event data — no fitted statistical model, no ML, fully reproducible and auditable per the
spec's explicit non-negotiable requirement (FR-005/FR-015) that this module never contain an AI/ML
component, since its output must remain explainable to a non-technical partner (UNDP) making
life-safety-adjacent decisions.

## Technical Context

**Language/Version**: TypeScript (Deno) for the two Edge Functions that need iterative/random logic
(`simulate-hazard-scenario`, `compute-risk-exceedance-curve`); PostgreSQL SQL/PL-pgSQL for the
composite-score RPCs, matching the existing `compute_zonal_stats`/`compute_boundary_breakdown`
convention (spec 008/034) of doing spatial aggregation in the database, not the Edge Function layer.
Vue 3/JavaScript for admin UI (indicator configuration, risk score view, scenario builder) — no new
frontend framework/library.

**Primary Dependencies**: None new. `@supabase/supabase-js` (existing) for the two Edge Functions;
PostGIS (already enabled, spec 008) for all spatial queries; a small inlined seeded-PRNG function
(~10 lines, no package) for reproducible Monte Carlo sampling (research.md §6) — explicitly rejected a
statistics-fitting library to avoid a new dependency (Principle VIII).

**Storage**: PostgreSQL via Supabase. New: `risk_indicators`, `risk_area_scores`, `hazard_scenarios`
tables; `hazard_event_history_view` (additive UNION ALL view over the 9 existing hazard tables — no
schema change to any of them). Reused unmodified: `exposure_datasets`, `exposure_features`
(including spec 034's `admin_boundary_code`), `country_boundaries`.

**Testing**: Deno's built-in test runner for pure logic only (the earthquake footprint formula, the
seeded PRNG) — matches this repo's documented convention (spec 038 research) that DB-touching RPCs
(including the composite-score combination math, which lives entirely in SQL) and Edge Functions with
live network calls are not unit-tested here; those are covered by quickstart.md's manual verification
steps instead.

**Target Platform**: Supabase Edge Functions (Deno) + Postgres RPCs, consistent with all existing
ingestion/analysis code; no platform change.

**Project Type**: Web application (existing Vue 3 frontend + Supabase backend) — adds backend RPCs/
functions plus one new admin-facing frontend surface (indicator config + risk score view + scenario
builder), no new top-level app.

**Performance Goals**: Not real-time. Composite score computation is triggered on-demand per area (or
cached in `risk_area_scores` and recomputed on indicator-config change), consistent with this module's
decision-support (not alerting) purpose (spec Assumptions — explicitly does not feed CAP/dispatch).

**Constraints**: MUST NOT introduce any AI/ML component anywhere in this module (spec FR-005/FR-015,
non-negotiable per user requirement) — every score/curve/footprint MUST be traceable to a documented
deterministic formula and its specific inputs. MUST NOT hardcode any country-specific value in source
code (project-wide constraint, reconfirmed for this module in spec FR-003/FR-014).

**Scale/Scope**: 3 new tables, 1 new view, ~4 new RPCs, 2 new Edge Functions, 1 new migration, 3 new
admin-facing frontend views (indicator config, risk score dashboard, scenario builder). No changes to
CAP authoring, dissemination, or any existing exposure/population data model.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. Hazard-footprint formulas are a per-hazard-type
  strategy table (extending `hazardBuffer.js`'s existing pattern), explicitly designed to add new hazard
  types via configuration/new formula entries, not structural rewrites; a hazard type with no formula
  yet degrades gracefully (FR-010) rather than blocking the module.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. Does not touch dissemination channels, identity/auth,
  or CAP ingestion/authoring. This module is explicitly decision-support only (spec Assumptions); it
  does not automatically trigger alerts or feed the CAP pipeline.
- **III. CAP v1.2 Compliance** — N/A. No CAP authoring/export touched.
- **IV. Data Quality & Normalization** — PASS. FR-007 requires missing factors to be explicitly flagged,
  never silently zeroed; FR-013 requires an explicit insufficient-data state rather than a curve built
  from too few points — both are direct applications of this principle's "reject rather than guess"
  standard.
- **V. Access Control & Auditability** — PASS. All new tables follow the existing three-tier RLS pattern
  (super_admin/country_admin/org_admin) with no `anon` read policy (Vulnerability/Coping Capacity data is
  exactly the sensitive-data case flagged in spec 001's guardrail). `risk_area_scores` retains historical
  snapshots (not overwritten) with the indicator configuration that produced each one, satisfying
  auditability for a score that later-changed weights must not silently rewrite.
- **VI. Accessibility & Internationalization** — Applies at implementation time to the three new admin
  views (indicator config, risk dashboard, scenario builder) — all new UI text MUST go through the
  existing i18n system; flagged for implementation-time attention, not a plan-level violation.
- **VII. Performance & Resilience by Design** — PASS. Composite scores are computed/cached on demand, not
  polled; no new real-time requirement introduced.
- **VIII. Simplicity & YAGNI** — PASS, with three explicitly justified additions (see Complexity Tracking
  below): one additive view, one small metadata table, one snapshot table. No new service, queue,
  external API dependency, or ML/statistics library introduced — the explicit non-negotiable requirement
  of this feature (no AI/ML) and Principle VIII point the same direction here.

**Result**: No unjustified violations. Three additive schema objects recorded in Complexity Tracking,
all justified by direct reuse of already-verified existing data (research.md).

## Project Structure

### Documentation (this feature)

```text
specs/039-risk-scenario-modeling/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── risk-scenario-modeling.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <timestamp>_risk_scenario_modeling.sql   # NEW: risk_indicators, risk_area_scores,
│                                                 #      hazard_scenarios, hazard_event_history_view,
│                                                 #      compute_risk_area_score, save_risk_indicator RPCs
└── functions/
    ├── simulate-hazard-scenario/
    │   └── index.ts                             # NEW
    ├── compute-risk-exceedance-curve/
    │   └── index.ts                             # NEW
    └── shared/
        ├── hazardFootprint.ts                   # NEW (server-side strategy table, extends
        │                                        #      src/lib/hazardBuffer.js's earthquake formula)
        ├── hazardFootprint.test.ts               # NEW
        ├── seededRandom.ts                       # NEW (mulberry32-style PRNG, no dependency)
        └── seededRandom.test.ts                  # NEW

src/
├── components/risk/
│   ├── RiskIndicatorConfig.vue                  # NEW (US1)
│   ├── RiskScoreDashboard.vue                    # NEW (US2)
│   └── ScenarioBuilder.vue                       # NEW (US3/US4)
└── services/api/config.js                        # MODIFIED: add EDGE_FUNCTIONS entries for the 2 new
                                                    #   functions (no new polling — user-triggered, not
                                                    #   scheduled)
```

**Structure Decision**: Follows the existing Supabase Edge Functions + Postgres RPC + Vue 3 frontend
structure exactly. Spatial/aggregate computation stays in Postgres RPCs (matching
`compute_zonal_stats`/`compute_boundary_breakdown`); only the two genuinely iterative/random pieces
(scenario footprint simulation, Monte Carlo curve sampling) get their own Edge Functions, each also
exposing a pure, independently-testable core module in `shared/` (matching spec 038's
`geopackageBlob.ts`-style separation of pure logic from I/O).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New `hazard_event_history_view` | Historical hazard data already exists (research.md §1) but is split across 9 differently-shaped tables with no common query surface; both the Hazard-factor RPC and the exceedance-curve function need to query "this hazard type, this area, this time range" generically. | Querying all 9 tables separately in each of the 2+ call sites — rejected as repeated, drift-prone filtering/aggregation logic; a single additive view (same pattern as each table's existing `_view`) is strictly simpler and matches precedent. |
| New `risk_indicators` table | A Vulnerability/Coping Capacity indicator needs risk-specific metadata (category, weight, normalization range) that a generic `exposure_datasets` row has no field for, and adding those fields directly to `exposure_datasets` would leave them permanently NULL for every non-risk use of that table (population, buildings, etc.). | Adding `risk_category`/`risk_weight` columns to `exposure_datasets` directly — rejected for the same reason spec 038 rejected reusing `data_sources.endpoint_config` for per-country dataset refs: it pollutes a shared generic table with fields meaningful to only one consumer. |
| New `risk_area_scores` snapshot table (rather than a live view) | FR-004/Edge Cases require a computed composite score to remain attributable to the exact indicator weights that produced it, even after an admin later changes those weights — a live `VIEW` would silently recompute historical scores out from under any report/export that referenced them. | A live view recomputed on every read — rejected because it cannot satisfy the auditability requirement (Principle V): there would be no way to know what a score "was" at CAP-broadcast time or in a past report once weights changed. |
