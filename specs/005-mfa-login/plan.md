# Implementation Plan: Multi-Factor Authentication (MFA) for Login

**Branch**: `005-mfa-login` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-mfa-login/spec.md`

## Summary

Add a TOTP-based second authentication factor on top of the existing password login, using
Supabase Auth's native MFA primitives (`auth.mfa.enroll/challenge/verify/listFactors/unenroll`,
already available on the client SDK version already in use — no new dependency). Since Supabase
has no built-in recovery-code mechanism, recovery codes are a small custom addition (a new table
+ a service-role Edge Function to validate one and clear the lost factor). A new, publicly
reachable (to every authenticated role) "Account Security" page hosts enrollment/removal/recovery-
code display, independent of the `/admin` area spec 004 just restricted. A small per-role policy
table drives whether a role's MFA is mandatory or optional per deployment (default: optional for
all roles, per clarification).

## Technical Context

**Language/Version**: JavaScript/Vue 3 `<script setup>` (frontend), TypeScript (Deno 2.9.1 Edge Function for recovery-code verification), PL/pgSQL (migration)

**Primary Dependencies**: `@supabase/supabase-js` v2.97.0 (already includes `auth.mfa.*` client API — confirmed present in the version already installed, no upgrade needed), Vue Router 4, Pinia

**Storage**: Supabase-hosted PostgreSQL — one new table for recovery codes, one new small table for the per-role MFA policy; no changes to `profiles`' existing columns from spec 004

**Testing**: Vitest (frontend AAL-gating router logic, pure-function unit tests), Deno test (recovery-code verification Edge Function's hierarchy-free but security-relevant logic)

**Target Platform**: Existing Vue 3 SPA + Supabase Edge Functions/Postgres — no new platform

**Project Type**: Web application (existing single frontend + Supabase backend, no new project structure)

**Performance Goals**: N/A — login-time correctness feature, not a hot path; one extra `getAuthenticatorAssuranceLevel()` call (local, no network round-trip beyond the existing session) per navigation is negligible.

**Constraints**: Recovery-code verification must run server-side (service role) since it needs to remove a factor via `auth.admin.mfa.deleteFactor()`, an admin-only API — cannot be done from the browser's anon-key client. Must not weaken spec 004's suspension check (a suspended account must still be blocked at every step, including the MFA challenge).

**Scale/Scope**: Same user base as spec 004 — no scale change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: N/A — identity/access feature, not hazard data. PASS.
- **Principle II (Scope Discipline)**: TOTP is a *local* second factor verified by this platform's own Supabase Auth instance — it is not external identity federation (no SAML/OIDC/LDAP redirect to a third party), so it stays within "local authentication/authorization only." SMS-based MFA is explicitly excluded per spec, consistent with this principle's channel boundaries. PASS.
- **Principle III (CAP v1.2)**: N/A. PASS.
- **Principle IV (Data Quality & Normalization)**: N/A — no hazard/disaster data touched. PASS.
- **Principle V (Access Control & Auditability)**: Directly advances this principle — MFA enrollment/removal/recovery-code-use are new security-relevant actions that MUST be audit-logged (spec FR-011); reuses the existing `audit_log` table/trigger pattern from spec 004 rather than inventing a new log. PASS.
- **Principle VI (Accessibility & i18n)**: The new Account Security page and login challenge screen are new user-facing surfaces — per this principle, new UI text MUST go through the i18n system rather than hardcoded strings, unlike AdminView.vue's pre-existing (documented, grandfathered) gap. This feature does NOT get a pass on i18n the way spec 004's incremental AdminView.vue edits did, since it introduces new screens rather than extending an already-non-i18n one.
- **Principle VII (Performance & Resilience)**: N/A — no polling/map-rendering path touched. PASS.
- **Principle VIII (Simplicity & YAGNI)**: Uses Supabase Auth's native TOTP MFA primitives directly rather than a third-party MFA service; only adds the two pieces of state Supabase doesn't provide natively (recovery codes, per-role policy) as small, purpose-built tables. No new services/queues/frameworks. PASS.

**Result**: PASS with one actionable note — new UI in this feature must be built with i18n keys from the start (Principle VI), not hardcoded Turkish strings as AdminView.vue currently has. This is a real, new obligation for this feature's tasks, not a pre-existing gap being carried forward.

## Project Structure

### Documentation (this feature)

```text
specs/005-mfa-login/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Existing single Vue 3 + Supabase project — no new top-level directories.

```text
src/
├── router/index.js                     # add AAL-gating check to authGuard; new
                                         #   /account-security route (no role meta — every role)
├── stores/auth.js                      # extend login() to detect aal1→aal2 pending challenge;
                                         #   add mfaEnroll/mfaChallenge/mfaVerify/mfaUnenroll/
                                         #   mfaListFactors wrapping supabase.auth.mfa.*
├── views/
│   ├── LoginView.vue                    # insert challenge step after password step
│   └── AccountSecurityView.vue          # NEW — enrollment/removal/recovery-codes UI
└── i18n/locales/*.json                  # new keys for the above (Principle VI — no hardcoded text)

supabase/
├── functions/
│   └── verify-recovery-code/index.ts   # NEW — service-role: validate + consume a recovery code,
│                                         #   then admin.mfa.deleteFactor() the lost TOTP factor
└── migrations/
    └── <timestamp>_mfa_recovery_and_policy.sql  # NEW — mfa_recovery_codes table, mfa_role_policy
                                                   #   table (default optional for all 4 roles),
                                                   #   audit_log wiring
```

**Structure Decision**: Single existing project — no new services or frameworks. Follows
Constitution Principle VIII by using Supabase Auth's native `auth.mfa.*` client API directly for
TOTP enroll/challenge/verify (no new Edge Function needed for that part — it runs against the
user's own session), and only adds a service-role Edge Function for the one piece Supabase has no
native primitive for: consuming a recovery code and clearing the associated factor.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
