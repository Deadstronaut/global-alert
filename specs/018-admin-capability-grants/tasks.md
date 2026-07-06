---

description: "Task list for Admin Panel Capability Grants (spec 018)"
---

# Tasks: Admin Panel Capability Grants

**Input**: Design documents from `/specs/018-admin-capability-grants/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/capability-grants.md,
quickstart.md

**Tests**: Not included — per plan.md's Testing section, this project has no precedent for
RLS-policy-level automated tests; this feature is pure SQL policy + a thin frontend wire-up with no
new pure-function business logic. Validated via quickstart.md scenarios + existing `npm run test`/
`npm run build` regression checks instead.

**Organization**: Tasks are grouped by user story (US1–US3) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707200000_profile_capability_grants.sql` with a header comment describing scope (additive capability-grant layer, spec 018, does not modify any existing RLS policy or `current_profile_role()`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `profile_capability_grants` table, its guard trigger, and the
`current_profile_has_capability()` helper are shared by all three user stories — nothing else in
this feature can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 In the new migration, create `profile_capability_grants` table per data-model.md: `profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE`, `capability TEXT NOT NULL CHECK (capability IN ('hazard_taxonomy','sop_repository','map_layers','audit'))`, `granted_by UUID NOT NULL REFERENCES profiles(id)`, `granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `PRIMARY KEY (profile_id, capability)` — idempotent (`CREATE TABLE IF NOT EXISTS`)
- [X] T003 In the same migration, create a `BEFORE INSERT` trigger function (e.g. `prevent_invalid_capability_grantee()`) that raises an exception unless `NEW.profile_id`'s current `profiles.role IN ('country_admin', 'org_admin')` (research.md Decision 4, mirrors `prevent_self_role_escalation()`'s existing style) — `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`
- [X] T004 In the same migration, create `current_profile_has_capability(cap TEXT) RETURNS BOOLEAN` as `SECURITY DEFINER STABLE`, mirroring `current_profile_role()`'s suspension short-circuit (returns `false` when the caller's `profiles.is_active = false`, per research.md Decision 2) — `CREATE OR REPLACE FUNCTION`, does not modify `current_profile_role()` itself
- [X] T005 In the same migration, add RLS policies on `profile_capability_grants` itself (data-model.md): `super_admin_capability_grants_all` (`current_profile_role() = 'super_admin'` may INSERT/SELECT/DELETE) and `self_read_own_capability_grants` (`profile_id = auth.uid()` may SELECT) — `DROP POLICY IF EXISTS` + `CREATE POLICY` per project convention; enable RLS on the table

**Checkpoint**: The table, trigger, helper function, and its own RLS exist and are internally
consistent — no covered table's access has changed yet, nothing calls the helper function yet.

---

## Phase 3: User Story 1 - Super Admin grants a single admin capability to a Country/Org Admin (Priority: P1) 🎯 MVP

**Goal**: A Super Admin can grant any of the 4 capabilities to a Country/Org Admin user, and that
user immediately gains the same access to that specific admin area that Super Admin already has.

**Independent Test**: Grant "Hazard Taxonomy" to a Country Admin test user (quickstart.md Scenario
1); confirm they can now use that tab exactly as Super Admin could, while the other 3 tabs stay
hidden.

### Implementation for User Story 1

- [X] T006 [US1] In the migration, add additive RLS policies granting `current_profile_has_capability('hazard_taxonomy')` the same CRUD as the existing `super_admin_hazard_types_all`/`super_admin_hazard_thresholds_all` policies on `hazard_types` and `hazard_thresholds` (data-model.md) — new policy names (e.g. `capability_granted_hazard_taxonomy_all`, `capability_granted_hazard_thresholds_all`), existing policies untouched
- [X] T007 [US1] In the migration, add an additive RLS policy granting `current_profile_has_capability('sop_repository')` the same CRUD as the existing `super_admin_sop_documents_all` policy on `sop_documents` — new policy name (e.g. `capability_granted_sop_repository_all`), existing policy untouched
- [X] T008 [US1] In the migration, add an additive RLS policy granting `current_profile_has_capability('map_layers')` the same CRUD as the existing `super_admin_map_layers_all` policy on `map_layers` — new policy name (e.g. `capability_granted_map_layers_all`), existing policy untouched
- [X] T009 [US1] In the migration, add an additive, read-only RLS policy granting `current_profile_has_capability('audit')` the same SELECT as the existing `super_admin_read_audit` policy on `audit_log` — new policy name (e.g. `capability_granted_audit_read`), existing policy untouched
- [X] T010 [US1] In `src/stores/auth.js`, extend the existing profile-load step to also `SELECT capability FROM profile_capability_grants WHERE profile_id = auth.uid()` and store the result as `session.value.capabilities` (a string array, `[]` if none) alongside the existing `role`/`country_code`/`org_id`/`region_code` fields
- [X] T011 [US1] In `src/views/AdminView.vue`, extend each of the 4 admin tab `v-if` guards (hazardTaxonomy, sopRepository, mapLayers, audit — currently `auth.isSuperAdmin` only) to `auth.isSuperAdmin || auth.session?.capabilities?.includes('<capability-name>')`, one capability name per tab per data-model.md's mapping
- [X] T012 [US1] In `src/views/AdminView.vue`'s user list (Super Admin view only), add a grant control (e.g. 4 checkboxes/toggles) per `country_admin`/`org_admin` row that performs `supabase.from('profile_capability_grants').insert({ profile_id, capability, granted_by: <current user id> })` per contracts/capability-grants.md — use `.upsert(..., { onConflict: 'profile_id,capability', ignoreDuplicates: true })` or equivalent so granting an already-granted capability is a no-op, not an error

**Checkpoint**: User Story 1 fully functional and independently testable — a Super Admin can grant
any of the 4 capabilities and the grantee immediately gains matching access; grants are visible
only through direct manipulation so far (no revoke UI, no at-a-glance list yet).

---

## Phase 4: User Story 2 - Super Admin revokes a previously granted capability (Priority: P1)

**Goal**: A Super Admin can turn off a previously granted capability, immediately removing the
corresponding access.

**Independent Test**: Revoke a previously granted capability (quickstart.md Scenario 2); confirm
the tab disappears and direct writes to the underlying table are rejected.

### Implementation for User Story 2

- [X] T013 [US2] In `src/views/AdminView.vue`, wire the same 4 toggles added in T012 to also handle the "off" state: `supabase.from('profile_capability_grants').delete().eq('profile_id', profile_id).eq('capability', capability)` per contracts/capability-grants.md (idempotent — deleting a non-existent grant is a no-op)

**Checkpoint**: Both grant and revoke are fully functional — Super Admin has complete control over
each of the 4 capabilities per user, independently of one another.

---

## Phase 5: User Story 3 - Super Admin sees which capabilities each user currently holds (Priority: P2)

**Goal**: The user list shows, per Country/Org Admin row, which of the 4 capabilities are currently
active, without opening a separate screen.

**Independent Test**: View the user list as Super Admin and confirm a test user's granted/ungranted
capabilities are visibly distinguishable at a glance (quickstart.md scenario, US3 acceptance
criteria).

### Implementation for User Story 3

- [X] T014 [US3] In `src/views/AdminView.vue`, fetch all `profile_capability_grants` rows once (Super Admin can SELECT all per contracts/capability-grants.md) alongside the existing user list load, and reflect each user's current grants as the toggle states added in T012/T013 (on/off, reflecting actual DB state rather than only tracking local UI state) — this task makes the toggles in T012/T013 accurately reflect ground truth on page load/refresh, not just after a local toggle action

**Checkpoint**: All three user stories independently functional — grant, revoke, and at-a-glance
visibility all work together on the same user list UI.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T015 [P] Add i18n keys for the 4 capability labels and the grant/revoke toggle UI (e.g. `admin.capabilities.hazardTaxonomy`, `admin.capabilities.sopRepository`, `admin.capabilities.mapLayers`, `admin.capabilities.audit`, `admin.capabilities.grantedLabel`) to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T016 Run `npm run test` and confirm all existing tests still pass with no regressions (no new automated tests are added for this feature, per plan.md)
- [X] T017 Run `npm run build` and confirm a clean build
- [X] T018 Validated against the live Supabase project via read-only/reversible REST checks (2026-07-06): `profile_capability_grants` table exists (HTTP 200 on SELECT); `prevent_invalid_capability_grantee()` trigger correctly rejects a grant targeting the only existing live profile (a super_admin), proving Scenario 4's rejection logic works; `current_profile_has_capability()` RPC is live and callable; an `anon`-key write attempt was rejected. Full Scenarios 1–3 (grant to a real country_admin/org_admin, log in as them, confirm tab visibility) could NOT be executed — the live project currently has exactly one profile (the super_admin) and no country_admin/org_admin test account to grant to. No test data was left behind (the only write attempts were rejected by the trigger, nothing to clean up).
- [X] T019 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Administration & Access module's remaining-gap line ("custom permissions, roller sabit 4 kademe") is now addressed via this scoped capability-grant mechanism — update completion percentage and describe what was and was not covered (full configurable-permission redesign remains explicitly out of scope, per spec.md Assumptions)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (table/trigger/helper
  function underpin everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational; T013 additionally depends on T012's toggle UI
  existing (same control, extended)
- **User Story 3 (Phase 5)**: Depends on Foundational; T014 additionally depends on T012/T013 (same
  toggle UI, made to reflect real DB state)
- **Polish (Phase 6)**: Depends on all user stories being complete

### Parallel Opportunities

- T006/T007/T008/T009 (the 4 covered-table policy additions) can be written in parallel within the
  same migration file (independent tables, no shared state)
- T015 (i18n) can run in parallel with T016/T017/T018

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (table + trigger + helper function + its own RLS)
3. Complete Phase 3: User Story 1 (grant + immediate effective access)
4. **STOP and VALIDATE**: quickstart.md Scenario 1 — a granted capability works end-to-end with
   zero access to the other 3 areas

### Incremental Delivery

1. Setup + Foundational → grant infrastructure exists, nothing observable yet
2. Add User Story 1 → validate → grants work, access is real (not just UI)
3. Add User Story 2 → validate → revoke works, symmetric to grant
4. Add User Story 3 → validate → user list shows ground truth at a glance
5. Polish (i18n, docs, test/build verification, quickstart validation)

---

## Notes

- No changes to `profiles.role`, `current_profile_role()`, or any of the ~50+ pre-existing
  role-keyed RLS policies — verified by codebase audit before this spec was written
- `profile_capability_grants` reuses the project's existing suspension choke point
  (`current_profile_has_capability()` returns `false` for `is_active = false` users, same as
  `current_profile_role()`) — no separate suspension handling needed
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete
- Commit only when explicitly requested by the user
