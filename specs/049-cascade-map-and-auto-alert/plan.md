# Implementation Plan: Cascade Map Integration & Opt-In Auto-Evaluation

**Branch**: `049-cascade-map-and-auto-alert` | **Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/049-cascade-map-and-auto-alert/spec.md`

## Summary

Two additive extensions to spec 048 (Cascading Hazard Risk), reusing its schema/RPC/UI unchanged. (1)
Embeds the existing `CascadingRiskPanel.vue`/`evaluate_cascade_rules` into the main map's
`ImpactPanel.vue`, resolving an `admin_boundary_code` for the selected event's lat/lng via this project's
existing client-side point-in-polygon utility (`src/utils/pointInPolygon.js`'s `findRegion`) rather than
inventing new boundary logic. (2) Adds a per-country, country_admin-only opt-in setting
(`country_cascade_settings`) that, when enabled, makes a new `AFTER INSERT` trigger on each of the 9
hazard tables call cascade evaluation automatically for that country — using a new internal, non-
user-facing evaluation function (`_evaluate_cascade_rules_core`, refactored out of spec 048's existing
`evaluate_cascade_rules` so both the manual RPC and this automatic trigger path share one evaluation body
without duplicating it) — and surfaces the result only as a count-based "unacknowledged" indicator,
explicitly never touching CAP/dispatch.

## Technical Context

**Language/Version**: SQL/PL-pgSQL for the new `country_cascade_settings` table, the
`_evaluate_cascade_rules_core`/`evaluate_cascade_rules` refactor, the new `auto_evaluate_cascade()`
trigger function and its 9 per-table triggers, and `acknowledge_cascade_assessment()` RPC. Vue 3/
JavaScript for `ImpactPanel.vue`'s new section (reusing `CascadingRiskPanel.vue` as-is) and a small new
toggle + unacknowledged-count display, using this project's existing `findRegion()` boundary utility —
no new frontend library.

**Primary Dependencies**: None new. Reuses spec 048's `cascade_rules`/`cascading_risk_assessments`/
`compute_risk_category_score` and this project's existing boundary-loading (`src/data/boundaries/
index.js`'s `loadRegionBoundaries`) plus point-in-polygon (`src/utils/pointInPolygon.js`'s `findRegion`)
utilities — both already used elsewhere for country/province tagging, per spec's explicit instruction not
to duplicate boundary-resolution logic.

**Storage**: PostgreSQL via Supabase. New: `country_cascade_settings` (one row per country, 2-tier RLS —
super_admin + that country's country_admin only, no org_admin/viewer, per FR-004 — a deliberate exception
to this project's usual 3-tier pattern). Modified (additive columns only): `cascading_risk_assessments`
gains `triggered_automatically BOOLEAN NOT NULL DEFAULT false` and `acknowledged_at TIMESTAMPTZ` (both
nullable-safe, existing rows unaffected). Modified (refactor, no behavior change for existing callers):
`evaluate_cascade_rules` becomes a thin authorization-check wrapper around a new
`_evaluate_cascade_rules_core` that holds the unchanged evaluation logic.

**Testing**: No new pure-logic module; per this repo's established convention (specs 038/039/048),
verified via quickstart.md's live steps against real data, not new unit tests.

**Target Platform**: Supabase Postgres RPCs + triggers, Vue 3 frontend — no new platform.

**Project Type**: Web application — extends two existing components (`ImpactPanel.vue`, and a small
addition near `CascadeRuleConfig.vue`/`AdminView.vue`'s summary-count row), no new top-level view.

**Performance Goals**: The automatic trigger path must not add meaningful overhead to hazard-event
ingestion for the common case (setting disabled) — the trigger function's first action is a single
indexed lookup on `country_cascade_settings`; if disabled or absent (default), it returns immediately
without touching `cascade_rules`/`exposure_features` at all.

**Constraints**: MUST NOT let the automatic path touch CAP/dispatch in any way (spec FR-006,
non-negotiable, Constitution Principle II). MUST NOT let a failure in automatic cascade evaluation block
or roll back the actual hazard-event insert that triggered it (mirrors spec 029's audit-log
dead-letter resilience precedent — a secondary side-effect must not endanger the primary write). MUST NOT
introduce AI/ML (spec FR-008, same as spec 048 FR-005).

**Scale/Scope**: 1 new table, 2 additive columns, 1 function refactor (no behavior change), 1 new trigger
function + 9 per-table triggers (one per existing hazard table), 1 new RPC
(`acknowledge_cascade_assessment`), 1 new migration, 2 modified frontend files (`ImpactPanel.vue` for the
map integration, `AdminView.vue`/`CascadeRuleConfig.vue` area for the settings toggle + unacknowledged
count).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. The 9 per-table triggers all call the same shared
  `auto_evaluate_cascade()` function; onboarding a new hazard type (per spec 037/PRD's existing generic
  hazard-taxonomy mechanism) requires adding one more trigger of the identical shape, not new logic.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS, and explicitly the central constraint of this spec:
  FR-006 forbids any CAP/dispatch/external-channel interaction from the automatic path, verified as a
  concrete acceptance scenario (US2 scenario 2) and a measurable success criterion (SC-002). This is the
  one place this feature could most easily drift into "automatic alerting" — the spec and this plan both
  treat that boundary as non-negotiable.
- **III. CAP v1.2 Compliance** — N/A. No CAP authoring/export touched (and must never be, per above).
- **IV. Data Quality & Normalization** — PASS. FR-002 requires an explicit "cannot determine area" state
  rather than a fabricated boundary; the automatic path's silence when disabled/no-rules-configured is a
  legitimate no-op, not a swallowed error (edge cases section).
- **V. Access Control & Auditability** — PASS. `country_cascade_settings` follows a stricter-than-usual
  2-tier RLS (super_admin + country_admin only, explicitly excluding org_admin/viewer per FR-004) — a
  deliberate, spec-mandated exception to this project's normal 3-tier pattern, not an oversight. The
  existing `audit_risk_indicators`-style trigger convention is reused for this new settings table.
- **VI. Accessibility & Internationalization** — Applies at implementation time to the new UI strings
  (settings toggle, unacknowledged count, map panel section); flagged for implementation-time attention.
- **VII. Performance & Resilience by Design** — PASS. Trigger short-circuits to near-zero cost when
  disabled (Technical Context above); a failure inside automatic evaluation must not block the underlying
  hazard-event insert (Constraints above) — implemented via exception-trapping in the trigger function,
  the same resilience pattern spec 029 already established for `audit_log` writes.
- **VIII. Simplicity & YAGNI** — PASS, with the new table and the function refactor recorded in
  Complexity Tracking below. No new Edge Function, no new real-time/SSE infrastructure (spec Assumptions
  explicitly rule this out), no new boundary-resolution mechanism (FR-002 explicitly requires reusing the
  existing one).

**Result**: No unjustified violations. One additive table and one internal function refactor recorded in
Complexity Tracking, both directly required by the spec's own constraints.

## Project Structure

### Documentation (this feature)

```text
specs/049-cascade-map-and-auto-alert/
├── plan.md              # This file
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── cascade-map-and-auto-alert.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── <timestamp>_cascade_map_and_auto_alert.sql   # NEW: country_cascade_settings,
                                                       #      cascading_risk_assessments additive columns,
                                                       #      _evaluate_cascade_rules_core (refactor),
                                                       #      evaluate_cascade_rules (thin wrapper, same
                                                       #      signature/behavior for existing callers),
                                                       #      auto_evaluate_cascade() + 9 triggers,
                                                       #      save_country_cascade_setting RPC,
                                                       #      acknowledge_cascade_assessment RPC

