# Tasks: Administration & Access Hardening

**Input**: Design documents from `specs/004-admin-access-hardening/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Included for the router guard and `suspend-user` (security-critical logic explicitly
called out in plan.md's Testing section); not included for pure UI-form edits, per Constitution's
"other code may follow lighter-weight testing at the author's discretion."

**Organization**: Tasks are grouped by user story (spec.md priorities: US1/US2/US3 = P1,
US4 = P2, US5 = P3). Each story is independently implementable and testable via the matching
`quickstart.md` section.

## Path Conventions

Existing single Vue 3 + Supabase project — no new top-level directories. Paths are exact,
repository-root-relative, as established in plan.md's Project Structure section.

---

## Phase 1: Setup

**Purpose**: No project initialization needed — existing codebase, existing migration directory,
existing Edge Function conventions. This phase is intentionally empty; proceed directly to the
user stories below.

---

## Phase 2: Foundational

**Purpose**: N/A for this feature — unlike a typical feature with shared blocking infrastructure,
each of the 5 gaps here is scoped to its own files (three independent migration files, one router
change, two Edge Function changes) with no single piece of infrastructure that blocks all 5
stories simultaneously. Each user story phase below is self-contained and can start immediately.

---

## Phase 3: User Story 1 - Unauthorized roles cannot reach the admin panel (Priority: P1) 🎯 MVP

**Goal**: A logged-in Viewer navigating directly to `/admin` is redirected before the component or
any admin-only data request ever runs; Country Admin/Org Admin/Super Admin are unaffected.

**Independent Test**: quickstart.md §2 — log in as each role, attempt `/admin`, inspect Network tab.

### Tests for User Story 1

- [X] T001 [P] [US1] Add a Vitest test file `tests/unit/router.test.js` covering: a Viewer session
      is redirected away from `/admin` before navigation resolves; Country Admin/Org Admin/
      Super Admin sessions reach `/admin` normally; a logged-out session is redirected to
      `/login` (existing behavior, must not regress) — per contracts/router-guard.md

### Implementation for User Story 1

- [X] T002 [US1] Add `meta: { roles: ['super_admin', 'country_admin', 'org_admin'] }` to the
      `/admin` route definition in `src/router/index.js` (contracts/router-guard.md)
- [X] T003 [US1] Extend the existing `router.beforeEach` guard in `src/router/index.js` to redirect
      to `{ name: 'home' }` when `to.meta.roles` is set and `auth.session?.role` is not included in
      it — inserted after the existing `isLoggedIn` check, before the final `return true`
      (contracts/router-guard.md). Depends on T002.

**Checkpoint**: User Story 1 fully functional — verify via quickstart.md §2 before proceeding.

---

## Phase 4: User Story 2 - Country and Org Admins can actually manage their own users (Priority: P1)

**Goal**: A Country Admin sees and can edit every profile within their country (role, org
assignment); an Org Admin sees and can edit only their own organization's Viewer accounts.

**Independent Test**: quickstart.md §3 — log in as Country Admin/Org Admin, verify Users tab
scope and edit capability; attempt a cross-country/cross-org edit and confirm denial.

### Implementation for User Story 2

- [X] T004 [P] [US2] Create migration `supabase/migrations/20260706130000_profiles_scoped_rls.sql`:
      add `current_profile_country_code()` and `current_profile_org_id()` as
      `SECURITY DEFINER STABLE` functions mirroring the existing `current_profile_role()` pattern
      (data-model.md, research.md §2)
- [X] T005 [US2] In the same migration file, add `country_admin_read_own_country_profiles` and
      `org_admin_read_own_org_profiles` SELECT policies on `profiles` using the helpers from T004
      (data-model.md). Depends on T004 (same file).
- [X] T006 [US2] In the same migration file, add `country_admin_update_own_country_profiles` and
      `org_admin_update_own_org_profiles` UPDATE policies on `profiles`, each with explicit
      `USING` AND `WITH CHECK` clauses constraining both the visible row and the resulting new row
      to the caller's allowed scope/target-role set (data-model.md, research.md §2 — note the
      `WITH CHECK` pitfall: it does NOT default from `USING` and must be written out separately).
      Depends on T005 (same file).
- [X] T007 [US2] Update `saveUser()` in `src/views/AdminView.vue` to also send `org_id` in its
      `.update({...})` call (currently only sends `role` and `country_code`)
- [X] T008 [US2] Add an editable `org_id` cell to the Users table row in `src/views/AdminView.vue`
      (next to the existing `country_code` inline-edit cell), and a read-only display of it in the
      non-editing state
- [X] T009 [US2] Restrict the role `<select>` in the Users table's inline editor in
      `src/views/AdminView.vue` (currently `v-for="r in ROLES"`, offering all 4 roles regardless of
      editor permission) to iterate the existing `creatableRoles` computed instead, so the UI never
      offers a role the editor isn't allowed to grant

**Checkpoint**: User Story 2 fully functional — verify via quickstart.md §3. T004–T006 (migration)
can proceed in parallel with T007–T009 (frontend) since they're different files; T007–T009 depend
on each other only insofar as they touch the same `<script setup>` block and template region.

---

## Phase 5: User Story 3 - Revoking access actually blocks login (Priority: P1)

**Goal**: An authorized admin can suspend an account (blocks login immediately, cuts off any
already-active session within ~5 minutes) and reactivate it later, as a distinct action from role
downgrade.

**Independent Test**: quickstart.md §4 — suspend a Viewer, confirm login rejected and in-flight
session loses data access; reactivate, confirm login works again; confirm self-suspend and
cross-scope suspend attempts are rejected.

### Tests for User Story 3

- [X] T010 [P] [US3] Add Deno tests covering: caller cannot target their own `id`; `country_admin`
      cannot suspend a `super_admin` or another `country_admin`; `org_admin` cannot suspend anyone
      outside their own `country_code`+`org_id`+`viewer`-role scope; valid in-scope suspends are
      allowed (contracts/suspend-user.md). Implemented as
      `supabase/functions/shared/suspendAuthorization.test.ts` against a pure
      `checkSuspendAuthorization()` helper extracted from the handler (mirrors this codebase's
      existing pattern of testing pure `shared/` logic rather than the `Deno.serve` handler
      itself — see `gdacsSplit.ts`/`.test.ts`), rather than
      `supabase/functions/suspend-user/index.test.ts` directly.

### Implementation for User Story 3

- [X] T011 [P] [US3] Create migration `supabase/migrations/20260706130100_profile_suspension.sql`:
      add `profiles.is_active BOOLEAN NOT NULL DEFAULT true` (data-model.md)
- [X] T012 [US3] In the same migration file, redefine `current_profile_role()` to
      `SELECT CASE WHEN is_active THEN role ELSE NULL END FROM profiles WHERE id = auth.uid()`
      (data-model.md, research.md §3). Depends on T011 (same file, same column referenced).
- [X] T013 [US3] Create `supabase/functions/suspend-user/index.ts` following `create-user/index.ts`'s
      existing structure (bearer-token → caller profile resolution via service-role client, CORS
      handling, JSON response helper): validate caller role, reject self-targeting, enforce the
      hierarchy rules from contracts/suspend-user.md, then on `action: 'suspend'` set
      `profiles.is_active = false` and call
      `admin.auth.admin.updateUserById(target_user_id, { ban_duration: '87600h' })`; on
      `action: 'reactivate'`, set `is_active = true` and `ban_duration: 'none'`. Depends on T012
      (needs `is_active` column to exist).
- [X] T014 [US3] Add `suspendUser(targetUserId)` and `reactivateUser(targetUserId)` functions to
      `src/stores/auth.js`, mirroring the existing `createUser()` function's
      `supabase.functions.invoke(...)` call pattern
- [X] T015 [US3] Add "Suspend"/"Reactivate" row-action buttons to the Users tab in
      `src/views/AdminView.vue`, alongside the existing "Revoke access" (🔒) button — both remain
      available as distinct actions (contracts/suspend-user.md). Depends on T014.

**Checkpoint**: User Story 3 fully functional — verify via quickstart.md §4.

---

## Phase 6: User Story 4 - New users set their own password via a secure invite (Priority: P2)

**Goal**: Provisioning a new account no longer requires the admin to choose a password; the new
user receives a secure, 48-hour-valid invite email and sets their own password.

**Independent Test**: quickstart.md §5 — provision an account without a password field, confirm
invite email + working "set password" link, confirm login with the self-chosen password.

### Implementation for User Story 4

- [X] T016 Document (rather than apply) the **Auth → Mailer OTP Expiry** setting as a
      per-deployment operational step, recommended default `172800` seconds / 48 hours
      (research.md §4, quickstart.md §0) — this platform is deployed per-country/per-tenant on
      separate Supabase projects, so this repository cannot set this value once on behalf of every
      current or future deployment; it is documented as guidance for whoever administers a given
      deployment's own project, not executed here as an action against a specific live project.
      Application code has no dependency on the exact number.
- [X] T017 [US4] Modify `supabase/functions/create-user/index.ts`: remove `password` from the
      request body type and its required-fields check; replace the
      `admin.auth.admin.createUser({ email, password, email_confirm: true, ... })` call with
      `admin.auth.admin.inviteUserByEmail(email, { data: country_code ? { country_code } :
      undefined })` (contracts/create-user-invite.md). All existing hierarchy-enforcement logic in
      this file is unchanged.
- [X] T018 [P] [US4] Update or add Deno tests for `create-user`'s request validation to reflect the
      removed `password` field and the new `inviteUserByEmail` call path. Implemented as
      `supabase/functions/shared/createUserAuthorization.test.ts` against a pure
      `resolveCreateUserScope()` helper extracted from the handler (same pattern as
      `suspendAuthorization.ts` — see T010's note).
- [X] T019 [US4] Remove the `password` parameter from `createUser()` in `src/stores/auth.js` (both
      its function signature and the body it sends to `supabase.functions.invoke('create-user', ...)`
- [X] T020 [US4] Remove the password input field (and its `userForm.value.password` binding) from
      the user-creation form in `src/views/AdminView.vue`

**Checkpoint**: User Story 4 fully functional — verify via quickstart.md §5. T016 is an
operational prerequisite for the 48-hour expiry to actually take effect but does not block writing
or merging T017–T020's code.

---

## Phase 7: User Story 5 - No hidden self-registration path (Priority: P3)

**Goal**: Self-registered signups can no longer set their own `country_code`, and no authenticated
user can self-assign `country_code`/`org_id` via the profile-update path; non-privileged
self-edits (e.g., `full_name`) remain allowed.

**Independent Test**: quickstart.md §6 — attempt a metadata-driven self-registration and a direct
self-update of `country_code`/`org_id`; confirm both are neutralized while `full_name` self-edit
still works.

### Implementation for User Story 5

- [X] T021 [P] [US5] Create migration `supabase/migrations/20260706130200_lock_self_registration.sql`:
      redefine `handle_new_user()` to insert `country_code = NULL` unconditionally, removing the
      `NEW.raw_user_meta_data->>'country_code'` read (data-model.md, research.md §5)
- [X] T022 [US5] In the same migration file, extend the existing `prevent_self_role_escalation()`
      trigger function with an additional guard: when a non-super_admin caller updates their OWN
      row (`OLD.id = auth.uid()`) and `NEW.country_code IS DISTINCT FROM OLD.country_code` or
      `NEW.org_id IS DISTINCT FROM OLD.org_id`, raise an exception — matching the existing
      role-change guard's style. This check must apply only when the caller is updating their own
      row (`users_update_own_profile`'s policy path); it must NOT fire when a Country/Org Admin
      updates a *different* user's row through the T006 scoped-admin policies, since those
      policies legitimately change `country_code`/`org_id` reassignments within their own scope
      (data-model.md, research.md §5). Depends on T021 (same file).

**Checkpoint**: User Story 5 fully functional — verify via quickstart.md §6.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T023 [P] Run the full `quickstart.md` validation pass (all 6 numbered sections) end-to-end
      after all 5 stories are implemented and their migrations applied — §1–§6's code paths are
      implemented and unit-tested; §0 (Mailer OTP Expiry) is a per-deployment operator setting
      documented, not applied by this repository (see T016); live-database migration application
      itself remains pending user go-ahead (same precedent as specs 001–003)
- [X] T024 [P] Run `npm run test` (10 passed) and
      `deno test --no-check --allow-net --allow-env supabase/functions/` (39 passed) to confirm zero
      regressions in existing suites (`sourceScope`, `validatePayload`, `sourceHealth`,
      `gdacsSplit`) plus the 17 new tests (`createUserAuthorization`, `suspendAuthorization`) and
      5 new Vitest router-guard tests; also ran `deno check` against all modified/new Edge
      Function files with zero new type errors
- [X] T025 Update `docs/iş planı istereler.txt` and `docs/PROJE_DURUMU.md` to reflect spec 004's
      completion, per this project's established documentation convention (see specs
      001–003 for the pattern)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** and **Foundational (Phase 2)**: both empty for this feature — no blocking
  shared infrastructure exists across all 5 stories.
- **User Stories (Phase 3–7)**: each is independent of the others (different files: router vs.
  three separate migration files vs. two different Edge Functions) and may be implemented in any
  order or in parallel.
- **Polish (Phase 8)**: depends on all 5 stories being complete.

### User Story Dependencies

- **US1 (P1)**: No dependency on any other story.
- **US2 (P1)**: No dependency on any other story.
- **US3 (P1)**: No dependency on any other story.
- **US4 (P2)**: No dependency on any other story.
- **US5 (P3)**: No hard dependency, but T022's trigger extension must be written with awareness of
  US2's T006 scoped-admin UPDATE policies (see T022's note) to avoid the two conflicting — this is
  a design-awareness note, not a sequencing requirement (T021/T022 can still be written before
  T004–T006 exist; the awareness matters at merge/test time, not implementation-order time).

### Within Each User Story

- Same-file migration tasks (T004→T005→T006; T011→T012; T021→T022) are sequential (same file).
- Tests, where included (T001, T010, T018), are written alongside/before their corresponding
  implementation tasks per this project's existing lightweight-testing convention.

### Parallel Opportunities

- All 5 user story phases (US1–US5) can be worked on in parallel by different contributors — they
  touch entirely disjoint files.
- Within US2: T004 (migration) and T007–T009 (frontend) are parallel; T004→T005→T006 within the
  migration are sequential.
- Within US3: T011 (migration) is parallel with T010 (test-writing); T013 depends on T012; T014→T015
  are sequential (auth.js before the buttons that call it).
- Within US4: T016 (ops task) is parallel with T017–T020 (code); T017→T019→T020 should land together
  since they're the same request-shape contract change.
- Within US5: T021→T022 sequential (same file).

---

## Parallel Example: User Stories 1–5 kickoff

```bash
# Once this tasks.md is approved, these can all start immediately in parallel:
Task: "US1 — router guard (T001-T003)"
Task: "US2 — profiles scoped RLS + frontend (T004-T009)"
Task: "US3 — suspension column, function, UI (T010-T015)"
Task: "US4 — invite-flow Edge Function + frontend (T016-T020)"
Task: "US5 — self-registration lockdown (T021-T022)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 3 (US1 — router guard).
2. **STOP and VALIDATE** via quickstart.md §2.
3. This alone closes the single most severe gap (unauthorized admin-panel entry) and can ship
   independently of the other 4 stories.

