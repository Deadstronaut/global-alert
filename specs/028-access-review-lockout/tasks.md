---
description: "Task list for Access Review Report & Account Lockout (spec 028)"
---

# Tasks: Erişim İnceleme Raporu ve Hesap Kilitleme

**Input**: Design documents from `/specs/028-access-review-lockout/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/access-review-lockout.md, quickstart.md

**Tests**: Not included as new Vitest files (research.md Decision 4 — this spec's logic lives in SQL functions and direct store calls, no new pure-function abstraction to unit test); authorization behavior is validated live via transactional DB testing (project's established technique) and the quickstart.md manual scenarios.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/` at repository root.

---

## Phase 1: Setup

*(none — no new dependencies/project scaffolding needed)*

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema and SQL functions both user stories depend on.

- [X] T001 Create `supabase/migrations/<timestamp>_access_review_and_lockout.sql`: add `failed_login_attempts INTEGER NOT NULL DEFAULT 0` and `locked_until TIMESTAMPTZ` columns to `profiles` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (idempotent, per data-model.md — no RLS change needed, existing `users_read_own_profile`/`super_admin_read_all_profiles` policies already cover all columns)
- [X] T002 In the same migration file, add `record_failed_login(p_email TEXT) RETURNS void` SECURITY DEFINER function per contracts/access-review-lockout.md: `SET search_path = public`; updates the matching `profiles` row's `failed_login_attempts += 1`, setting `locked_until = NOW() + INTERVAL '15 minutes'` once the count reaches 5 (research.md Decision 5 constants); no-ops silently (no exception, no row) if no profile matches `p_email` (Edge Case — never reveals account existence); `GRANT EXECUTE ... TO anon, authenticated`. **Deliberate behavior**: once the threshold is crossed, each further failed attempt during the active lock re-extends `locked_until` to `NOW() + 15 minutes` again (prevents waiting out the clock while still guessing) — this is intentional, not a bug to "fix" during implementation.
- [X] T003 [P] In the same migration file, add `clear_own_login_lock() RETURNS void` SECURITY DEFINER function: `SET search_path = public`; sets `failed_login_attempts = 0, locked_until = NULL` on the row where `id = auth.uid()`; `GRANT EXECUTE ... TO authenticated`
- [X] T004 [P] In the same migration file, add `unlock_profile(p_profile_id UUID) RETURNS void` SECURITY DEFINER function: `SET search_path = public`; raises an exception unless `current_profile_role() = 'super_admin'`; otherwise sets `failed_login_attempts = 0, locked_until = NULL` on the target row; `GRANT EXECUTE ... TO authenticated`
- [X] T005 [P] In the same migration file, add `get_access_review() RETURNS TABLE(profile_id UUID, email TEXT, role TEXT, country_code TEXT, org_id UUID, is_active BOOLEAN, capabilities TEXT[], last_sign_in_at TIMESTAMPTZ, created_at TIMESTAMPTZ)` SECURITY DEFINER function per data-model.md: `SET search_path = public`; raises an exception unless `current_profile_role() = 'super_admin'`; otherwise `LEFT JOIN`s `profiles` with `profile_capability_grants` (aggregated via `array_agg(...) FILTER (WHERE ...)`, empty array if none) and `auth.users` (only `last_sign_in_at`, no other auth.users columns), ordered by `email`; `GRANT EXECUTE ... TO authenticated`. **New-pattern note**: this is the first function in this codebase to `SELECT` a column directly from `auth.users` (every prior reference is only an FK constraint) — verify during T017's live validation that the migration-owning role actually has `SELECT` on `auth.users` in this Supabase project (if it errors with a permissions issue, fall back to a `profiles.last_login_at` column updated client-side instead, per research.md Decision 3's rejected alternative).

**Checkpoint**: All 4 functions and both columns exist — no UI or login-flow code uses them yet.

---

## Phase 3: User Story 1 - Super Admin tüm kullanıcıların rol/izin durumunu tek bir raporda görür (Priority: P1) 🎯 MVP