src/
├── components/impact/ImpactPanel.vue      # MODIFIED: new "Cascading Risks" section reusing
│                                            #   CascadingRiskPanel.vue, resolves admin_boundary_code via
│                                            #   src/utils/pointInPolygon.js's findRegion()
└── components/risk/CascadeRuleConfig.vue   # MODIFIED: adds the auto-evaluate toggle (visible only to
                                             #   country_admin/super_admin) and the unacknowledged-count
                                             #   display with an acknowledge action
```

**Structure Decision**: Extends the two existing files the spec names directly (`ImpactPanel.vue` for the
map integration, the Risk tab's admin area for the settings toggle) rather than creating new top-level
views — consistent with spec 048's own precedent of adding to `src/components/risk/` rather than
inventing a new feature area.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New `country_cascade_settings` table | Needs a per-country boolean with a stricter, non-standard RLS scope (country_admin/super_admin only, explicitly not org_admin/viewer — FR-004) that no existing table expresses; overloading an existing table would either loosen that access to the existing 3-tier pattern (violating FR-004) or require one-off column-level RLS no existing table pattern here supports. | Adding a column to `cascade_rules` — rejected because `cascade_rules`' own RLS is the standard 3-tier (includes org_admin), and this setting must not follow that same visibility, so it cannot live on that table without either a second policy set on the same table (fragile, easy to regress) or the wrong access model. |
| Refactoring `evaluate_cascade_rules` into a thin wrapper + `_evaluate_cascade_rules_core` | The automatic trigger path must run the identical evaluation logic without the interactive-user authorization check (there is no `auth.uid()` session inside a trigger fired by a service-role/ingestion write) — but must not skip authorization for the manual/on-demand RPC path spec 048 already ships. | Duplicating the evaluation loop into a second, separate function — rejected as a maintenance hazard (two copies of the same non-trivial logic that could silently drift); duplicating the auth check for the trigger's own call — rejected because the trigger has no interactive session to check against, and its own authorization is structurally different (gated entirely by `country_cascade_settings`, decided in advance by country_admin, not per-call). |
