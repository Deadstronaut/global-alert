# Implementation Plan: Hazard Taxonomy Hierarchy & Encyclopedia

**Branch**: `024-hazard-taxonomy-hierarchy` | **Date**: 2026-07-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/024-hazard-taxonomy-hierarchy/spec.md`

## Summary

Close the last two deferred Hazard Taxonomy Admin backlog items (spec 010/016/020): (1) an
optional single-parent hierarchy on the existing `hazard_types` registry, with DB-level
self-reference and cycle rejection; (2) a new read-only, Viewer-reachable "Hazard Encyclopedia"
page showing each active hazard type's description, category, parent/children, and existing
severity thresholds. Both are purely additive — no existing RLS policy, table, or route guard
changes.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API, `<script setup>`), PL/pgSQL (Postgres
migrations)

**Primary Dependencies**: Vue 3, Pinia, vue-router, vue-i18n, Supabase JS client, Supabase
Postgres (existing `hazard_types`/`hazard_thresholds` tables, existing `set_updated_at()`/
`log_table_change()` trigger functions)

**Storage**: PostgreSQL via Supabase — one additive column (`hazard_types.parent_code`) and one
new trigger function; no new tables.

**Testing**: Vitest (`tests/unit/`) — pure-function tests for cycle detection / parent-children
derivation, matching this project's established mock-free pure-function test convention.

**Target Platform**: Web (Vite-built SPA), same deployment as the rest of the app.

**Project Type**: Single Vue 3 + Supabase web application (existing repo structure, no new
project).

**Performance Goals**: Encyclopedia page renders from data already cached in
`src/stores/hazardTypes.js` at app boot — no additional network round trip beyond the existing
`fetchHazardTypes()` call.

**Constraints**: Zero changes to existing RLS policies on `hazard_types`/`hazard_thresholds`; zero
changes to `/admin`'s route guard (`meta.roles`); parent relationship must be single-parent
(tree), not multi-parent (DAG).

**Scale/Scope**: ~9-20 hazard types (9 seeded + admin additions) — no pagination/search needed.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-agnostic, model-driven design)**: PASS — this spec strengthens the
  model-driven registry (spec 010) by adding relational metadata to it, rather than hardcoding
  hazard relationships anywhere in code.
- **Security/RBAC**: PASS — parent-relationship writes stay behind the exact same
  `super_admin_hazard_types_all` RLS policy (and spec 018's `hazard_taxonomy` capability grant)
  already governing every other field on this table; no new write path is introduced.
- **Accessibility/i18n**: PASS — new UI text (encyclopedia page, parent dropdown, "(none)" option,
  relationship labels) will be added to all 7 locale files, matching every prior spec in this
  project.
- **Simplicity/YAGNI**: PASS — single-parent tree (not a general graph), no search/filter UI, no
  new tables — the smallest data-model change that satisfies the spec.
- **Testing**: PASS — cycle detection is exactly the class of easy-to-get-subtly-wrong logic this
  project already test-first's (matches `resolveThresholds`, `occupancyPercentage`, etc.).

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/024-hazard-taxonomy-hierarchy/
├── plan.md              # This file
├── research.md
├── data-model.md
├── contracts/
│   └── hazard-taxonomy-hierarchy.md
├── quickstart.md
└── tasks.md              # /speckit-tasks output (not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260708000000_hazard_taxonomy_hierarchy.sql   # new additive migration

src/stores/
└── hazardTypes.js               # add getChildren()/wouldCreateCycle() pure functions

src/components/admin/
├── HazardTypeFormModal.vue      # add optional parent dropdown
└── HazardTaxonomyPanel.vue      # add parent column to existing table
├── HazardEncyclopediaPanel.vue  # NEW — read-only encyclopedia content

src/views/
└── HazardEncyclopediaView.vue   # NEW — thin wrapper (mirrors ShelterInfoView.vue)

src/router/index.js              # add /hazards route, no meta.roles (mirrors /shelters)
src/components/SidebarPanel.vue  # add nav link to /hazards

src/i18n/locales/*.json          # 7 files, new keys for parent field + encyclopedia page

tests/unit/
└── hazardTaxonomyHierarchy.test.js   # NEW — cycle detection / children derivation tests
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repo layout, no new
project/module boundary). Follows the exact file-placement precedent set by spec 020 (admin
panel extension) and spec 021 (new Viewer-reachable route + view + sidebar link).

## Complexity Tracking

*No entries — no Constitution Check violations.*
