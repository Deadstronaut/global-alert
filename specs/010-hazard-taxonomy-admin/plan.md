# Implementation Plan: Hazard Taxonomy Admin

**Branch**: `010-hazard-taxonomy-admin` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-hazard-taxonomy-admin/spec.md`

## Summary

Hazard types and their severity thresholds are hardcoded and duplicated across 6 frontend files plus `src/utils/severity.js` — a direct violation of Constitution Principle I. This plan adds a `hazard_types`/`hazard_thresholds` registry (super_admin-only writes, read-only for everyone else), an admin UI to manage it, and migrates the 6 hardcoded call sites to a shared `useHazardTypesStore` backed by the registry — seeded exactly from today's values so nothing regresses on day one. Backend normalization runtimes (`normalize.ts`, `normalizer.js`) are explicitly not touched in this phase (research.md §2-3).

## Technical Context

**Language/Version**: JavaScript/Vue 3 (Composition API) — same as the rest of this repo, no new language.

**Primary Dependencies**: Existing stack only (Vue 3, Pinia, Vite, Supabase JS client). No new npm packages, no new Edge Function (contracts/hazard-taxonomy-crud.md — plain RLS-gated table CRUD, same pattern as `data_sources`/`contacts`).

**Storage**: PostgreSQL via Supabase — 2 new tables (`hazard_types`, `hazard_thresholds`), no new database technology.

**Testing**: Vitest, matching the existing `tests/unit/*.test.js` convention (e.g. `capStateMachine.test.js`) — this is frontend-only logic, unlike spec 009's Deno Edge Function tests.

**Target Platform**: Same as existing app — browser (Vue SPA) + Supabase-hosted Postgres.

**Project Type**: Web application (existing single Vue frontend + Supabase backend — no new project/service).

**Performance Goals**: Registry loaded once per session (cached in a Pinia store, research.md §3-4), not re-fetched per component/selector — negligible added load.

**Constraints**: Zero behavioral regression for the 9 existing hazard types' severity classification on ship day (FR-007, SC-003); every one of the 6 migrated call sites must degrade gracefully (bundled fallback) if the registry is unreachable (FR-011, SC-005).

**Scale/Scope**: 2 new tables, 0 new Edge Functions, 1 new Pinia store, 1 new admin tab + 2 form components, 6 existing files migrated to read from the shared store instead of a local hardcoded array.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS, directly. This is the fix for an existing Principle I violation: adding a hazard type becomes a config/data change (an admin-form submission) rather than a 6-file-plus-3-runtime code change.
- **II. Scope Discipline** — PASS. No dissemination/identity/CAP-hub scope touched.
- **III. CAP v1.2 Compliance** — Not applicable; this feature only changes where `CapView.vue` sources its hazard-type *options list* from, not CAP message structure/validation.
- **IV. Data Quality & Normalization** — PASS, with an explicit scope boundary: this phase's severity computation change applies only to the frontend's `computeSeverity()` path (`src/utils/severity.js`); the two backend normalization runtimes (`supabase/functions/shared/normalize.ts`, `server/src/processors/normalizer.js`) keep their own independent hardcoded thresholds in this phase (spec.md Assumptions) — a deliberate, documented scope boundary, not an oversight.
- **V. Access Control & Auditability** — PASS. Registry writes are super_admin-only (a new, narrower tier than the usual super_admin/country_admin/org_admin — justified because hazard taxonomy is genuinely global, not tenant-scoped, unlike every other admin table in this app); every write goes through the standard `log_table_change()` audit trigger.
- **VI. Accessibility & Internationalization** — PASS, with an explicit task requirement: the new Hazard Taxonomy tab and its two forms (hazard type editor, threshold editor) must use the i18n system across all 7 locales, matching every other admin screen.
- **VII. Performance & Resilience by Design** — PASS. FR-011/SC-005 explicitly require a bundled-fallback UX when the registry is unreachable, consistent with this app's existing offline/degraded-mode philosophy (constitution Principle VII, TECHNICAL.md §13).
- **VIII. Simplicity & YAGNI** — PASS. No new Edge Function, no new external service, no new npm dependency; JSONB breakpoints array (research.md §1) chosen over a normalized breakpoints table specifically to avoid unneeded relational complexity for data that's always read/written as one unit.

## Project Structure

### Documentation (this feature)

```text
specs/010-hazard-taxonomy-admin/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── hazard-taxonomy-crud.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This feature extends the existing single Vue+Supabase project — no new project/service directory.

```text
supabase/
└── migrations/
    └── <ts>_hazard_taxonomy.sql   # hazard_types + hazard_thresholds tables, RLS, audit,
                                    # validate_hazard_breakpoints() trigger, seed data (data-model.md)

src/
├── stores/
│   └── hazardTypes.js             # new Pinia store: fetch/cache registry + thresholds,
│                                    # activeHazardTypes computed, computeSeverity() with
│                                    # bundled-SEVERITY_FN fallback (research.md §3-4)
├── utils/
│   └── severity.js                # computeSeverity() becomes a thin wrapper delegating to
│                                    # the store's breakpoint-evaluation logic; SEVERITY_FN's
│                                    # values move into the store as the bundled fallback,
│                                    # not deleted (still needed for FR-011)
├── components/admin/
│   ├── HazardTypeFormModal.vue     # new: create/edit a hazard type
│   └── HazardThresholdEditor.vue   # new: edit one hazard type's breakpoints
├── views/
│   └── AdminView.vue               # + "Hazard Taxonomy" tab (super_admin only)
└── (6 migrated call sites, FR-010):
    components/admin/ContactFormModal.vue
    components/admin/FileImportForm.vue
    components/admin/ManualEntryForm.vue
    components/admin/SourceFormModal.vue
    views/CapView.vue
    views/IncidentsView.vue

tests/unit/
└── hazardThresholdEvaluation.test.js  # pure breakpoint-evaluation function tests (research.md §5)
```

**Structure Decision**: Single existing Vue+Supabase project, extended in place — one new migration, one new store, two new small admin form components, one new admin tab, and 6 existing files updated to source their hazard-type list from the new store instead of a local constant. No new Edge Function (contracts/hazard-taxonomy-crud.md — plain RLS-gated CRUD, same as `data_sources`/`contacts`).

## Complexity Tracking

No new services, Edge Functions, or external dependencies are introduced — nothing to record here.
