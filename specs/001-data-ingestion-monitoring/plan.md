# Implementation Plan: Data Source Health, State Tracking & Payload Validation

**Branch**: `001-data-ingestion-monitoring` | **Date**: 2026-07-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-data-ingestion-monitoring/spec.md`

## Summary

Extend the existing hazard-data ingestion pipeline (5 independent Supabase Edge Functions:
`fetch-earthquakes`, `fetch-wildfires`, `fetch-floods`, `fetch-droughts`, `fetch-food-security`)
with three additive capabilities, without breaking the existing `normalize()` / `upsertEvents()`
contract in `supabase/functions/shared/`:

1. A `data_sources` config table + health-state machine (`healthy → degraded → down`, plus
   admin-controlled `disabled`), computed from fetch outcomes and staleness thresholds.
2. A shared `validatePayload()` step, run before `normalize()`, that rejects malformed individual
   records (missing fields, out-of-range coordinates, wrong types) without discarding the rest of
   a batch.
3. An admin-facing Vue view (health dashboard + source CRUD form) backed by a new `sourcesStore`
   (Pinia), and audit trails for both state transitions and rejected payloads — reusing the
   project's existing generic `audit_log` table/trigger pattern rather than inventing a new one.

**Implementation note (discovered during build):** the original design in this plan called for a
dedicated `manage-data-sources` Edge Function fronting the admin CRUD/audit operations. During
implementation this was dropped in favor of direct Supabase client table access from
`sourcesStore.js`, because (a) every other admin screen in this codebase (`AdminView.vue`'s
Users/Orgs/Drill tabs) already works this way — Edge Functions here are reserved for external
data-fetching, not internal CRUD — and (b) this app's Supabase Auth is not yet activated (only a
local mock `useAuthStore`), so a Bearer-token-based Edge Function would have had no real session
to check anyway. RLS policies on the new tables enforce the same role model either way; this is a
transport simplification, not a change to the authorization design (Constitution Principle VIII).

## Technical Context

**Language/Version**: JavaScript (Vue 3 SFCs, Composition API) on the frontend; TypeScript
(Deno runtime) for Supabase Edge Functions — matches the existing codebase exactly, no new
language introduced.

**Primary Dependencies**: Vue 3.5, Pinia 3, Vite 8, `@supabase/supabase-js` 2.97 (frontend);
Deno + `@supabase/supabase-js` via `esm.sh` (Edge Functions) — all already in use.

**Storage**: Supabase PostgreSQL. Three new tables: `data_sources`, `source_state_transitions`,
`rejected_payloads`. Reuses the existing generic `audit_log` table (via its existing
`log_table_change()` trigger) for `data_sources` CRUD auditing — no new audit mechanism needed
for configuration changes, only for the two new domain-specific event types above.

**Testing**: Vitest (frontend unit tests) — **new dependency**, not yet present in
`package.json`; must be added as a setup task. Deno's built-in `Deno.test` for Edge Function
logic (`validatePayload`, state-machine transition function), consistent with how Edge Functions
already run under the Deno runtime with no separate test runner configured today.

**Target Platform**: Web (Vite-built SPA) + Supabase-hosted Edge Functions (Deno), same as the
rest of the app; Capacitor mobile shell is unaffected (this feature is admin/back-office tooling,
not exposed in the mobile public-facing views).

**Project Type**: Single-repo web application with a thin serverless backend (frontend `src/` +
`supabase/functions/`) — matches existing repo structure; no new "Option 2/3" split needed.

**Performance Goals**: Health dashboard must reflect a source's degraded/down state within 2
polling cycles of that source (per spec SC-006); dashboard load/render itself must not add
noticeable delay (<1s) over existing map-view load times.

**Constraints**: Must not change the external behavior/signature of `normalize()` or
`upsertEvents()` relied upon by all 5 existing fetch functions — `validatePayload()` is inserted
as a new step *before* `normalize()`, not a modification of it. Each `fetch-*` function must
remain independently deployable and independently failing (Constitution Principle VIII —
Simplicity; existing failure-isolation via `Promise.allSettled` per source must be preserved).

**Scale/Scope**: Initial scope is the 5 existing hazard types/sources, expandable by config to
an arbitrary number of sources per hazard type (per spec FR-016) — no fixed upper bound assumed,
but dashboard/list UI should be designed to remain usable at low tens of sources (not hundreds),
matching realistic near-term scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Hazard-Agnostic, Model-Driven Design | New sources are added via `data_sources` table rows, not new code paths; hazard `type` remains constrained to the existing supported enum (spec explicitly excludes new hazard types). | PASS |
| II. Scope Discipline | This feature touches ingestion/monitoring only — no dissemination, CAP, or external-identity code paths added. | PASS |
| III. CAP v1.2 Compliance | Not applicable to this feature (no CAP authoring/export involved). | N/A |
| IV. Data Quality & Normalization | Directly implements this principle: adds `validatePayload()` ahead of `normalize()`, and a per-source freshness/health indicator surfaced in the dashboard. | PASS |
| V. Access Control & Auditability | Source CRUD reuses `profiles.role`-based RLS (pattern already established by `organizations`/`profiles` migrations) and the existing `audit_log` trigger; state transitions and rejected payloads get dedicated audit tables since they are not simple row CRUD events. | PASS |
| VI. Accessibility & i18n | New admin views must use the existing i18n system for all labels/messages and respect dark/light/high-contrast themes — no new theming system introduced. | PASS |
| VII. Performance & Resilience | Preserves existing per-source `Promise.allSettled` failure isolation (FR-015); does not introduce a shared blocking step across sources. | PASS |
| VIII. Simplicity & YAGNI | No new service/queue/framework introduced. State machine is plain SQL/TS logic against existing Supabase Postgres; validation is a plain function, not a schema-validation library unless research shows a lightweight one is clearly justified. | PASS (revisit in research.md) |

No violations requiring Complexity Tracking justification at this stage.

## Project Structure

### Documentation (this feature)

```text
specs/001-data-ingestion-monitoring/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
supabase/
├── functions/
│   ├── shared/
│   │   ├── normalize.ts          # UNCHANGED contract
│   │   ├── upsert.ts             # UNCHANGED contract
│   │   ├── cors.ts               # UNCHANGED
│   │   ├── validatePayload.ts    # NEW — schema/range validation, called before normalize()
│   │   └── sourceHealth.ts       # NEW — state-machine transition logic + audit-write helpers
│   ├── fetch-earthquakes/index.ts   # MODIFIED — call validatePayload() + sourceHealth updates
│   ├── fetch-wildfires/index.ts     # MODIFIED — same pattern
│   ├── fetch-floods/index.ts        # MODIFIED — same pattern
│   ├── fetch-droughts/index.ts      # MODIFIED — same pattern
│   └── fetch-food-security/index.ts # MODIFIED — same pattern
│   (no new Edge Function for admin CRUD — see below)
│
supabase/migrations/
└── 20260703_data_sources.sql     # NEW — data_sources, source_state_transitions, rejected_payloads