### Incremental Delivery

1. US1 (router guard) → validate → ship.
2. US2 (profiles RLS scoping) → validate → ship — the next most severe gap (broken, not just
   absent, country/org-scoped user management).
3. US3 (real suspension) → validate → ship.
4. US4 (invite onboarding) → validate → ship.
5. US5 (self-registration cleanup) → validate → ship — lowest severity, pure hardening/cleanup.

### Suggested Team Split (if parallelized)

- Contributor A: US1 + US5 (both small, router.js + two migration files)
- Contributor B: US2 (profiles RLS + frontend user-management UI)
- Contributor C: US3 (suspension column + new Edge Function + UI)
- Contributor D: US4 (invite-flow Edge Function change + UI)

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- [Story] labels map every implementation task to its spec.md user story for traceability.
- T016 is a documentation task, not a live-project action performed by this repository: since this
  platform is deployed per-country/per-tenant on separate Supabase projects, the Mailer OTP Expiry
  value cannot be set once here on behalf of every deployment — each deployment's own administrator
  configures it for their own project, using the 48-hour recommendation as a default, not a
  hardcoded requirement.
- Migration timestamps (`20260706130000`, `20260706130100`, `20260706130200`) follow the full
  `YYYYMMDDHHMMSS` convention adopted after this project's earlier same-date migration-collision
  incident (see docs/PROJE_DURUMU.md) — do not shorten these to date-only prefixes.
