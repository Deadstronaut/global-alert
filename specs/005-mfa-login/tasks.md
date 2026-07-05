# Tasks: Multi-Factor Authentication (MFA) for Login

**Input**: Design documents from `specs/005-mfa-login/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md — all present

**Tests**: Included for pure/security-relevant logic (AAL-gating decisions, recovery-code
authorization), following the same convention established in spec 004 (test pure `shared/`/store
logic, not full network round-trips).

**Organization**: Tasks are grouped by user story (spec.md priorities: US1/US2 = P1, US3 = P2,
US4 = P3).

## Path Conventions

Existing single Vue 3 + Supabase project — no new top-level directories.

---

## Phase 1: Setup

No project initialization needed — existing codebase, existing migration/Edge Function/i18n
conventions. Proceed directly to Foundational.

---

## Phase 2: Foundational

**Purpose**: Blocking prerequisite for US1, US3, and US4 — the new tables all three depend on.
US2 (login challenge) does not depend on this phase and can be built in parallel.

**⚠️ CRITICAL**: US1, US3, US4 cannot start until this phase is complete.

- [X] T001 Create migration `supabase/migrations/20260706140000_mfa_recovery_and_policy.sql`:
      `mfa_recovery_codes` table (`id`, `user_id` FK to `auth.users`, `code_hash`, `used_at`,
      `created_at`) with RLS allowing a user to `SELECT`/`INSERT` only their own rows (INSERT is
      needed client-side at enrollment time to store the freshly generated, hashed codes — see
      research.md §3/data-model.md), and no `UPDATE`/`DELETE` policy for regular users (only the
      `verify-recovery-code` Edge Function, service role, may mark a row used)
- [X] T002 In the same migration file, add `mfa_role_policy` table (`role` PK CHECK-constrained to
      the 4 existing roles, `required` boolean default `false`, `updated_at`), seed all 4 roles at
      `required = false` (data-model.md), with RLS allowing any authenticated user to `SELECT` and
      only `super_admin` (via `current_profile_role()`) to `UPDATE`. Depends on T001 (same file).
- [X] T003 In the same migration file, add a `SECURITY DEFINER` function `log_mfa_event(action
      TEXT)` that inserts one row into the existing `audit_log` table (`table_name: 'auth.mfa_factors'`,
      `action`, `record_id: auth.uid()`, `changed_by: auth.uid()`) — needed because TOTP
      enrollment/removal happens inside Supabase's own internal `auth.mfa_factors` table, which
      has no local trigger this app can attach to (research.md §5). Depends on T001 (same file).
      Attach the existing generic `log_table_change()` trigger to `mfa_recovery_codes` itself
      (covers recovery-code generation/use automatically, no new code needed for that half).

**Checkpoint**: Foundational tables ready — US1, US3, US4 may now proceed (in parallel with each
other and with US2).

---

## Phase 3: User Story 1 - A user enrolls an authenticator app as a second factor (Priority: P1) 🎯 MVP

**Goal**: Any role can reach a self-service page, enroll a TOTP factor, and receive one-time
recovery codes — independent of `/admin` access.

**Independent Test**: quickstart.md §2.

### Implementation for User Story 1

- [X] T004 [US1] Add `mfaEnroll()`, `mfaListFactors()`, and `mfaUnenroll(factorId)` functions to
      `src/stores/auth.js`, thin wrappers around `supabase.auth.mfa.enroll/listFactors/unenroll`
      (research.md §1)
- [X] T005 [US1] Add `generateAndStoreRecoveryCodes(userId)` to `src/stores/auth.js`: generate 10
      random codes client-side, hash each (Web Crypto `SubtleCrypto.digest`), delete any prior
      unused rows for this user, insert the 10 new hashed rows into `mfa_recovery_codes` via the
      authenticated client (allowed by T001's INSERT policy), and return the **plaintext** codes
      to the caller for one-time display — never stored or logged in plaintext anywhere
      (data-model.md, spec FR-005)
- [X] T006 [US1] Create `src/views/AccountSecurityView.vue` (new): enrollment flow — start
      (`mfaEnroll()`, show QR/secret), confirm (`supabase.auth.mfa.verify()` with the enroll
      response's `factorId`/a fresh challenge and the user-entered code), on success call
      `generateAndStoreRecoveryCodes()` and display the 10 codes once with a clear "save these now,
      you won't see them again" warning (spec FR-002, FR-005, US1 acceptance scenarios 1-3)
- [X] T007 [US1] Add `/account-security` route in `src/router/index.js` — no `meta.roles`
      restriction, reachable by every authenticated role regardless of `/admin` access (spec 004's
      guard is unaffected; this is a distinct route) (contracts/login-mfa-flow.md)
- [X] T008 [US1] In `AccountSecurityView.vue`, add active-factor display and a "remove" button
      calling `mfaUnenroll()` (spec US1 acceptance scenario 4) and `log_mfa_event('unenroll')` /
      `log_mfa_event('enroll')` (via an RPC call) on each respective success (T003)
- [X] T009 [P] [US1] Add i18n keys for all new `AccountSecurityView.vue` text to
      `src/i18n/locales/*.json` (all 7 locales) — Constitution Principle VI requires new UI to use
      the i18n system from the start, unlike `AdminView.vue`'s grandfathered hardcoded-Turkish gap
      (plan.md's Constitution Check note)

**Checkpoint**: User Story 1 fully functional — verify via quickstart.md §2.

---

## Phase 4: User Story 2 - Login requires the second factor once enrolled (Priority: P1)

**Goal**: A password-correct login for an enrolled user is not treated as complete until a valid
TOTP (or recovery) code is also supplied, enforced on every navigation, not just at the login
form.

**Independent Test**: quickstart.md §3.

### Tests for User Story 2

- [X] T010 [P] [US2] Add a Vitest test in `tests/unit/router.test.js` (extending spec 004's file)
      for the AAL-gating branch of `authGuard`: a session at `aal1` with `nextLevel: 'aal2'` is
      redirected to `mfa-challenge` for any route other than the challenge screen itself; a
      session already at `aal2` (or with no second factor at all) is unaffected

### Implementation for User Story 2

- [X] T011 [US2] Extend `login(email, password)` in `src/stores/auth.js`: after
      `signInWithPassword` succeeds, call `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; if
      `currentLevel === 'aal1' && nextLevel === 'aal2'`, return `{ mfaPending: true }` instead of
      calling `loadProfile()` (contracts/login-mfa-flow.md)
- [X] T012 [US2] Add `verifyMfaChallenge(factorId, code)` to `src/stores/auth.js`:
      `mfa.challenge()` + `mfa.verify()`, then `loadProfile()` on success (contracts/login-mfa-flow.md)
- [X] T013 [US2] Update `src/views/LoginView.vue`: when `login()` resolves `{ mfaPending: true }`,
      render a code-entry step (with an incorrect-code error message) calling
      `verifyMfaChallenge()` instead of navigating to the app; add a "use a recovery code instead"
      link (wired up fully in US3)
- [X] T014 [US2] Add `/mfa-challenge` route in `src/router/index.js` — no `meta.roles`, reachable
      only by an in-progress (aal1-pending-aal2) session
- [X] T015 [US2] Extend `authGuard` in `src/router/index.js`: after the existing spec-004 role
      check, call `getAuthenticatorAssuranceLevel()` and redirect to `mfa-challenge` when pending
      (contracts/login-mfa-flow.md). Depends on T014.
- [X] T016 [P] [US2] Add i18n keys for `LoginView.vue`'s new challenge step to
      `src/i18n/locales/*.json`

**Checkpoint**: User Story 2 fully functional — verify via quickstart.md §3. Combined with US1,
this is the feature's MVP (enroll + enforce).

---

## Phase 5: User Story 3 - Recovering access after losing the authenticator device (Priority: P2)

**Goal**: A valid, unused recovery code substitutes for a TOTP code at the challenge step exactly
once, and the user is guided to re-enroll afterward.

**Independent Test**: quickstart.md §4.

### Tests for User Story 3

- [X] T017 [P] [US3] Add Deno tests for `verify-recovery-code`'s suspension check and
      already-used-code rejection as pure/isolable logic (mirror spec 004's
      `suspendAuthorization.ts` pattern — extract the "is this account allowed to use a recovery
      code right now" check into a small pure function separate from the Supabase calls)

### Implementation for User Story 3

- [X] T018 [US3] Create `supabase/functions/verify-recovery-code/index.ts` (contracts/verify-recovery-code.md):
      resolve caller, reject if `profiles.is_active = false` (spec FR-010), hash the submitted
      code, look up an unused matching row, mark it used, then
      `admin.auth.mfa.deleteFactor()` the caller's active TOTP factor. Depends on T001, T017.
- [X] T019 [US3] Add `verifyRecoveryCode(code)` to `src/stores/auth.js`: invoke
      `verify-recovery-code`, then `loadProfile()` on success (session settles at `aal1`, per
      research.md §3)
- [X] T020 [US3] Wire the "use a recovery code instead" link in `LoginView.vue` (added in T013) to
      call `verifyRecoveryCode()` and handle its error/success paths
- [X] T021 [US3] In `AccountSecurityView.vue`, detect "no active factor but recovery-code history
      exists" (a `mfa_recovery_codes` row with non-null `used_at` for this user, and
      `listFactors()` returns none) and show a persistent "please re-enroll" banner (spec US3
      acceptance scenario 4)

**Checkpoint**: User Story 3 fully functional — verify via quickstart.md §4.

---

## Phase 6: User Story 4 - Per-role, per-deployment MFA policy (Priority: P3)

**Goal**: A deployment can flip a role's MFA requirement via a database update alone (no code
change), and an unenrolled user of a required role is guided into enrollment rather than let
through.

**Independent Test**: quickstart.md §5.

### Tests for User Story 4

- [X] T022 [P] [US4] Add a Vitest test for `isMfaRequiredForRoleButUnenrolled()`'s decision logic
      (role has `required = true` AND no active factor → `true`; otherwise `false`)

### Implementation for User Story 4

- [X] T023 [US4] Add `isMfaRequiredForRoleButUnenrolled()` to `src/stores/auth.js`: looks up
      `mfa_role_policy` for the session's role, cross-references `mfa.listFactors()`
      (contracts/login-mfa-flow.md). Depends on T002.
- [X] T024 [US4] Extend `authGuard` in `src/router/index.js` to redirect to `account-security` when
      `isMfaRequiredForRoleButUnenrolled()` is true and the target isn't already that route.
      Depends on T007, T015, T023.
- [X] T025 [US4] In `AccountSecurityView.vue`, block (or require enrolling a replacement before
      allowing) removal of a user's only active factor when their role's policy requires MFA (spec
      US4 acceptance scenario 3). Depends on T008, T023.

**Checkpoint**: All 4 user stories independently functional — verify via quickstart.md §5.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T026 [P] Run the full `quickstart.md` validation pass (all 6 sections) end-to-end
- [X] T027 [P] Run `npm run test` and `deno test --no-check --allow-net --allow-env supabase/functions/`
      to confirm zero regressions in every existing suite (specs 001–004's tests) plus this
      feature's new ones
- [X] T028 Update `docs/iş planı istereler.txt` and `docs/PROJE_DURUMU.md` to reflect spec 005's
      completion, per this project's established documentation convention

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: empty.
- **Foundational (Phase 2)**: blocks US1, US3, US4. Does NOT block US2 (login-challenge logic
  needs no new table — it only reads Supabase's own AAL state).
- **User Stories (Phase 3–6)**: US1 and US2 can proceed in parallel once Foundational is done (US2
  doesn't even need to wait for Foundational). US3 depends on US1/US2's UI hooks existing
  (the "use a recovery code" link lives in US2's `LoginView.vue` change). US4 depends on US1's
  `/account-security` route and US2's `authGuard` extension both existing, since it extends both.
- **Polish (Phase 7)**: depends on all 4 stories.

### Within Each User Story

- T001→T002→T003 sequential (same migration file).
- US1: T004/T005 (store logic) before T006 (UI that calls them); T007 (route) independent/parallel;
  T008 depends on T004/T006; T009 (i18n) can trail alongside T006/T008.
- US2: T010 (test) alongside T011-T015; T011→T012 sequential (same file, related logic); T013
  depends on T011/T012; T014→T015 sequential (route must exist before guard references it).
- US3: T017 (test) before/alongside T018; T018→T019→T020 sequential (Edge Function, then the
  store wrapper, then the UI wiring); T021 independent, can proceed once T001 exists.
- US4: T022 (test) alongside T023; T023→T024 sequential; T025 depends on T023 and US1's T008.

### Parallel Opportunities

- US1 and US2 can be built in parallel by different contributors once Foundational is merged
  (US2 doesn't even need Foundational).
- Within US1: T004/T005/T007/T009 are parallelizable; T006/T008 depend on the store functions.
- Within US2: T010 (test) parallel with implementation; T016 (i18n) parallel with T011-T015.
- US3 and US4 can start in parallel once their respective dependencies (US1/US2 for US3;
  US1/US2 for US4) land.

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 2 (Foundational).
2. Complete Phase 3 (US1 — enrollment) and Phase 4 (US2 — login enforcement) — together these are
   the feature's actual security payoff (spec's own framing: "equal priority... neither is useful
   without the other").
3. **STOP and VALIDATE** via quickstart.md §2–§3.
4. This alone closes the CRITICAL SRS requirement (MHEWS-NFR-0057) for any user who chooses to
   enroll.

### Incremental Delivery

1. Foundational → US1 + US2 (MVP) → validate → ship.
2. US3 (recovery codes) → validate → ship — closes the lockout risk that would otherwise suppress
   voluntary adoption of US1/US2.
3. US4 (per-role policy) → validate → ship — adds deployment-level enforcement flexibility on top
   of an already-complete, already-secure voluntary-MFA feature.

---

## Notes

- [P] tasks touch different files (or independent logic within the same file) with no unmet
  dependencies.
- [Story] labels map every implementation task to its spec.md user story for traceability.
- Migration timestamp `20260706140000` follows the full `YYYYMMDDHHMMSS` convention (post-dates
  spec 004's `20260706130200`) — do not shorten to a date-only prefix (see docs/PROJE_DURUMU.md's
  migration-collision history).
- Per plan.md's Constitution Check: this feature's new UI (T006, T009, T013, T016) MUST use the
  i18n system from the start — this is a real, new obligation, not a grandfathered gap like
  `AdminView.vue`'s.
