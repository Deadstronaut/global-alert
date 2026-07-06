# Phase 0 Research: Incident Tracking Completion

No `[NEEDS CLARIFICATION]` markers remained in the spec, so this phase confirms technical
decisions against existing, already-proven repo patterns rather than exploring novel unknowns.

## Decision: DB-level guard trigger mirrors the spec 009 `guard_dispatch_transition()` pattern

- **Decision**: Add a `BEFORE UPDATE OF status ON incidents` trigger function
  (`guard_incident_transition()`) that raises an exception when `NEW.status` is not one of the
  explicitly allowed next states for `OLD.status`, and additionally raises when
  `OLD.status = 'monitoring' AND NEW.status = 'closed' AND (NEW.post_event_notes IS NULL OR
  btrim(NEW.post_event_notes) = '')`.
- **Rationale**: `supabase/migrations/20260707120100_dispatch_jobs_and_receipts.sql`'s
  `guard_dispatch_transition()` already proved this exact shape (BEFORE UPDATE trigger comparing
  OLD/NEW status against an explicit allow-list) works reliably in this Supabase project and is
  idempotent-safe via `DROP TRIGGER IF EXISTS`. Reusing an established pattern is lower-risk than
  inventing a new enforcement mechanism (e.g., a stored procedure wrapper that all clients must
  call, which is easy to bypass).
- **Alternatives considered**:
  - *Application-layer-only enforcement* (current state) — rejected: this is precisely the gap
    the spec exists to close (FR-001), since any direct DB write bypasses client code.
  - *CHECK constraint referencing OLD* — rejected: Postgres `CHECK` constraints cannot reference
    the previous row value; only a trigger can compare OLD vs NEW.

## Decision: Pure JS mirror function for the guard trigger, tested via Vitest

- **Decision**: `src/utils/incidentStateMachine.js` exports `isValidIncidentTransition(from, to)`
  and `requiresAAR(from, to)`, with a 1:1 logical mirror of the SQL trigger's conditions test by
  regression tests. No Deno test needed since no Edge Function is involved in this feature.
- **Rationale**: The dispatch state machine (`supabase/functions/shared/dispatchStateMachine.ts`)
  established the "pure function mirrors DB trigger, both tested independently, kept in sync
  manually with an explicit code comment" convention. Extending that same discipline to a
  frontend-only pure function (no Edge Function backing this feature) keeps the UI able to give an
  immediate, specific error message (FR-010) before round-tripping to the DB and getting a
  generic Postgres exception.
- **Alternatives considered**: Skipping the pure-JS mirror and relying solely on parsing the
  Postgres error message client-side — rejected: fragile (message text is not a stable contract)
  and would not allow proactively disabling invalid transition buttons in the UI before submission.

## Decision: `sop_documents` as a normalized table (not populating `sop_refs` JSONB)

- **Decision**: New `sop_documents` table with `hazard_type_code` FK to `hazard_types(code)`
  (spec 010's registry), matched at read-time to an incident's `hazard_type`. The existing
  `sop_refs` JSONB column on `incidents` is left untouched and unused by this feature.
- **Rationale**: See plan.md's Complexity Tracking entry — a normalized table gives one editable
  source of truth; a denormalized per-incident snapshot cannot satisfy the "deactivating an SOP
  immediately removes it from all matching incidents" edge case in the spec.
- **Alternatives considered**: Migrating `sop_refs` into structured per-incident data — rejected
  as unnecessary complexity (YAGNI) for a feature that is fundamentally "look up documents by
  hazard type," which is a global registry concern, not a per-incident one.

## Decision: RLS pattern for `sop_documents` mirrors spec 010's `hazard_types`

- **Decision**: `super_admin` gets `FOR ALL`; all authenticated users get `FOR SELECT` scoped to
  `is_active = true` (non-super-admins never see inactive/draft SOPs), matching
  `read_active_hazard_types` in `20260707130000_hazard_taxonomy.sql`.
- **Rationale**: FR-004/FR-006 explicitly restrict SOP management to the same admin tier as
  hazard taxonomy management; reusing the exact proven RLS shape avoids inventing a new access
  pattern for what is functionally the same kind of "small admin-managed reference registry."
- **Alternatives considered**: Allowing `country_admin`/`org_admin` to manage SOPs scoped to their
  own country — rejected: spec's FR-006 explicitly says SOP management is restricted to the same
  tier as hazard taxonomy (super_admin only), since SOPs are a hazard-type-wide reference
  resource, not a per-country configuration item like contacts (spec 009) or drill sessions.

## Decision: "Create incident from CAP alert" is a plain insert, not an Edge Function

- **Decision**: Story 4 is implemented as a client-side Supabase insert into `incidents` with
  `linked_cap_id` set, pre-filled from the CAP draft's own fields, gated by
  `cap_drafts.status = 'broadcast'` (existing RLS on `incidents` already scopes who can insert).
- **Rationale**: Principle VIII (Simplicity/YAGNI) — no server-side orchestration, notification,
  or cross-table side effect is required beyond a normal scoped insert; existing `incidents` RLS
  policies (from `20260605120300_incidents.sql`) already enforce country/org scoping on insert.
- **Alternatives considered**: A Postgres trigger auto-creating an incident whenever a CAP draft
  is broadcast — rejected: the spec explicitly frames this as an operator-initiated action
  ("operator creates a linked incident"), not an automatic side effect of broadcasting, and
  automatic incident creation for every broadcast alert would create noise for hazards that don't
  warrant operational tracking.

All decisions above resolve directly from spec.md requirements and existing, already-merged repo
patterns — no outstanding unknowns remain for Phase 1.
