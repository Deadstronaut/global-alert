---
description: "Task list for Hazard Taxonomy Hierarchy & Encyclopedia (spec 024)"
---

# Tasks: Hazard Taxonomy Hierarchy & Encyclopedia

**Input**: Design documents from `/specs/024-hazard-taxonomy-hierarchy/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/hazard-taxonomy-hierarchy.md, quickstart.md

**Tests**: Included — cycle detection is exactly the class of easy-to-get-subtly-wrong logic this
project test-firsts (matches `resolveThresholds`, `occupancyPercentage`, `formatIntegrationStatus`,
`detectParserType`).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260708000000_hazard_taxonomy_hierarchy.sql`: add nullable
  `parent_code TEXT REFERENCES hazard_types(code) ON DELETE SET NULL` column to `hazard_types`
  (additive `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`); no RLS policy changes (data-model.md)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The DB-level cycle-rejection trigger and its client-side mirror are required before
either user story's write path can be safely exercised.

**⚠️ CRITICAL**: Complete this phase before starting the user stories.

- [X] T002 In the same migration file, add `prevent_hazard_type_cycle()` trigger function
  (`BEFORE INSERT OR UPDATE OF parent_code ON hazard_types`) per data-model.md: NULL
  `parent_code` passes; `parent_code = code` raises `invalid_hazard_parent: a hazard type cannot
  be its own parent`; otherwise walks the parent chain via recursive CTE (depth cap 10) and raises
  `invalid_hazard_parent: assigning % as parent of % would create a cycle` if `NEW.code` appears
  in the chain
- [X] T003 [P] In `src/stores/hazardTypes.js`, add pure function `getChildren(hazardTypes, code)`
  (returns `hazardTypes.filter(h => h.parent_code === code)`)
- [X] T004 [P] In `src/stores/hazardTypes.js`, add pure function `wouldCreateCycle(hazardTypes,
  code, candidateParentCode)` mirroring the DB trigger's walk client-side (same depth cap),
  returning `true`/`false`
- [X] T005 [P] Create `tests/unit/hazardTaxonomyHierarchy.test.js` covering `getChildren()` (empty
  result, single child, multiple children) and `wouldCreateCycle()` (no parent → false,
  self-reference → true, direct cycle A↔B → true, transitive cycle A→B→C→A → true, valid
  non-cyclic assignment → false)

**Checkpoint**: Cycle-safety exists at both the DB and client layers, independently tested —
nothing in the UI uses it yet.

---

## Phase 3: User Story 1 - Super Admin defines a parent/child hazard relationship (Priority: P1) 🎯 MVP

**Goal**: A Super Admin can assign, change, or clear a hazard type's parent from the existing
admin taxonomy screen, with invalid assignments rejected clearly.

**Independent Test**: Open the hazard type edit form, assign a parent, save, and confirm the
taxonomy table shows the relationship; attempt a self-reference and a cycle and confirm both are
rejected with a clear error (quickstart.md Scenarios 1-4).

### Implementation for User Story 1

- [X] T006 [US1] In `src/components/admin/HazardTypeFormModal.vue`, add an optional "Parent Hazard
  Type" `<select>` populated from `store.hazardTypes` filtered to active types excluding the type
  currently being edited, with a "(none)" option mapping to `null`; call `wouldCreateCycle()`
  (T004) on change and show an inline error immediately if the selection would be invalid, without
  waiting for the server round trip
- [X] T007 [US1] In `src/components/admin/HazardTypeFormModal.vue`'s save handler, include
  `parent_code` in the payload passed to `updateHazardType()`/`createHazardType()` (both already
  accept an arbitrary payload object — no store function signature change needed)
- [X] T008 [US1] In `src/components/admin/HazardTaxonomyPanel.vue`'s existing table, add a column
  showing the parent's `display_name` (looked up from `store.hazardTypes` by `parent_code`) or an
  em-dash when unset
- [X] T009 [US1] Ensure the existing `try/catch` around `handleSaveType()` in
  `HazardTaxonomyPanel.vue` surfaces the DB trigger's `invalid_hazard_parent` error message
  through the existing `typeFormError` display (already generic — pattern-match only the existing
  `duplicate key` case is special-cased, so the new error type needs no special handling, just
  confirm it flows through as-is)

**Checkpoint**: User Story 1 fully functional — parent assignment works end-to-end with both
DB-level and client-level cycle rejection.

---

## Phase 4: User Story 2 - Any signed-in user browses the hazard encyclopedia (Priority: P2)

**Goal**: Any signed-in user, including a Viewer, can view every active hazard type's description,
category, parent/children relationships, and severity thresholds on a new read-only page.

