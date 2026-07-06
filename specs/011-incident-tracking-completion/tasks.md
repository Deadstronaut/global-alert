---

description: "Task list for Incident Tracking Completion (spec 011)"
---

# Tasks: Incident Tracking Completion

**Input**: Design documents from `/specs/011-incident-tracking-completion/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/incident-lifecycle.md, quickstart.md

**Tests**: Included per constitution's Development Workflow & Quality Gates (state-machine logic is a non-negotiable test-first zone, consistent with specs 009/010).

**Organization**: Tasks are grouped by user story (US1–US4) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/unit/`, `supabase/migrations/`, `scripts/` at repository root.

---

## Phase 1: Setup

**Purpose**: Scaffold the two new migration files and the i18n generator script that later phases will fill in.

- [X] T001 Create `supabase/migrations/20260707140000_incident_state_guard.sql` with a header comment describing scope (FC-STM-04 guard trigger)
- [X] T002 [P] Create `supabase/migrations/20260707140100_sop_documents.sql` with a header comment describing scope (SOP repository table)
- [X] T003 [P] Create `scripts/add-incident-tracking-i18n.cjs` skeleton (locale-block object + write loop), copied from the `scripts/add-hazard-taxonomy-i18n.cjs` pattern

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The DB guard trigger and its pure-JS mirror are shared by both US1 and US2 — neither story can be completed or tested without them.

**⚠️ CRITICAL**: Complete this phase before starting US1 or US2.

- [X] T004 Implement `guard_incident_transition()` trigger function and `BEFORE UPDATE OF status ON incidents` trigger in `supabase/migrations/20260707140000_incident_state_guard.sql`, per the transition table in `data-model.md` (open→in_progress; in_progress→monitoring|closed; monitoring→closed requiring non-blank `post_event_notes`; closed→archived; archived terminal); idempotent via `DROP TRIGGER IF EXISTS` / `DROP FUNCTION IF EXISTS` before create
- [X] T005 [P] Implement `isValidIncidentTransition(from, to)` and `requiresAAR(from, to)` pure functions in `src/utils/incidentStateMachine.js`, logically mirroring T004's SQL conditions exactly
- [X] T006 [P] Write `tests/unit/incidentStateMachine.test.js` (Vitest) covering every row of the `data-model.md` transition table, the terminal `archived` state, the AAR requirement on `monitoring`→`closed`, and rejection of same-state no-ops (e.g. `open`→`open`)

**Checkpoint**: Guard trigger and pure-JS mirror complete and tested — US1 and US2 can now proceed.

---

## Phase 3: User Story 1 - Guaranteed incident lifecycle integrity (Priority: P1) 🎯 MVP

**Goal**: No client or integration can move an incident through an invalid lifecycle transition; only the DB-enforced allowed transitions succeed.

**Independent Test**: Bypass the UI (e.g. SQL editor) and attempt `open`→`archived` directly on a fresh incident — confirm rejection; confirm a valid transition (`open`→`in_progress`) still succeeds.

### Implementation for User Story 1

- [X] T007 [US1] In `src/views/IncidentsView.vue`, replace the hardcoded `TRANSITIONS` map with logic derived from `isValidIncidentTransition()` (imported from `src/utils/incidentStateMachine.js`), so the UI only ever offers buttons for transitions the DB will actually accept
- [X] T008 [US1] In `src/views/IncidentsView.vue`'s `transition()` error handling, detect and surface a distinct, specific message when the DB rejects with the `invalid_incident_transition` exception (FR-010), rather than a generic error string
- [X] T009 [US1] Manually verify `quickstart.md` Scenario 1 against a dev Supabase instance: confirm a bypassed invalid transition is rejected and a valid transition succeeds

**Checkpoint**: User Story 1 fully functional and independently testable — lifecycle integrity is DB-enforced.

---

## Phase 4: User Story 2 - Mandatory after-action reflection before closing (Priority: P1)

**Goal**: An incident cannot reach `closed` from `monitoring` without non-blank after-action notes recorded; those notes persist and display.

**Independent Test**: Attempt `monitoring`→`closed` with blank notes (rejected, both client-side and DB-side); supply notes and confirm the transition succeeds and notes are visible afterward.

### Implementation for User Story 2

- [X] T010 [US2] Add an after-action-notes textarea prompt to the transition UI in `src/views/IncidentsView.vue`, shown specifically when the target transition is `monitoring`→`closed` (using `requiresAAR()` from `incidentStateMachine.js`)
- [X] T011 [US2] Update `transition()` in `src/views/IncidentsView.vue` to include `post_event_notes` in the same update call when closing from `monitoring`, and to block client-side submission when the notes field is blank
- [X] T012 [US2] Extend the error handling from T008 to also surface a distinct message for the DB's `aar_required` exception (FR-010)
- [X] T013 [US2] Display `post_event_notes` permanently on the incident detail card in `src/views/IncidentsView.vue` whenever present (FR-003)
- [X] T014 [US2] Manually verify `quickstart.md` Scenario 2: blank-notes rejection (client and DB), successful close with notes, and notes visible on reopen