src/
├── stores/
│   └── sources.js                 # NEW — Pinia sourcesStore (list, health, CRUD actions via
│                                   #       direct supabase.from() calls — see below)
├── views/
│   └── AdminView.vue               # MODIFIED — new "Sources" tab added alongside existing
│                                   #       Users/Orgs/Drill tabs (same pattern, no new route)
├── components/
│   └── admin/
│       ├── SourceHealthCard.vue   # NEW — single source status card
│       └── SourceFormModal.vue    # NEW — create/edit source form
└── i18n/                          # MODIFIED — new keys for all 7 locales

tests/
├── unit/
│   ├── validatePayload.test.js    # NEW (Vitest) — mirrors Deno tests below for JS-side reuse if any
│   └── sourceHealth.test.js       # NEW (Vitest) — state-machine transition table tests
└── (Deno tests colocated as supabase/functions/shared/*.test.ts per Deno convention)
```

**Structure Decision**: Single-repo web app structure is retained (no backend/frontend split
needed beyond the existing `src/` + `supabase/functions/` layout). New admin-only views are
namespaced under `src/views/admin/` and `src/components/admin/` to keep them visually and
organizationally distinct from the public-facing map/globe UI. New Edge Function
`manage-data-sources` follows the same per-concern-function convention as the existing 5
`fetch-*` functions rather than being folded into an existing one.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