**Independent Test**: Sign in as a Viewer, navigate to `/hazards`, and confirm every active hazard
type is listed with the required fields and no edit controls are present (quickstart.md Scenarios
5-6).

### Implementation for User Story 2

- [X] T010 [P] [US2] Create `src/components/admin/HazardEncyclopediaPanel.vue`: reads
  `store.activeHazardTypes`/`store.hazardTypes`/`store.thresholds` (no new fetch), renders one
  card per active hazard type showing `display_name`, `category`, `description`, parent (via
  `hazardTypes.find(h => h.code === parent_code)`, "Part of: {display_name}") if set, children (via
  `getChildren()`, T003, "Includes: ...") if any, and threshold breakpoints (via
  `store.thresholds[code]`, "{severity} — {metric_name} ≥ {min_value} {unit}") if configured —
  strictly read-only, no edit/create/deactivate controls
- [X] T011 [US2] Create `src/views/HazardEncyclopediaView.vue`: thin wrapper mounting
  `HazardEncyclopediaPanel.vue`, mirroring `src/views/ShelterInfoView.vue`'s pattern (spec 021)
- [X] T012 [US2] In `src/router/index.js`, add route `{ path: '/hazards', name: 'hazards',
  component: () => import('@/views/HazardEncyclopediaView.vue') }` with NO `meta.roles` (mirrors
  the existing `/shelters` route added in spec 021) — do NOT modify `/admin`'s route guard
- [X] T013 [US2] In `src/components/SidebarPanel.vue`, add a nav link to `/hazards` (mirrors spec
  021's "🏠 Sığınaklar" link pattern)

**Checkpoint**: User Story 2 fully functional and independently testable — the encyclopedia page
is reachable by every signed-in role including Viewer, entirely from cached data.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 [P] Add i18n coverage for all new user-facing text (parent dropdown label, "(none)"
  option, "Part of:"/"Includes:" labels, encyclopedia page title, threshold display labels) across
  all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T015 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T016 Run `npm run build` and confirm a clean build
- [X] T017 Validate quickstart.md Scenarios 1-6 against the live Supabase instance after the user
  applied `20260708000000_hazard_taxonomy_hierarchy.sql` (confirmed via `supabase migration list
  --linked`, and `parent_code` column + `trg_prevent_hazard_type_cycle` trigger both confirmed
  present via read-only queries). Scenarios 1-4 (valid parent assignment, self-reference
  rejection, cycle rejection, clearing a parent) verified directly against production data inside
  a `BEGIN; ... ROLLBACK;` transaction (temp-table-logged results, zero committed changes,
  re-verified afterward that `tsunami`/`flood`/`wildfire` all still show `parent_code = NULL`) —
  all 4 passed with the exact expected `invalid_hazard_parent` error messages. Scenarios 5-6
  (Viewer browsing `/hazards`, deactivated types excluded) require an actual browser session and
  were **not** exercised by the assistant — user should confirm these separately
- [X] T018 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Hazard Taxonomy Admin
  module's last 2 remaining items ("hiyerarşik hazard ilişkileri", "hazard ansiklopedisi UI'ı") are
  now closed — update completion percentage to 100%

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (cycle-safety must exist
  before either story's write/read path is exercised)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational only (does NOT depend on User Story 1 being
  UI-complete, since the encyclopedia reads whatever `parent_code` values already exist, even if
  none have been set yet — a flat list with no relationships shown is still a valid, correct
  rendering)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T003/T004/T005 (pure functions + their tests) can be scaffolded together, though T005 asserts
  against T003/T004's actual output
- User Story 1 (Phase 3) and User Story 2 (Phase 4) touch disjoint files and can be implemented in
  parallel once Phase 2 is complete
- T010 (encyclopedia panel) can start in parallel with Phase 3's tasks
- T014 (i18n) can run in parallel with T015/T016

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup (migration column)
2. Complete Phase 2: Foundational (cycle-rejection trigger + pure functions + tests)
3. Complete Phase 3: User Story 1 (parent assignment UI) — this alone closes the "hiyerarşik hazard
   ilişkileri" backlog item
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-4

### Incremental Delivery

5. Complete Phase 4: User Story 2 (encyclopedia page) — closes the "hazard ansiklopedisi UI'ı"
   backlog item, completing this module to 100%
6. **STOP and VALIDATE**: quickstart.md Scenarios 5-6
7. Complete Phase 5: Polish (i18n/docs/test/build verification)

---

## Notes

- Zero changes to existing RLS policies on `hazard_types`/`hazard_thresholds` — write
  authorization for the new `parent_code` field rides on the same policies already governing every
  other column
- Zero changes to `/admin`'s route guard — `/hazards` is a new, independent, unrestricted route
  (same precedent as `/shelters`, spec 021)
- Commit only when explicitly requested by the user
