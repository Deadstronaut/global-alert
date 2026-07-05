# Phase 0 Research: Data Source Health, State Tracking & Payload Validation

## 1. Payload validation approach

**Decision**: Write a small hand-rolled `validatePayload()` function per hazard-type shape
(shared helpers for common checks: required-field presence, lat/lng range, numeric-type checks),
not a general-purpose schema validation library (e.g., Zod, Ajv/JSON-Schema).

**Rationale**: The existing `NormalizedEvent` shape (`supabase/functions/shared/normalize.ts`) is
small and stable (10 fields). Each `fetch-*` function already maps a different raw upstream shape
into this one target shape before calling `normalize()`. The new validation step only needs to
check the *pre-normalized* raw record has the minimum fields each fetcher already assumes (e.g.,
coordinates present and numeric, a resolvable timestamp) — this is a handful of `if` checks, not a
generic contract. Introducing a schema library would add a new dependency and a new DSL to learn
for a check that's simpler to read as plain TypeScript. This matches Constitution Principle VIII
(Simplicity & YAGNI).

**Alternatives considered**:
- *Zod schemas per hazard type*: rejected — real dependency + build-step overhead for Deno Edge
  Functions, for validation logic simple enough to stay readable as plain functions; revisit only
  if validation rules grow materially more complex (e.g., cross-field conditional rules).
- *JSON Schema + Ajv*: rejected for the same reason, plus Ajv's Deno support is less first-class
  than in Node.

## 2. Source health/state machine implementation

**Decision**: Model `data_sources.health_state` as a plain text column
(`healthy | degraded | down | disabled`) with transitions computed in a shared TypeScript helper
(`sourceHealth.ts`) called at the end of every `fetch-*` run, rather than a database-level
trigger/state-machine extension.

**Rationale**: State transitions depend on runtime outcome of the fetch (success/failure/latency)
which is only known inside the Edge Function, not derivable purely from a database write. Keeping
the transition logic in one shared TS module (imported by all 5 `fetch-*` functions, and by the
new `manage-data-sources` function for manual disable/enable) keeps the rule in one place while
staying within the existing "shared helpers in `functions/shared/`" convention already used for
`normalize.ts`/`upsert.ts`.

**Alternatives considered**:
- *Postgres-side triggers computing state from a rolling window of fetch-log rows*: rejected —
  adds SQL logic duplicating what the Edge Function already knows synchronously at request time,
  and this codebase does not otherwise push business logic into triggers (the one existing
  trigger, `log_table_change`, does generic auditing, not domain state derivation).
- *A separate scheduled "health checker" function*: rejected as unnecessary — every source is
  already polled on its own schedule via `pg_cron`; deriving state as a side effect of that same
  invocation avoids a second moving part.

## 3. Audit trail for state transitions and rejected payloads

**Decision**: Reuse the existing generic `audit_log` table (see
`supabase/migrations/20260605_audit_log.sql`) for `data_sources` CRUD changes (already covered
"for free" once an `AFTER INSERT OR UPDATE OR DELETE` trigger is attached, following the exact
pattern used for `profiles`/`organizations`). Add two **new**, purpose-built tables —
`source_state_transitions` and `rejected_payloads` — for the two new *domain event* types this
feature introduces, since those aren't simple table-row changes and carry a different, event-
specific shape (previous/new state + reason; validation-failure reason + record excerpt).

**Rationale**: `audit_log`'s generic `old_data`/`new_data` JSONB shape is appropriate for "a row
in a table changed" (its documented purpose per its header comment: FR-0046 etc.), but state
transitions and rejected-payload events are not row changes to a persisted entity — they are
first-class events in their own right that the spec (FR-007, FR-013) requires be independently
queryable by an Auditor. Forcing them into `audit_log`'s row-diff shape would make the required
Auditor queries (FR-014: filter by source + date range) awkward. Dedicated tables with proper
foreign keys to `data_sources` and their own indexes are more directly queryable and still satisfy
"immutable, auditable event log" in spirit (Constitution Principle V) via the same
no-update/no-delete RLS policy pattern already used on `audit_log`.

**Alternatives considered**:
- *Force everything through `audit_log`*: rejected per rationale above.
- *A single unified `ingestion_events` table for both transition and rejection events*: considered,
  but rejected because the two event types have materially different required fields (transition:
  prior/new state; rejection: validation reason + record excerpt) and different query patterns —
  splitting them keeps each table's schema honest (no nullable columns papering over the
  difference) without meaningfully increasing complexity (two small tables vs. one wide one).

## 4. Access control model mapping

**Decision**: Map the spec's role names to the project's existing `profiles.role` enum
(`super_admin | country_admin | org_admin | viewer`, per `supabase/migrations/20260603_profiles.sql`)
rather than introducing new role names:
- Spec's "Tenant Admin" (can create/edit/disable/remove sources) → `super_admin` and
  `country_admin` (source configuration is a cross-cutting operational concern, not
  org-scoped, so `org_admin`/`viewer` do not get write access).
- Spec's "Operator" (read-only dashboard) → any authenticated profile role can read the health
  dashboard (`viewer` included), matching how the rest of the app treats visibility today.
- Spec's "Auditor" (read-only audit history) → `super_admin` only, matching the existing
  `super_admin_read_audit` policy precedent on `audit_log`.

**Rationale**: Introducing a parallel "Operator/Approver/Tenant Admin/Auditor" role system
alongside the already-shipped `profiles.role` enum would violate Constitution Principle VIII
(Simplicity) and create two competing sources of truth for permissions. The PRD's role names are
descriptive of *function*, not necessarily literal schema values — reusing the existing enum
satisfies the same access-control intent (spec Assumptions section already anticipates this:
"follows the RBAC/ABAC model established for the rest of the system").

**Alternatives considered**:
- *Add new `data_source_admin` / `auditor` values to the `profiles.role` CHECK constraint*:
  rejected as unnecessary — existing roles already cover the needed permission boundaries; adding
  new roles increases surface area (every existing RLS policy referencing `role IN (...)` would
  need review) without adding real capability.

## 5. Testing framework for frontend

**Decision**: Add Vitest as a new `devDependency` (it is not currently in `package.json`).

**Rationale**: Vitest is the standard test runner for Vite-based Vue 3 projects (shares Vite's
config/transform pipeline, near-zero extra config), and the Constitution's testing requirement
(critical business logic must have automated tests) applies here to the state-machine transition
function and payload validation — both are pure, easily unit-testable logic. This is a net-new
dependency but a minimal, single-purpose one consistent with Simplicity (Principle VIII) — it adds
a test runner, not a framework shift.

**Alternatives considered**:
- *Jest*: rejected — requires extra config to work with Vite's ESM/transform pipeline that Vitest
  gets for free; no existing Jest usage in this repo to justify the switch-in cost.
- *No automated tests, manual QA only*: rejected — conflicts directly with the Constitution's
  Development Workflow & Quality Gates section, which names state-machine and validation logic as
  non-negotiable test-first zones.

## Outstanding NEEDS CLARIFICATION

None. All Technical Context fields were resolvable from the existing codebase and Constitution
without requiring further user input.