**Goal**: A Super Admin can view every user's role/country/org/capabilities/last-login/active-status in one place and export it.

**Independent Test**: Log in as super_admin, open the Users tab, confirm all fields render for every profile including one with no capability grants and one that has never logged in; export CSV/JSON; confirm a non-super_admin cannot access the same data (quickstart.md Scenarios 1-2).

### Implementation for User Story 1

- [X] T006 [US1] In `src/views/AdminView.vue`, update the existing `loadUsers()` function (~line 95-100) to call `supabase.rpc('get_access_review')` instead of (or in addition to, if the existing plain `profiles` select is still needed elsewhere) the current direct `profiles` select — store the result including the new `capabilities`, `last_sign_in_at` fields
- [X] T007 [US1] In `AdminView.vue`'s Users table template (~line 907-939), add two new columns: "Son Giriş" (formats `last_sign_in_at` as a locale date/time or "—" if null) and reuse the existing capabilities display if already present (verify it still works against the RPC's `capabilities` array shape)
- [X] T008 [US1] In `AdminView.vue`, add an "Dışa Aktar" (Export) button near the Users table that imports and reuses the existing `rowsToCsv`/`rowsToJson`/`triggerDownload` helpers (already used in the Denetim/Audit tab, spec 007) to export the `get_access_review()` result set as CSV or JSON

**Checkpoint**: User Story 1 fully functional and independently testable — Super Admin sees and exports the full access review, no other role can.

---

## Phase 4: User Story 2 - Sistem, tekrarlanan başarısız giriş denemelerinden sonra hesabı geçici olarak kilitler (Priority: P2)

**Goal**: Repeated failed logins lock an account for a fixed duration; a locked account rejects even correct credentials until the lock expires or a Super Admin manually clears it.

**Independent Test**: Deliberately fail login 5 times against a test account, confirm the 6th attempt (even with correct password) is rejected with a clear "account locked" message; confirm unlocking (via time passing or manual admin action) restores login (quickstart.md Scenarios 3-5).

### Implementation for User Story 2

- [X] T009 [US2] In `src/stores/auth.js`'s `login(email, password)` function (~line 61-78): on `signInWithPassword` error, call `supabase.rpc('record_failed_login', { p_email: email }).catch(() => {})` before re-throwing the original error (contracts/access-review-lockout.md client usage example)
- [X] T010 [US2] In the same `login()` function, immediately after a successful `signInWithPassword` (before the existing MFA/AAL check), query the caller's own `profiles` row for `locked_until`; if it is non-null and in the future, call `supabase.auth.signOut()` and throw a distinguishable error (e.g. `Object.assign(new Error('account_locked'), { lockedUntil: own.locked_until })`) so `LoginView.vue` can show a specific message
- [X] T011 [US2] In the same `login()` function, if not locked, call `supabase.rpc('clear_own_login_lock').catch(() => {})` before continuing to the existing MFA/AAL check and `loadProfile()` call (FR-006 — resets the counter on successful password verification)
- [X] T012 [US2] In `src/views/LoginView.vue`, catch the `account_locked` error from `login()` and display a distinct, user-facing message (e.g. "Hesabınız çok sayıda başarısız giriş denemesi nedeniyle geçici olarak kilitlendi, lütfen daha sonra tekrar deneyin") — new i18n key, not a generic auth-error passthrough
- [X] T013 [US2] In `AdminView.vue`'s Users table (from T007), add a "🔒 Kilitli" indicator for rows where `locked_until` is in the future, and an "Kilidi Aç" action button (visible only when locked) that calls `supabase.rpc('unlock_profile', { p_profile_id: row.profile_id })` and refreshes the list — mirrors the existing suspend/reactivate button pattern

