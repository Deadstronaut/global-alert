# Research: Admin Panel Capability Grants

## Decision 1: Additive capability layer vs. full permission-system redesign

**Decision**: Add a new, additive `profile_capability_grants` table + a new
`current_profile_has_capability(cap)` helper function. Do not touch `profiles.role`, the existing
`current_profile_role()` function, or any of the ~50+ existing role-keyed RLS policies.

**Rationale**: A codebase audit (performed before this plan) found role checks duplicated across
23 migration files (~50+ `CREATE POLICY` statements, 19+ tables), 3 Edge Functions
(`createUserAuthorization.ts`, `suspendAuthorization.ts`, `dispatchRetryAuthorization.ts`), and
~15 Vue call sites, all keyed to the literal 4-value role string. Converting this into a fully
configurable permission system would require rewriting the majority of that surface area — high
risk of introducing an access-control regression (Principle V is non-negotiable: no weakening of
existing boundaries) for a requirement (MHEWS-FR-0136, priority MEDIUM in the SRS) that only asks
for configurable permissions in the abstract, not a mandate to replace the existing model. The
additive approach satisfies the requirement's concrete need (delegate specific admin areas without
full promotion) while keeping 100% of existing access-control surface untouched — directly
satisfying Constitution Principle VIII (Simplicity & YAGNI: prefer the smallest change that
satisfies the acceptance criteria) and Principle V (no regression to existing RBAC guarantees).

**Alternatives considered**:
- **Full RBAC → ABAC/configurable-groups redesign** (replace `profiles.role` with a `roles`/
  `role_permissions` table, rewrite all ~50+ RLS policies to route through it): rejected as
  disproportionate scope and risk for this requirement; would also require touching the 3
  Edge Functions' independently-duplicated hierarchy logic and the `mfa_role_policy` table's
  role-keyed CHECK constraint, none of which this requirement needs changed.
- **Per-user JSONB permissions column on `profiles`** (e.g. `profiles.extra_capabilities JSONB`):
  rejected in favor of a dedicated join table — a dedicated table gives a clean place to enforce
  "only these 4 capability values" via CHECK constraint, supports the audit trail requirement
  (FR-011: who granted, when) without overloading the `profiles` row, and RLS on a separate table
  is simpler to reason about than RLS conditions parsing JSONB.

## Decision 2: New helper function mirrors `current_profile_role()` exactly

**Decision**: `current_profile_has_capability(cap TEXT) RETURNS BOOLEAN` as a `SECURITY DEFINER
STABLE` SQL function, structurally parallel to the existing `current_profile_role()` (defined in
`20260706130100_profile_suspension.sql`): looks up the caller's `auth.uid()`, returns `false`
(not merely omits) when `profiles.is_active = false`, so a suspended user's grants become inert
automatically — reusing the exact same "single choke point" the project already established for
suspension (per the codebase audit: every policy that calls `current_profile_role()` already gets
this for free; the new function must inherit the same property for capability-gated policies).

**Rationale**: Consistency with the one existing convention in this codebase for "resolve the
caller's authority inside RLS" avoids introducing a second, differently-shaped pattern that future
maintainers would need to learn. Reusing the suspension short-circuit means this feature does not
need its own suspension-handling logic — it is inherited for free by construction.

**Alternatives considered**: Inlining the capability check as a raw `EXISTS (...)` subquery directly
in each of the 5 new policies (the "old/inline style" the audit found in the oldest migrations):
rejected because the project's own migration history shows this pattern was deliberately replaced
by the helper-function style specifically to fix an RLS self-recursion bug
(`20260703120300_fix_profiles_rls_recursion.sql`) — repeating the older, superseded pattern here
would reintroduce a known-bad style the project already moved away from.

## Decision 3: Grant storage shape — composite PK join table

**Decision**: `profile_capability_grants(profile_id, capability, granted_by, granted_at)` with
`PRIMARY KEY (profile_id, capability)`.

**Rationale**: A user either has a given capability or doesn't (spec has no notion of expiry,
levels, or multiple grants of the same capability) — a composite PK directly models "one row per
active grant" and makes granting idempotent (`INSERT ... ON CONFLICT DO NOTHING`) and revoking a
single `DELETE ... WHERE profile_id = ? AND capability = ?`, matching FR-001/FR-002 exactly with no
extra status/state-machine column needed (YAGNI).

**Alternatives considered**: A `granted BOOLEAN` flag column with a fixed row-per-capability-per-user
(pre-seeded 4 rows for every admin): rejected — would require a migration-time backfill for every
existing Country/Org Admin and every future one at creation time, whereas the join-table-of-grants
approach needs zero rows for the common case (no grants) and needs no backfill at all.

## Decision 4: Eligibility restriction (Country Admin/Org Admin only, never Viewer, never Super Admin)

**Decision**: Enforce "grantee must currently be `country_admin` or `org_admin`" via a `CHECK`-time
guard implemented as an `INSERT` trigger on `profile_capability_grants` (a `CHECK` constraint alone
cannot reference another table's row), not merely a UI-level restriction.

**Rationale**: FR-003/FR-004's requirement that this hold "even if bypassing the admin panel UI"
means the restriction must live in the database, not only in `AdminView.vue`. A `BEFORE INSERT`
trigger that raises an exception when the target profile's role is not in
`('country_admin','org_admin')` mirrors the existing `prevent_self_role_escalation()` trigger
pattern already used on `profiles.role` (`20260703120400_registration_country_code.sql`) — same
enforcement style already established in this codebase for a similar "reject a role-adjacent write
at the DB layer" need.

**Alternatives considered**: Relying solely on the RLS `WITH CHECK` policy (only super_admin may
INSERT) plus a client-side dropdown that only lists eligible users: rejected as insufficient per
FR-004's explicit "even if bypassing the admin panel UI" requirement — an RLS policy controls *who*
can write, not *what* the row's target may be; only a trigger (or a `CHECK` with a function call)
enforces the latter at the database layer regardless of client.
