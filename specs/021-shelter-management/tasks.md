---

description: "Task list for Shelter Management (spec 021)"
---

# Tasks: Shelter Management

**Input**: Design documents from `/specs/021-shelter-management/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/shelters.md,
quickstart.md

**Tests**: Included — `occupancyPercentage()`'s divide-by-zero/rounding behavior is exactly the
class of easy-to-get-subtly-wrong logic the constitution flags for test-first treatment, matching
the project's established pattern (`evaluateBreakpoints()` in spec 010, `resolveThresholds()` in
spec 020).

**Organization**: Tasks are grouped by user story (US1–US3) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707230000_shelters.sql` with a header comment describing scope (shelter registration/capacity/status management, spec 021, new additive table — no existing table modified)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `shelters` table, its RLS, and the pure occupancy function are shared by all
three user stories — nothing else can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 In the new migration, create `shelters` table per data-model.md: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `name TEXT NOT NULL`, `country_code VARCHAR(2) NOT NULL`, `org_id UUID REFERENCES organizations(id) ON DELETE SET NULL`, `lat DOUBLE PRECISION`, `lng DOUBLE PRECISION`, `capacity_total INTEGER NOT NULL`, `capacity_occupied INTEGER NOT NULL DEFAULT 0`, `status TEXT NOT NULL DEFAULT 'open'`, `is_active BOOLEAN NOT NULL DEFAULT true`, `linked_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL`, `created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL`, `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T003 In the same migration, add three CHECK constraints per data-model.md/research.md Decision 3: `chk_shelter_capacity_positive CHECK (capacity_total > 0)` (FR-003), `chk_shelter_capacity CHECK (capacity_occupied <= capacity_total)` (FR-002), `chk_shelter_status CHECK (status IN ('open','closed','full'))` (FR-001)
- [X] T004 In the same migration, attach the existing `set_updated_at()` trigger function (reuse, do not duplicate) via `BEFORE UPDATE`, and the existing `log_table_change()` audit trigger function via `AFTER INSERT OR UPDATE OR DELETE`, both matching the `contacts` table's own trigger wiring (spec 009)
- [X] T005 In the same migration, enable RLS and add five policies per data-model.md: `super_admin_shelters_all` (`current_profile_role() = 'super_admin'`, FOR ALL, any country), `country_scoped_shelters_select`/`_insert`/`_update` (`current_profile_role() IN ('country_admin','org_admin') AND country_code = current_profile_country_code()`, mirroring `contacts`' three-policy split — no DELETE policy for these roles, deactivate-only per FR-005), `authenticated_shelters_read` (`TO authenticated USING (is_active)`, SELECT only, system-wide per FR-008/research.md Decision 1) — `DROP POLICY IF EXISTS` + `CREATE POLICY`
- [X] T006 [P] Create `src/stores/shelters.js` with the pure `occupancyPercentage(shelter)` function per data-model.md (returns `Math.round((capacity_occupied / capacity_total) * 100)`, or `0` if `capacity_total` is falsy)
- [X] T007 [P] Create `tests/unit/shelterOccupancy.test.js` covering `occupancyPercentage()`: normal case (e.g. 40/100 → 40), full occupancy (100/100 → 100), zero occupancy (0/100 → 0), rounding (e.g. 33/100 → 33, 67/100 → 67), defensive zero-capacity fallback (`capacity_total: 0` → 0, no throw)

**Checkpoint**: The table, its RLS, and the tested occupancy function exist — nothing calls the
store's CRUD methods or renders any UI yet.

---

## Phase 3: User Story 1 - Admin registers and maintains a shelter's capacity and status (Priority: P1) 🎯 MVP

**Goal**: A Country Admin (or Org Admin/Super Admin) can register a shelter and keep its
occupancy/status current, with the database itself enforcing the capacity invariant.

**Independent Test**: Create a shelter, update its occupancy and status, confirm changes persist
immediately; attempt an invalid occupancy/capacity value and confirm rejection (quickstart.md
Scenarios 1–2).

### Implementation for User Story 1

- [X] T008 [US1] In `src/stores/shelters.js`, add `shelters` state (`ref([])`), `loading`/`error` refs, and `fetchShelters()` (`supabase.from('shelters').select('*').order('name')` — no `is_active` filter, following `contacts.js`'s exact shape, since RLS is the sole scoping authority and admins need inactive rows visible to reactivate them, per FR-005/I1 analysis finding)
- [X] T009 [US1] In `src/stores/shelters.js`, add `createShelter(payload)` (`supabase.from('shelters').insert(payload).select().single()`, pushes to local state on success, surfaces the DB CHECK-constraint error message on failure) and `updateShelter(id, payload)` (`.update(payload).eq('id', id).select().single()`, updates local state on success)
- [X] T010 [US1] In `src/stores/shelters.js`, add `deactivateShelter(id)` (`updateShelter(id, { is_active: false })`) and `reactivateShelter(id)` (`updateShelter(id, { is_active: true })`), matching `contacts.js`'s deactivate/reactivate pair (FR-005)
- [X] T011 [US1] Create `src/components/admin/ShelterFormModal.vue` mirroring `ContactFormModal.vue`'s shape: fields for name, country_code, optional org_id, lat/lng, capacity_total, capacity_occupied, status (select: open/closed/full); client-side hint (not the sole guard) that occupancy cannot exceed total capacity, surfacing the DB's rejection message if saved anyway
- [X] T012 [US1] Create `src/components/admin/SheltersPanel.vue` mirroring `ContactsPanel.vue`'s shape: list of shelters (name, country, capacity_total, capacity_occupied, status, occupancy % via `occupancyPercentage()`), `openCreate`/`openEdit`/`handleSave` pattern, deactivate/reactivate action per row (inactive rows rendered with a dimmed/`inactive` CSS class, matching `HazardTaxonomyPanel.vue`'s existing inactive-row styling, so admins can see and reactivate them — depends on T008 fetching inactive rows too)
- [X] T013 [US1] **Design correction found during implementation**: `/admin`'s route guard (`src/router/index.js`) hard-blocks `viewer` entirely (`meta.roles: ['super_admin','country_admin','org_admin']`), and this exclusion is explicitly tested/locked by `tests/unit/router.test.js` ("redirects a viewer away from /admin", spec 004 US1) — mounting `SheltersPanel.vue` as an `AdminView.vue` tab would make it unreachable to Viewer accounts, violating FR-008, and widening `/admin`'s allowed roles would regress a tested spec-004 guarantee. Fix: add a new route `/shelters` (`src/router/index.js`, no `meta.roles`, same shape as the existing viewer-reachable `/alerts/incidents`) rendering a new `src/views/ShelterInfoView.vue` that mounts `SheltersPanel.vue`; add a sidebar nav link (`src/components/SidebarPanel.vue`, alongside the existing "Olay Takip" link) so it's discoverable. `SheltersPanel.vue`'s own `canManage` computed (T014) already renders read-only for Viewer and full CRUD for super_admin/country_admin/org_admin on this same route — no separate AdminView.vue tab is needed.

**Checkpoint**: User Story 1 fully functional and independently testable — an admin can register
and maintain a shelter, with the database enforcing the capacity/status invariants.

---

## Phase 4: User Story 2 - Anyone can see current shelter capacity and status (Priority: P2)

**Goal**: Any signed-in user (any role, any country) can see all active shelters' capacity and
status, with no write controls available to non-admin roles.

**Independent Test**: As a Viewer account, confirm shelter list (including shelters from other
countries) is visible and no create/edit/deactivate controls are shown (quickstart.md Scenario 3).

### Implementation for User Story 2

- [X] T014 [US2] In `src/components/admin/SheltersPanel.vue`: (a) gate the create/edit/deactivate/reactivate controls behind `auth.isSuperAdmin || auth.session?.role === 'country_admin' || auth.session?.role === 'org_admin'` (NOT `auth.role`, which does not exist on the auth store — only `auth.session.role`, per I2 analysis finding); (b) for accounts without that access (viewer), display only active shelters (`store.shelters.filter(s => s.is_active)`) since inactive/deactivated shelters are an admin-management concern, not part of the public "current shelter availability" view (FR-008) — admins with write access continue to see both active and inactive rows (from T012)
- [X] T015 [US2] Confirm (by inspection, no code change expected) that `fetchShelters()` (T008) already returns all countries' active shelters for any authenticated caller — this is a direct consequence of `authenticated_shelters_read`'s system-wide `USING (is_active)` clause (T005) having no country filter, so no additional store logic is needed for this story

**Checkpoint**: Both User Stories 1–2 fully functional — admins manage their own country's
shelters, and every signed-in user (any role, any country) can see all active shelters.

---

## Phase 5: User Story 3 - Admin links a shelter to an active incident (Priority: P3)

**Goal**: An admin can associate a shelter with a specific incident, and that link clears
automatically (without touching the shelter itself) if the incident is later deleted.

**Independent Test**: Link a shelter to an open incident, confirm the link is visible; delete that
incident and confirm the shelter's link clears while the shelter record itself is unaffected
(quickstart.md Scenario 4).

### Implementation for User Story 3

- [X] T016 [US3] Add `linkIncident(shelterId, incidentId)` and `unlinkIncident(shelterId)` to `src/stores/shelters.js` (both thin wrappers around `updateShelter(shelterId, { linked_incident_id: incidentId })` / `updateShelter(shelterId, { linked_incident_id: null })`)
- [X] T017 [US3] In `src/components/admin/ShelterFormModal.vue`, add an optional incident selector (a simple dropdown of open incidents in the shelter's own country, fetched via the existing incidents store) that sets/clears `linked_incident_id` in the save payload
- [X] T018 [US3] In `src/components/admin/SheltersPanel.vue`, show the linked incident's title (if any) in each shelter row, reading from a joined/looked-up incident title (e.g. via a client-side lookup against the incidents store's already-fetched list, no new DB query needed)

**Checkpoint**: All three user stories independently functional — shelter registration/maintenance,
system-wide read visibility, and optional incident linkage.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T019 [P] Add i18n keys for the Shelters admin tab (tab label, field labels: name/country/org/location/capacity/occupancy/status, status option labels, incident-link labels, add/edit/deactivate/reactivate actions) to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T020 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T021 Run `npm run build` and confirm a clean build
- [ ] T022 Manually validate quickstart.md Scenarios 1–6 against a local/staging Supabase instance with the migration applied (registration, capacity/status invariants, system-wide read visibility, incident linkage, cross-country write rejection, deactivation) — **pending**: migration `20260707230000_shelters.sql` has not yet been applied to the live project; per standing project policy, migrations are never applied by the assistant — the user runs `npx supabase db query -f "supabase/migrations/20260707230000_shelters.sql" --linked` themselves, then this scenario validation can proceed
- [X] T023 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Dissemination module's remaining-gap line ("shelter management dashboard") is now closed — update completion percentage and describe what was and was not covered (map visualization and Public Alert Portal exposure remain out of scope — the latter explicitly left for the receiving customer to add, not an internal follow-up)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (table/RLS/pure function
  underpin everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational and User Story 1's `SheltersPanel.vue`/
  `fetchShelters()` existing (T012/T008) — it gates/confirms behavior on the same components
  rather than introducing new ones
- **User Story 3 (Phase 5)**: Depends on Foundational and User Story 1's `ShelterFormModal.vue`/
  `SheltersPanel.vue`/store existing (T009/T011/T012) — extends the same components
- **Polish (Phase 6)**: Depends on all user stories being complete

### Parallel Opportunities

- T006/T007 (pure function + its tests) can be scaffolded in parallel, though T007 asserts
  against T006's actual output
- T019 (i18n) can run in parallel with T020/T021

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (table + RLS + `occupancyPercentage()`)
3. Complete Phase 3: User Story 1 (admin registers and maintains a shelter)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–2 — registration works, capacity/status
   invariants are enforced by the database

### Incremental Delivery

1. Setup + Foundational → table/RLS/occupancy logic exist, nothing observable yet
2. Add User Story 1 → validate → admins can register and maintain shelters
3. Add User Story 2 → validate → any signed-in user sees all active shelters system-wide
4. Add User Story 3 → validate → shelters can be linked to incidents, link clears safely on
   incident deletion
5. Polish (i18n, docs, test/build verification, quickstart validation)

---

## Notes

- No changes to `contacts`, `incidents`, or any existing table/store — verified by design, since
  this feature adds a new table with only a nullable FK reference into `incidents` (`ON DELETE SET
  NULL`, no trigger or cascade added to `incidents` itself)
- Reuses `set_updated_at()`, `log_table_change()`, `current_profile_role()`,
  `current_profile_country_code()` — zero new SQL helper functions introduced
- Map visualization (shelter pins on the hazard map) and Public Alert Portal exposure are
  explicitly out of scope for this spec (spec.md Assumptions) — the latter is expected to be
  added by the receiving customer themselves, not planned as an internal follow-up
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete
- Commit only when explicitly requested by the user