**Checkpoint**: User Story 2 fully functional and independently testable — lockout triggers, blocks, expires, and can be manually cleared by a Super Admin.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 [P] Add i18n coverage for all new user-facing text (Son Giriş/Kilit Durumu column headers, Kilidi Aç button, Dışa Aktar button if not already covered, and the account-locked login error message) across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T015 Run `npm run test` and confirm all existing frontend tests pass with no regressions
- [X] T016 Run `npm run build` and confirm a clean build
- [X] T017 Validate quickstart.md Scenarios 1-6 against the live Supabase instance after the user applied `20260709120000_access_review_and_lockout.sql`. Confirmed via transactional (BEGIN/temp-table-log/ROLLBACK) testing, zero permanent changes: both new columns and all 4 functions exist; `record_failed_login()` silently no-ops for an unknown email (no account-existence leak) and correctly locks a real profile after 5 calls; **live testing caught a real bug** — `get_access_review()` initially failed with "structure of query does not match function result type" because `profiles.country_code` is `character varying`, not `text` (the declared return type); fixed via a new fix-up migration `20260709130000_fix_get_access_review_country_code_type.sql` (`country_code::text` cast), applied by the user and re-verified live (now returns rows successfully). Role-based rejection scenarios (non-super_admin calling `get_access_review()`/`unlock_profile()`) were SKIPped in this environment (only one super_admin profile exists to test against) — the guard logic (`IF current_profile_role() <> 'super_admin' THEN RAISE EXCEPTION`) matches the exact pattern used and already verified in specs 019/026, so this is low-risk, but **user should verify with a real non-super_admin account in the live UI** if they want full confidence. Live UI click-through (actual lockout after 5 real failed logins via the login form, actual unlock button click, CSV/JSON export download) also requires the user's own testing session.
- [X] T018 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Administration & Access module's "Erişim İnceleme Raporu" and "Hesap Kilitleme" PRD requirements are now closed — update completion percentage and narrative; note that the previously-noted "kalan" item (fully configurable role-changing permission system) remains deliberately out of scope, unaffected by this spec

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — BLOCKS both User Story 1 and User Story 2
- **User Story 1 (Phase 3)**: Depends on Foundational (T001, T005 specifically — needs `get_access_review()`)
- **User Story 2 (Phase 4)**: Depends on Foundational (T001, T002-T004) — independent of User Story 1's tasks, though T013 touches the same `AdminView.vue` table T007 introduces (sequential, not parallel, since same file)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T003, T004, T005 (three independent SQL functions in the same migration file) can be drafted in parallel conceptually, though they land in one sequential file edit
- User Story 1 (Phase 3) and User Story 2 (Phase 4) touch different core files (`AdminView.vue` report/export vs. `auth.js`/`LoginView.vue` login flow) and can proceed in parallel once Phase 2 is complete — except T013 vs. T007 (same file, same table, do sequentially)
- T014 (i18n) can run in parallel with T015/T016

---

## Implementation Strategy

### MVP First

1. Complete Phase 2: Foundational (schema + all 4 functions)
2. Complete Phase 3: User Story 1 (Access Review Report + export) — this alone closes PRD Req 1
3. **STOP and VALIDATE**: quickstart.md Scenarios 1-2

### Incremental Delivery

4. Complete Phase 4: User Story 2 (lockout mechanism) — closes PRD Req 2
5. **STOP and VALIDATE**: quickstart.md Scenarios 3-6
6. Complete Phase 5: Polish (i18n/test/build/docs)

---

## Notes

- `record_failed_login()` being anon-callable is the security-critical part of this spec (plan.md Complexity Tracking note) — it must never reveal whether an email exists, never return data, and only ever touch the two new counter/lock columns
- Supabase Auth's own `signInWithPassword`/session issuance is never modified — lockout is enforced entirely in the application layer, after authentication succeeds, mirroring the existing `is_active` suspension precedent
- No new audit-logging code is needed: the existing `audit_profiles` trigger (`AFTER INSERT OR UPDATE OR DELETE ON profiles`, `supabase/migrations/20260605120000_audit_log.sql:69-71`) already captures every `profiles` UPDATE this spec's functions make (failed-attempt increments, lock/unlock), automatically satisfying Constitution Principle V (security-relevant action auditability) with zero additional work
- Commit only when explicitly requested by the user
