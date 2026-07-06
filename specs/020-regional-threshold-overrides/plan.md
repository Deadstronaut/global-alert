# Implementation Plan: Regional Hazard Threshold Overrides

**Branch**: `020-regional-threshold-overrides` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-regional-threshold-overrides/spec.md`

## Summary

Today, `hazard_thresholds` (spec 010) is entirely global — one severity classification per hazard
type, shared by every country. This feature adds a new, purely additive
`hazard_threshold_overrides` table letting a Country Admin (or an Org Admin holding the existing
`hazard_taxonomy` capability grant from spec 018) define a country-specific classification that
takes precedence over the global one, only for their own country, only for the hazard types they
choose to override — everything else keeps behaving exactly as it does today. Super Admin may
manage overrides for any country. This closes the "bölgesel eşik override'ları" line item in
Hazard Taxonomy Admin's remaining backlog. Matching the precedent already set by this exact module
(spec 010 → spec 016), this iteration covers only the frontend classification path
(`hazardTypes.js`/`severity.js`, used by manual entry and file import); extending the automatic
backend ingestion runtimes (`normalize.ts`/`normalizer.js`) to also honor country overrides is
explicitly deferred as a separate, later iteration (spec.md Assumptions).

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`, Pinia store), SQL (PostgreSQL migration)

**Primary Dependencies**: Supabase JS client, PostgreSQL RLS + existing `current_profile_role()`
and `current_profile_country_code()` helpers (spec 004/010), the existing
`current_profile_has_capability('hazard_taxonomy')` helper (spec 018)

**Storage**: PostgreSQL (Supabase) — one new table (`hazard_threshold_overrides`), no changes to
`hazard_types`/`hazard_thresholds`'s existing shape

**Testing**: Vitest for the new pure `resolveThresholds()` function (override-vs-global selection
logic), matching the project's established pattern for `evaluateBreakpoints()` (spec 010's
`tests/unit/hazardThresholdEvaluation.test.js`) — this is exactly the class of "easy to get subtly
wrong" logic (empty overrides object, override present for a different country, override present
for a different hazard type) the constitution flags for test-first treatment.

**Target Platform**: Web (existing Vue 3 SPA), Supabase-hosted Postgres

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project/service)

**Performance Goals**: N/A — overrides are fetched once at app boot alongside the existing global
registry (`fetchHazardTypes()`), no new per-event network round trip; severity resolution remains
a synchronous, in-memory lookup exactly as it is today.

**Constraints**: `computeSeverity(hazardType, value)`'s existing two-argument call sites MUST
continue to work unchanged (the new `countryCode` parameter is optional, appended, not inserted).
Every hazard-type/country combination without an override MUST behave identically to today
(FR-002, SC-001) — this is the same zero-regression guarantee spec 010 and spec 016 both already
established for the global registry itself. An override write MUST be rejected server-side (RLS
`WITH CHECK`, not just a hidden UI control) for any country other than the acting non-Super-Admin's
own (FR-008).

**Scale/Scope**: 1 new table, 1 new pure function + its test (`resolveThresholds()`), edits to 2
existing files (`hazardTypes.js`, `severity.js`), 1 new admin UI subsection.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: Directly reinforced — this feature
  extends the existing schema-driven hazard configuration model (spec 010's core achievement) with
  another configuration layer (per-country override), rather than hardcoding any country-specific
  logic. PASS.
- **Principle II (Scope Discipline)**: N/A — no dissemination/identity/CAP change. PASS.
- **Principle III (CAP v1.2 Compliance)**: N/A. PASS.
- **Principle IV (Data Quality & Normalization)**: The backend ingestion normalizers
  (`normalize.ts`/`normalizer.js`) are explicitly NOT touched by this iteration (spec.md
  Assumptions) — this is a conscious, documented scope boundary, not an oversight, mirroring the
  same split already accepted for spec 010→016. PASS.
- **Principle V (Access Control & Auditability)**: RLS scopes override writes to the acting
  admin's own country (FR-006/FR-008), reusing existing helpers rather than inventing a new access
  model; Super Admin retains full cross-country access (FR-007). No existing access boundary is
  weakened. PASS.
- **Principle VI (Accessibility & Internationalization)**: New UI strings (override section
  labels, country selector for Super Admin) MUST be added via the i18n system across all 7
  locales. Planned in tasks. PASS (pending execution).
- **Principle VII (Performance & Resilience by Design)**: N/A — overrides load once at boot
  alongside the existing registry fetch; no new polling/offline-cache path. PASS.
- **Principle VIII (Simplicity & YAGNI)**: The override table is a minimal, additive extension
  (same shape as `hazard_thresholds` plus a `country_code` column) reusing 100% of the existing
  breakpoint-evaluation logic (`evaluateBreakpoints()`) — no new severity-computation algorithm is
  introduced, only a new lookup layer in front of the existing one. Deferring the backend
  ingestion-runtime wiring (rather than doing everything in one iteration) is itself a YAGNI
  choice, matching the project's own established precedent. PASS.

**Result**: All principles pass. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/020-regional-threshold-overrides/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── 20260707220000_hazard_threshold_overrides.sql   # NEW

src/
├── stores/
│   └── hazardTypes.js         # MODIFIED — overrides state, resolveThresholds(), computeSeverity() 3rd arg
├── utils/
│   └── severity.js             # MODIFIED — buildEventRow() passes country_code through
├── components/admin/
│   └── HazardThresholdEditor.vue   # MODIFIED — new country-override subsection
└── i18n/
    └── locales/*.json          # MODIFIED — 7 locales, new hazardTaxonomy.overrides.* keys

tests/unit/
└── hazardThresholdOverrides.test.js   # NEW — resolveThresholds() tests
```

**Structure Decision**: Single existing Vue 3 + Supabase project — no new project/service
directory. One migration, one new pure-function test file, and targeted edits to two existing
frontend files plus one admin component — same structure every prior spec in this repo (001–019)
has used.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*
