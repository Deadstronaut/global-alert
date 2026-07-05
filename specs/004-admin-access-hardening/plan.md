# Implementation Plan: Administration & Access Hardening

**Branch**: `004-admin-access-hardening` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-admin-access-hardening/spec.md`

## Summary

Close 5 enforcement gaps in the already-implemented Super Admin / Country Admin / Org Admin / Viewer
hierarchy: (1) a role-based router guard for `/admin` (today auth-only), (2) `profiles` RLS policies
so country_admin/org_admin can actually see and manage in-scope users (today only super_admin and
"own row" work), (3) a real suspend/reactivate mechanism distinct from role downgrade, (4) invite-link
onboarding replacing admin-chosen passwords, (5) closing the orphaned self-registration capability
(`handle_new_user()` reading `country_code` from signup metadata, and the unrestricted
`users_update_own_profile` policy). All 5 gaps touch the same `profiles`/RLS/router layer, so they are
implemented together per the user's explicit choice to do this as one spec.

## Technical Context

**Language/Version**: TypeScript (Deno 2.9.1 Edge Functions), JavaScript/Vue 3 `<script setup>` (frontend), PL/pgSQL (Postgres migrations)

**Primary Dependencies**: Vue Router 4, Pinia, `@supabase/supabase-js` v2 (client + `esm.sh` import in Edge Functions), Supabase Auth Admin API (`auth.admin.*`)

**Storage**: Supabase-hosted PostgreSQL (existing `profiles`, `organizations` tables; RLS policies + `SECURITY DEFINER` helper functions)

**Testing**: Vitest (frontend router-guard unit tests), Deno test (`deno test --no-check --allow-net --allow-env` for Edge Functions), manual RLS verification via `quickstart.md` (matching existing project convention — no dedicated SQL test harness exists yet)

**Target Platform**: Existing web app (Vue 3 SPA) + Supabase Edge Functions (Deno, server-side)

**Project Type**: Web application (existing single frontend + Supabase backend, no new project structure)

**Performance Goals**: N/A — this is an access-control correctness feature, not a performance-sensitive path; existing admin-panel load times are the baseline (no regression expected since guard checks are in-memory role comparisons).

**Constraints**: Must reuse the existing `current_profile_role()` `SECURITY DEFINER` helper pattern to avoid re-introducing the profiles-RLS infinite-recursion bug fixed in `20260703120300_fix_profiles_rls_recursion.sql`. Must not weaken the existing `prevent_self_role_escalation` trigger. Suspended-session cutoff target: within 5 minutes (spec SC-003, an assumption, not a hard SLA).

**Scale/Scope**: Same user base as today (per-country/per-org admin hierarchy for a UN-style multi-country deployment) — no scale change, this is a correctness/hardening feature.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: N/A — this feature touches identity/access, not hazard data. PASS.
- **Principle II (Scope Discipline)**: This feature stays within "local authentication/authorization only. No external identity federation" — invite/magic-link onboarding uses Supabase's own built-in Auth Admin API (already in use via `create-user`), not an external IdP (SAML/OIDC/LDAP). PASS.
- **Principle III (CAP v1.2)**: N/A — no CAP authoring/export touched. PASS.
- **Principle IV (Data Quality & Normalization)**: N/A — no disaster/hazard data ingestion touched. PASS.
- **Principle V (Access Control & Auditability)**: This feature is a direct implementation of this principle — it closes gaps in role/attribute-based (country/org) scoping, and FR-014 requires every suspend/reactivate/role-scope change to write an audit event. The existing `audit_log` table (append-only, `no_update`/`no_delete` RLS policies, already reused by `data_sources` per its migration's own comment "reuse audit_log rather than invent a new mechanism") is the correct, already-established mechanism — Phase 1 will wire the new suspend/reactivate/profile-update paths into the existing generic audit trigger rather than creating a new logging table. PASS (and this feature actively increases compliance with this principle).
- **Principle VI (Accessibility & i18n)**: AdminView.vue is already fully Turkish-hardcoded and not i18n-wired (a known, previously-documented gap from feature 001/002 — see AdminView's existing lack of `t()` calls). This feature adds a small amount of new UI (suspend/reactivate buttons, invite-flow tweaks to the existing user form) following the exact same (currently non-i18n) convention already used throughout AdminView.vue — it does not regress i18n further than the status quo, but does not fix the pre-existing gap either, since that is out of this feature's scope. Documented here rather than silently ignored, consistent with the constitution's audit expectations.
- **Principle VII (Performance & Resilience)**: N/A — no polling/map-rendering path touched. PASS.
- **Principle VIII (Simplicity & YAGNI)**: All 5 gaps are closed using existing Supabase-native primitives already used elsewhere in this codebase: `SECURITY DEFINER` helper functions (existing pattern), the existing `audit_log` table (existing pattern), Supabase Auth's native `admin.inviteUserByEmail`/`ban_duration` APIs (already-available `auth.admin.*` surface, same surface `create-user` already calls), and a new Edge Function following the exact structure of the existing `create-user` function. No new service, queue, or database is introduced. PASS.

**Result**: PASS — no Complexity Tracking entries required. One documented, accepted pre-existing gap (i18n) carried forward unchanged, not worsened.

## Project Structure

### Documentation (this feature)

```text
specs/004-admin-access-hardening/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This feature modifies the existing single Vue 3 + Supabase project — no new top-level
directories. Real paths touched:

```text
src/
├── router/index.js                        # add role-based guard for /admin route (gap 1)
├── stores/auth.js                          # add suspendUser()/reactivateUser()/inviteUser() calls
└── views/AdminView.vue                     # Users tab: suspend/reactivate buttons, remove password
                                             #   field from create-user form, wire invite flow

supabase/
├── functions/
│   ├── create-user/index.ts                # remove password param, switch to inviteUserByEmail (gap 4)
│   └── suspend-user/index.ts               # NEW — mirrors create-user's auth/hierarchy pattern (gaps 3, 5's audit tie-in)
└── migrations/
    └── <timestamp>_profile_access_hardening.sql  # NEW — profiles RLS policies (gap 2), is_active
                                                    #   column + current_profile_role() update (gap 3),
                                                    #   lock down users_update_own_profile + handle_new_user
                                                    #   metadata read (gap 5), audit_log wiring (FR-014)
```

**Structure Decision**: Single existing project (Vue 3 SPA + Supabase Edge Functions/Postgres) —
no new services, directories, or frameworks. Follows Constitution Principle VIII: reuse the
`create-user`/`current_profile_role()`/`audit_log` patterns already established by features
001–003 rather than introducing new ones.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
