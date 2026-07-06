# Implementation Plan: Shelter Management

**Branch**: `021-shelter-management` | **Date**: 2026-07-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/021-shelter-management/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a new `shelters` entity so administrators can register and maintain shelter capacity,
occupancy, and status (open/closed/full), with an optional link to an incident. Every signed-in
user (any role) can view all active shelters system-wide — unlike this project's other
country-scoped entities, shelter availability is life-safety information rather than
administratively restricted data. The implementation mirrors spec 009's `contacts` entity almost
exactly (country/org-scoped CRUD, soft-delete, RLS pattern, audit/updated_at triggers), reusing
spec 011's `linked_cap_id`-on-`incidents` nullable-FK pattern for the shelter↔incident
association. Map visualization and Public Alert Portal exposure are explicitly out of scope for
this iteration (the latter is understood to be added by the receiving customer themselves, not
planned as an internal follow-up).

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API, `<script setup>`), PostgreSQL (Supabase)

**Primary Dependencies**: Vue 3, Pinia, vue-i18n, Supabase JS client; PostgreSQL RLS,
`current_profile_role()`/`current_profile_country_code()` helper functions (spec 004/010)

**Storage**: PostgreSQL via Supabase (new `shelters` table)

**Testing**: Vitest (`tests/unit/`) for the pure `occupancyPercentage()` function, matching the
project's existing pure-function-extraction test convention

**Target Platform**: Web (admin panel, existing `AdminView.vue` tab system)

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project type)

**Performance Goals**: N/A beyond existing admin-panel CRUD expectations (no new performance
envelope introduced)

**Constraints**: `capacity_occupied` MUST NOT exceed `capacity_total`, enforced at the database
level (not just client-side); `capacity_total` MUST be positive; shelter read access MUST be
system-wide for any authenticated user (not country-scoped, unlike every other entity following
the `contacts` pattern) — this is the one deliberate deviation from the reused pattern and is
called out explicitly below.

**Scale/Scope**: One new table, one new Pinia store, two new Vue components, one new admin tab,
one new pure function + its test, i18n keys across 7 locales.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: N/A — shelters are not a hazard type; no hazard
  taxonomy touched. PASS.
- **II. Scope Discipline**: No new dissemination channel, no external identity system, no CAP
  inbound ingestion introduced. PASS.
- **III. CAP v1.2 Compliance**: N/A — this feature does not touch CAP authoring/export. PASS.
- **IV. Data Quality & Normalization**: N/A — shelters are not an external disaster data source;
  no `DisasterEvent` normalization path is touched. PASS.
- **V. Access Control & Auditability**: Shelter CRUD is role/country-scoped via RLS reusing
  existing helper functions; the `audit_log` trigger (`log_table_change`, spec 007) is reused for
  every shelter mutation, matching every other admin entity. The system-wide read access for all
  authenticated roles is a deliberate, spec-driven exception (FR-008) — not a gap, since shelter
  availability is explicitly life-safety information the SRS requires be visible, not privileged
  data. PASS.
- **VI. Accessibility & Internationalization**: New UI text goes through the existing i18n system
  across all 7 locales, matching every prior admin-panel spec. PASS.
- **VII. Performance & Resilience by Design**: N/A — shelters are administrator-entered data, not
  a polled external source; no new polling interval or offline-cache concern introduced. PASS.
- **VIII. Simplicity & YAGNI**: No new service/framework/queue — a single additive Postgres table
  + RLS + a thin Pinia store + two Vue components, following the exact `contacts` (spec 009)
  precedent. PASS.

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/021-shelter-management/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260707230000_shelters.sql       # new: shelters table, RLS, triggers

src/stores/
└── shelters.js                       # new: CRUD store + occupancyPercentage() pure function

src/components/admin/
├── SheltersPanel.vue                 # new: list panel (mirrors ContactsPanel.vue)
└── ShelterFormModal.vue              # new: create/edit modal (mirrors ContactFormModal.vue)

src/views/
└── AdminView.vue                     # modified: new "Sığınaklar" tab

src/i18n/locales/
└── {tr,en,es,fr,ru,ar,zh}.json       # modified: new shelters.* keys

tests/unit/
└── shelterOccupancy.test.js          # new: occupancyPercentage() tests
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repository layout, no new
project/package). This feature follows the exact file layout precedent set by spec 009's
`contacts` entity — one migration, one store, one list panel + one form modal, one admin tab.

## Complexity Tracking

*No Constitution violations — table not applicable.*