**Checkpoint**: User Stories 1 AND 2 both work independently — the incident lifecycle is fully DB-enforced including the AAR requirement.

---

## Phase 5: User Story 3 - Standard operating procedure guidance during an incident (Priority: P2)

**Goal**: Admins maintain hazard-tagged SOP documents; operators see the SOPs relevant to an incident's hazard type directly on that incident.

**Independent Test**: Create an SOP tagged `flood`; confirm it appears on a `flood` incident and not on an `earthquake` incident; deactivate it and confirm immediate disappearance; confirm non-super-admin roles cannot manage SOPs.

### Implementation for User Story 3

- [X] T015 [US3] Implement the `sop_documents` table in `supabase/migrations/20260707140100_sop_documents.sql`: `id` (UUID PK), `title` (TEXT NOT NULL), `hazard_type_code` (TEXT NOT NULL, FK → `hazard_types(code)`), `body_content` (TEXT), `reference_url` (TEXT), `is_active` (BOOLEAN NOT NULL DEFAULT true), `created_by` (UUID FK → `auth.users(id)` ON DELETE SET NULL), `created_at`/`updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- [X] T016 [US3] Add RLS policies to `sop_documents` in the same migration: `super_admin` `FOR ALL`; all authenticated roles `FOR SELECT USING (is_active = true)`; idempotent via `DROP POLICY IF EXISTS` before create
- [X] T017 [US3] Add the existing `set_updated_at()` trigger and the existing `log_table_change()` audit trigger to `sop_documents` in the same migration, idempotent via `DROP TRIGGER IF EXISTS` before create
- [X] T018 [US3] [P] Create `src/stores/sopDocuments.js` Pinia store: `fetchSopDocuments()`, `activeSopDocuments` computed, `sopsForHazardType(code)` helper, and `createSopDocument`/`updateSopDocument`/`deactivateSopDocument`/`reactivateSopDocument` actions, following the `src/stores/hazardTypes.js` pattern
- [X] T019 [US3] [P] Create `src/components/admin/SopDocumentFormModal.vue` (title input, hazard-type select sourced from `hazardTypesStore.activeHazardTypes`, body-content textarea, reference-url input, save/cancel), following `HazardTypeFormModal.vue`
- [X] T020 [US3] [P] Create `src/components/admin/SopRepositoryPanel.vue` (list of SOPs, "+ Add" button opening `SopDocumentFormModal`, deactivate/reactivate actions), following `HazardTaxonomyPanel.vue`
- [X] T021 [US3] Add a "📋 SOP Repository" tab to `src/views/AdminView.vue`, gated `v-if="auth.isSuperAdmin"`, rendering `SopRepositoryPanel`
- [X] T022 [US3] Wire `sopDocumentsStore.fetchSopDocuments()` into `src/App.vue`'s existing `onMounted`, alongside the existing `hazardTypesStore.fetchHazardTypes()` call
- [X] T023 [US3] Add a linked-procedures section to the incident detail card in `src/views/IncidentsView.vue`, computed from `sopDocumentsStore.activeSopDocuments` filtered to `hazard_type_code === incident.hazard_type`; per spec.md's Edge Cases ("hazard type used by an SOP later deactivated in the Hazard Taxonomy registry"), an incident whose `hazard_type` no longer matches any active taxonomy entry simply shows an empty linked-procedures list — not an error state
- [X] T024 [US3] Manually verify `quickstart.md` Scenario 3: SOP visible on matching incident, absent on non-matching incident, disappears immediately on deactivation, management blocked for non-super-admin

**Checkpoint**: All three of US1/US2/US3 independently functional.

---

## Phase 6: User Story 4 - Automatic incident creation from a broadcast alert (Priority: P3)

**Goal**: An operator can create a pre-filled, linked incident directly from a broadcast CAP alert in a single action.

**Independent Test**: From a broadcast CAP alert, trigger "create incident from this alert"; confirm pre-fill and link; confirm the action is unavailable for non-broadcast drafts.

### Implementation for User Story 4

- [X] T025 [US4] Add a "create incident from this alert" action to `src/views/CapView.vue`, visible only when the CAP draft's `status === 'broadcast'`
- [X] T026 [US4] Implement the insert in `src/views/CapView.vue` (or a shared composable): insert into `incidents` with `hazard_type`/`severity`/`area_desc` pre-filled from the CAP draft and `linked_cap_id` set to the draft's `id`, `status` defaulting to `'open'`
- [X] T027 [US4] Add a visible "View originating alert" reference on the incident detail card in `src/views/IncidentsView.vue` whenever `incident.linked_cap_id` is set
- [X] T028 [US4] Manually verify `quickstart.md` Scenario 4: pre-fill/link correctness from a broadcast draft, action unavailability for `draft`/`pending_approval` drafts, AND (FR-009 regression check) that attempting this creation flow against a CAP draft outside the user's own country/organization is still rejected by the existing, unmodified `incidents` RLS policies

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T029 [P] Populate `scripts/add-incident-tracking-i18n.cjs` with all new UI keys (SOP Repository tab/form, AAR prompt, "create incident from alert" action, linked-procedures section, "view originating alert" link) across all 7 locales (tr/en/es/fr/ru/ar/zh)
- [X] T030 Run `scripts/add-incident-tracking-i18n.cjs` and verify all 7 `src/i18n/locales/*.json` files updated correctly
- [X] T031 Run `npm run test` and confirm all existing and new Vitest tests pass with no regressions
- [X] T032 Run `npm run build` and confirm a clean build
- [X] T033 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt` with the new Incident Tracking completion percentage
- [X] T034 Manually verify `quickstart.md` Scenario 5: all new UI text renders correctly (no missing-key fallbacks) across all 7 locales, including correct Arabic RTL layout

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS User Story 1 and User Story 2 (both consume the guard trigger and its pure-JS mirror)
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) only
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) only; independent of User Story 1's tasks (different UI sections of the same file, no shared state)
- **User Story 3 (Phase 5)**: Depends on Setup (Phase 1, for its migration file) and on the existing `hazard_types` registry (spec 010) — does NOT depend on Phase 2's guard trigger, so it could be built in parallel with US1/US2 if staffed separately
- **User Story 4 (Phase 6)**: Depends on User Story 1/2's incident-detail-card structure being stable enough to add a reference link (T027 touches the same file as T013/T023) — sequence after US1–US3 to avoid file-conflict churn
- **Polish (Phase 7)**: Depends on all four user stories being complete

### Parallel Opportunities

- T002 and T003 (Setup) can run in parallel with T001
- T005 and T006 (Foundational) can run in parallel with each other once T004 is drafted (T006 needs T004's final logic to assert against, but can be scaffolded in parallel)
- T018, T019, T020 (US3 store + two components) can run in parallel — different files
- US3 (Phase 5) can be worked on in parallel with US1/US2 (Phases 3–4) by a different contributor, since it touches a different migration file and different Vue components (only T023's edit to `IncidentsView.vue` needs to land after T007/T013 to avoid merge conflicts in the same file)

---

## Parallel Example: Foundational + User Story 3

```bash
# Once Setup (Phase 1) is done, these can run in parallel:
Task: "Implement guard_incident_transition() trigger in supabase/migrations/20260707140000_incident_state_guard.sql"
Task: "Implement sop_documents table + RLS + triggers in supabase/migrations/20260707140100_sop_documents.sql"

# Within User Story 3, these three can run in parallel once the migration lands:
Task: "Create src/stores/sopDocuments.js Pinia store"
Task: "Create src/components/admin/SopDocumentFormModal.vue"
Task: "Create src/components/admin/SopRepositoryPanel.vue"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (guard trigger + pure-JS mirror + tests) — CRITICAL, blocks US1/US2
3. Complete Phase 3: User Story 1
4. Complete Phase 4: User Story 2
5. **STOP and VALIDATE**: run `quickstart.md` Scenarios 1–2 — this alone closes the module's single most-cited gap (MHEWS-FC-STM-04, DB-enforced lifecycle + AAR)

### Incremental Delivery

1. Setup + Foundational → guard trigger live
2. Add US1 → validate → lifecycle integrity now DB-enforced (MVP)
3. Add US2 → validate → AAR requirement now enforced
4. Add US3 → validate → SOP repository live
5. Add US4 → validate → CAP-to-incident convenience live
6. Polish (i18n, docs, test/build verification)

### Parallel Team Strategy

With two contributors: one takes Phases 2→3→4 (guard trigger + US1 + US2, all touching `incidents`/`IncidentsView.vue`), the other takes Phase 5 (US3, touching `sop_documents` + new admin components) in parallel; both converge before Phase 6 (US4) and Phase 7 (Polish).

---

## Notes

- [P] tasks = different files, no dependencies
- `sop_refs` JSONB column on `incidents` is intentionally left unused (see plan.md Complexity Tracking) — do not add tasks to populate it
- Migrations are provided as exact CLI commands to the user for manual application once implementation is complete, per this project's established practice (never applied directly by the assistant)
- Commit only when explicitly requested by the user, per this project's established practice
