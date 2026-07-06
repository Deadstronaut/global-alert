# Implementation Plan: Admin Panel Capability Grants

**Branch**: `018-admin-capability-grants` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-admin-capability-grants/spec.md`

## Summary

Super Admin can currently delegate exactly one of the four fully-super-admin-only admin panel
areas (Hazard Taxonomy, SOP Repository, Map Layers, Audit) only by promoting a user to full Super
Admin — there is no way to grant just one area to a Country Admin/Org Admin. This feature adds a
new, purely additive `profile_capability_grants` table plus one new RLS helper function so a
Super Admin can grant/revoke any of the four capabilities per user, without touching the existing
4-tier role model, the existing `current_profile_role()` helper, or any of the ~50+ existing RLS
policies already governing the rest of the system (verified by codebase audit before this plan:
23 migration files, 19+ tables). The four covered tables (`hazard_types`, `hazard_thresholds`,
`sop_documents`, `map_layers`, `audit_log`) each get one new, additive RLS policy that piggybacks on
a new `current_profile_has_capability(cap)` helper function, mirroring the existing
`current_profile_role()` pattern exactly. Frontend: `auth.js` loads the grantee's capability list
alongside the existing role/scope fields; `AdminView.vue` extends its 4 tab `v-if` guards and adds
a small grant/revoke toggle UI to the user list, visible only to Super Admin, only for
Country Admin/Org Admin rows.

## Technical Context

**Language/Version**: TypeScript (Deno Edge Functions, not needed for this feature — no new Edge
Function), JavaScript (Vue 3 `<script setup>`), SQL (PostgreSQL migrations)

**Primary Dependencies**: Vue 3 Composition API, Pinia (`src/stores/auth.js`), Supabase JS client,
PostgreSQL RLS + `SECURITY DEFINER` SQL functions (existing `current_profile_role()` pattern)

**Storage**: PostgreSQL (Supabase) — one new table, no changes to existing table shapes

**Testing**: No existing precedent for RLS-policy-level automated tests in this project (confirmed
by codebase audit — RLS correctness is verified by migration review + manual quickstart validation,
not `Deno.test`/`node --test`). This feature follows that same precedent: no new test files: this
feature is pure SQL policy + a thin frontend read/write wire-up, with no new pure-function business
logic (unlike specs 016/017, which extracted pure functions specifically because they contained
non-trivial edge-case logic). `npm run build` and existing `npm run test` suite MUST still pass
with zero regressions.

**Target Platform**: Web (existing Vue 3 SPA), Supabase-hosted Postgres

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project/service)

**Performance Goals**: N/A — this is an admin-only, low-frequency-access feature; no new
performance-sensitive path is introduced (capability check is a single indexed-PK lookup, same cost
class as the existing `current_profile_role()` lookup already run on every RLS-gated query).

**Constraints**: Zero changes to the ~50+ existing RLS policies or the `current_profile_role()`
function; zero changes to the 4 base roles' existing behavior for any area outside the four named
capabilities; migration MUST be idempotent (`DROP ... IF EXISTS` + `CREATE`, per project convention);
capability grants MUST NOT be assignable to Viewer accounts; capability grants MUST NOT grant any
Super-Admin-only ability outside the four named areas (no path to `create-user`, `suspend-user`,
dispatch retry, etc.).

**Scale/Scope**: 1 new table, 1 new SQL helper function, ~5 new additive RLS policies (one per
covered table; `hazard_types`+`hazard_thresholds` may share one capability check pattern), 1 file
change in `auth.js`, 1 file change in `AdminView.vue`, i18n additions across 7 locale files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — this feature does not touch hazard
  type modeling itself, only who may administer the existing Hazard Taxonomy admin UI. PASS.
- **Principle II (Scope Discipline)**: N/A — no dissemination channel, identity federation, or CAP
  ingestion changes. PASS.
- **Principle III (CAP v1.2 Compliance)**: N/A — no CAP authoring/export path touched. PASS.
- **Principle IV (Data Quality & Normalization)**: N/A — no disaster/hazard event ingestion path
  touched. PASS.
- **Principle V (Access Control & Auditability)**: Directly relevant and reinforced, not weakened —
  this feature adds finer-grained access control (a documented, auditable grant with `granted_by`/
  `granted_at`, per FR-011) on top of the existing RBAC model, without loosening any existing
  boundary. The 4 existing base roles and their current access remain byte-for-byte unchanged
  (FR-009, FR-010). PASS.
- **Principle VI (Accessibility & Internationalization)**: New UI strings (capability names, toggle
  labels) MUST be added via the i18n system across all 7 locales, matching existing project
  convention (e.g., spec 017's `admin.*` namespace additions). Planned in Phase 1. PASS (pending
  execution in tasks).
- **Principle VII (Performance & Resilience by Design)**: N/A — no polling/refresh/offline-cache
  behavior touched. PASS.
- **Principle VIII (Simplicity & YAGNI)**: This is the central design constraint of this feature.
  The chosen approach (additive table + additive RLS policies + one new helper function) is
  explicitly the smaller of two alternatives identified during scoping (the larger alternative —
  converting the 4 fixed roles into a fully configurable permission system touching all ~50+
  existing policies — was explicitly rejected as disproportionate risk for the requirement; see
  Complexity Tracking, N/A since no violation is introduced). No new service, queue, or framework
  is introduced; the existing Supabase RLS mechanism is reused exactly as-is. PASS.

**Result**: All principles pass. No Complexity Tracking entries required — this plan does not
deviate from any Core Principle.

## Project Structure

### Documentation (this feature)

```text
specs/018-admin-capability-grants/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/
└── migrations/
    └── 20260707200000_profile_capability_grants.sql   # NEW

src/
├── stores/
│   └── auth.js               # MODIFIED — load capabilities into session
├── views/
│   └── AdminView.vue          # MODIFIED — tab v-if guards + grant/revoke UI
└── i18n/
    └── locales/*.json         # MODIFIED — 7 locales, new admin.capabilities.* keys
```

**Structure Decision**: Single existing Vue 3 + Supabase project — no new project/service directory.
This feature is one migration file plus targeted edits to two existing frontend files and the 7
locale files, following the same structure every prior spec in this repo (001–017) has used.

## Complexity Tracking

*No entries — Constitution Check reported no violations requiring justification.*
