# Implementation Plan: Incident Tracking Completion

**Branch**: `011-incident-tracking-completion` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-incident-tracking-completion/spec.md`

## Summary

The `incidents` table, its state values, RLS policies, and audit trigger already exist
(`supabase/migrations/20260605120300_incidents.sql`), along with a working `IncidentsView.vue`.
This plan closes four concrete, previously-verified gaps: (1) the lifecycle state machine is
only enforced client-side, not at the database layer; (2) closing a monitored incident does not
require after-action notes despite MHEWS-FC-STM-04 mandating this; (3) the existing but unused
`sop_refs` JSONB column has no backing repository or admin UI; (4) the existing but unused
`linked_cap_id` column is never populated. The approach mirrors the guard-trigger pattern already
proven in spec 009 (`guard_dispatch_transition()`): a pure JS state-machine function mirrored 1:1
by a Postgres `BEFORE UPDATE` trigger, a new `sop_documents` table following the spec 010
`hazard_types` pattern, and additive UI changes to `IncidentsView.vue`, `AdminView.vue`, and
`CapView.vue`. No Edge Function is required — this is a pure DB + Vue feature.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API, `<script setup>`), SQL (PostgreSQL/Supabase)

**Primary Dependencies**: Vue 3, Pinia, vue-router, vue-i18n, Supabase JS client, Supabase Postgres (RLS, triggers)

**Storage**: PostgreSQL via Supabase — extends existing `incidents` table (new trigger only, no column removal), adds new `sop_documents` table

**Testing**: Vitest (frontend pure-function unit tests) — no Deno Edge Function involved, so no `Deno.test` needed for this feature

**Target Platform**: Web (existing Vue SPA), same admin/incident views already deployed

**Project Type**: Single Vue 3 + Supabase web application (existing repo structure, no new project)

**Performance Goals**: N/A beyond existing app expectations — this is low-volume admin/operational data (incidents, SOP documents), no new polling loops introduced

**Constraints**: Existing `incidents` table shape MUST NOT be broken (additive only); every migration MUST be idempotent (`DROP POLICY/TRIGGER IF EXISTS` before `CREATE`); only real RBAC roles (`super_admin`/`country_admin`/`org_admin`/`viewer`) may be referenced, no invented roles

**Scale/Scope**: 4 user stories, 1 new table, 1 new guard trigger, 1 new Pinia store, 2 new admin components, additive edits to 2 existing views, i18n for 7 locales

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: PASS. SOP documents are tagged by
  `hazard_type_code` referencing the spec 010 `hazard_types` registry (not a hardcoded enum),
  so adding a new hazard type automatically makes it available for SOP tagging with zero code
  changes.
- **Principle II (Scope Discipline)**: PASS. No new dissemination channel, no external identity
  federation, no inbound CAP ingestion introduced. "Create incident from broadcast CAP alert"
  only reads an already-broadcast CAP draft; it does not touch dissemination.
- **Principle III (CAP v1.2 Compliance)**: N/A for this spec — no CAP authoring/export logic is
  touched; Story 4 only reads existing broadcast CAP draft fields to pre-fill an incident.
- **Principle IV (Data Quality & Normalization)**: N/A — incidents are operator-authored records,
  not ingested disaster-event data; no normalization pipeline is affected.
- **Principle V (Access Control & Auditability)**: PASS. `sop_documents` reuses the same
  super_admin-only write / authenticated-read RLS pattern as `hazard_types` (spec 010). The new
  guard trigger and any SOP CRUD are covered by the existing generic `log_table_change()` audit
  trigger, extended to `sop_documents` exactly as it already covers `incidents`.
- **Principle VI (Accessibility & i18n)**: PASS. All new UI text (AAR prompt, SOP admin panel,
  "create incident from alert" action) will be added via vue-i18n keys across all 7 locales,
  following the spec 010 `add-hazard-taxonomy-i18n.cjs` generator-script pattern.
- **Principle VII (Performance & Resilience)**: N/A — no new polling; SOP list is loaded once via
  Pinia store like `hazardTypes.js`, with the same bundled/offline fallback approach not required
  here since SOPs are optional decorative content (empty list is a valid, harmless state).
- **Principle VIII (Simplicity & YAGNI)**: PASS. No new service/queue/Edge Function. The guard
  trigger reuses the exact pattern already proven for `dispatch_receipts` in spec 009. `sop_refs`
  JSONB on `incidents` is left untouched/unused rather than retrofitted, since a normalized
  `sop_documents` table looked up by `hazard_type` is simpler than trying to keep a denormalized
  JSONB array in sync — this is documented below as the one deliberate design deviation.

**Initial gate result**: PASS. No Complexity Tracking entries required — the one notable decision
(bypassing `sop_refs` in favor of a normalized table matched by hazard type) is a simplification,
not a violation, and is captured in the Complexity Tracking table for transparency.

**Post-Phase-1 re-check**: PASS, unchanged. `data-model.md` and `contracts/incident-lifecycle.md`
confirm the guard trigger, `sop_documents` table, and CAP-linked insert all stay within the
patterns validated above — no new principle exposure was introduced during design.

## Project Structure

### Documentation (this feature)

```text
specs/011-incident-tracking-completion/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (data contracts, no REST API)
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/migrations/
├── 20260707140000_incident_state_guard.sql   # NEW: guard trigger on incidents (status + AAR check)
└── 20260707140100_sop_documents.sql          # NEW: sop_documents table + RLS + audit trigger

src/utils/
└── incidentStateMachine.js                   # NEW: pure isValidIncidentTransition()/requiresAAR()

tests/unit/
└── incidentStateMachine.test.js              # NEW: Vitest coverage mirroring the DB guard 1:1

src/stores/
└── sopDocuments.js                           # NEW: Pinia store (fetch/create/update/deactivate)

src/components/admin/
├── SopDocumentFormModal.vue                  # NEW
└── SopRepositoryPanel.vue                    # NEW

src/views/
├── IncidentsView.vue                         # MODIFIED: AAR prompt on monitoring→closed, linked SOP list
├── AdminView.vue                             # MODIFIED: new super_admin-only "SOP Repository" tab
└── CapView.vue                               # MODIFIED: "create incident from this alert" action on broadcast drafts

scripts/
└── add-incident-tracking-i18n.cjs            # NEW: one-off i18n key injector (7 locales), same pattern as spec 010
```

**Structure Decision**: This is an extension of the existing single Vue 3 + Supabase application
(no separate frontend/backend split, no new project). All new files fit into the established
directory conventions (`supabase/migrations/`, `src/stores/`, `src/components/admin/`,
`src/utils/`, `tests/unit/`, `scripts/`) already used by specs 006–010.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `sop_refs` JSONB column on `incidents` is left unused rather than populated | A normalized `sop_documents` table matched by `hazard_type_code` gives one source of truth admins edit once, automatically reflected on every matching incident | Keeping `sop_refs` as a per-incident denormalized snapshot would require re-syncing every incident's JSONB whenever an SOP is edited/deactivated (Story 3, Edge Case: "SOP deactivated while displayed on several incidents" requires immediate disappearance, which a frozen per-incident snapshot cannot deliver) |
