# Research: Shelter Management

## Decision 1: Reuse the `contacts` (spec 009) CRUD/RLS shape, with one deliberate read-access deviation

**Decision**: `shelters` follows `contacts`' table shape almost exactly — `country_code
VARCHAR(2) NOT NULL`, optional `org_id UUID REFERENCES organizations(id)`, `is_active` soft-delete,
`updated_at` trigger, `log_table_change()` audit trigger, and a 4-policy RLS shape:
`super_admin_shelters_all` (FOR ALL), `country_scoped_shelters_select/insert/update` (country_admin/
org_admin, own country only, no DELETE — deactivate only). The one deliberate deviation: an
additional `authenticated_shelters_read` policy grants SELECT to **every** authenticated user
system-wide (not scoped to their own country), because FR-008 requires shelter availability to be
visible to any signed-in user across all countries, unlike `contacts` (never public) or even
`incidents`' own `viewer_incidents_read` (which is scoped to the viewer's own country, per
`supabase/migrations/20260605120300_incidents.sql` lines 73-80).

**Rationale**: Reusing an already-proven RLS/CRUD shape (spec 009) means zero new access-control
concepts — the only new idea is the country-unscoped read policy, which is a direct, explicit
requirement (FR-008), not an oversight. Shelter capacity/status is life-safety information a
responder or displaced person may need to see regardless of which country's admin registered it
(e.g., a cross-border evacuation).

**Alternatives considered**: Scoping shelter reads to the viewer's own country (matching
`incidents`'s pattern exactly): rejected because FR-008 explicitly requires cross-country
visibility, and a disaster response scenario may require seeing shelters in a neighboring country.

## Decision 2: `linked_incident_id` mirrors `incidents.linked_cap_id`'s nullable-FK pattern

**Decision**: `shelters.linked_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL`,
directly mirroring `incidents.linked_cap_id UUID REFERENCES cap_drafts(id) ON DELETE SET NULL`
(`supabase/migrations/20260605120300_incidents.sql` line 31). No junction table, no cascade
delete.

**Rationale**: FR-010 requires that deleting an incident clears the shelter's association without
touching the shelter record itself — `ON DELETE SET NULL` gives exactly this behavior at the
database level, with zero application code needed to maintain the invariant. This is the identical
relationship shape the project already uses for incident↔CAP-draft linkage, so no new pattern is
introduced.

**Alternatives considered**: A many-to-many `shelter_incidents` junction table: rejected as
over-engineered for a one-shelter-one-current-incident relationship the spec describes (FR-009
says "associate... with a specific incident", singular) — YAGNI (Constitution Principle VIII).

## Decision 3: Capacity invariant enforced by a CHECK constraint, not a trigger

**Decision**: `CONSTRAINT chk_shelter_capacity CHECK (capacity_occupied <= capacity_total)` and
`CONSTRAINT chk_shelter_capacity_positive CHECK (capacity_total > 0)` directly on the table,
evaluated on every INSERT/UPDATE by Postgres itself.

**Rationale**: FR-002/FR-003 require this invariant to be enforced at the database level, not
just client-side (client validation is UX-only and trivially bypassable via direct API calls). A
CHECK constraint is the simplest mechanism that guarantees this — no trigger function is needed
since this is a single-row, single-table invariant with no cross-row logic, unlike
`validate_hazard_breakpoints()` (spec 010) which validates an array's internal ordering and
therefore needs procedural logic. Postgres CHECK constraints are already used elsewhere in this
project for exactly this kind of single-row invariant (e.g., `contacts`' `chk_contact_has_channel`,
`chk_whatsapp_e164`).

**Alternatives considered**: A `BEFORE INSERT OR UPDATE` trigger function: rejected as unnecessary
indirection for a plain row-level comparison a CHECK constraint already expresses declaratively
and enforces identically.

## Decision 4: `occupancyPercentage()` as a new, tiny pure function — not inlined in the UI

**Decision**: Extract `occupancyPercentage(shelter)` as its own pure function in
`src/stores/shelters.js`, returning `Math.round((capacity_occupied / capacity_total) * 100)`, with
a `0` fallback when `capacity_total` is falsy/zero (defensive, even though the DB constraint
already prevents zero/negative `capacity_total` from ever being persisted — the function must
still behave safely against not-yet-loaded/malformed local state before a save completes).

**Rationale**: Matches this project's established pattern of extracting exactly the part of the
logic with a non-obvious edge case (division by zero) into a pure, directly-testable function
(spec 010's `evaluateBreakpoints()`, spec 019's `summarizeAuditRows()`, spec 020's
`resolveThresholds()`), satisfying the constitution's test-first requirement area and FR-011's
"way to see... percentage... occupied" requirement.

**Alternatives considered**: Computing the percentage inline in the Vue template
(`{{ Math.round(s.capacity_occupied / s.capacity_total * 100) }}`): rejected because it both
duplicates the divide-by-zero guard at every render call site and cannot be unit-tested in
isolation, unlike a hoisted function.

## Decision 5: Admin tab access is plain role-based, not folded into spec 018's capability-grant system

**Decision**: The new "Sığınaklar" admin tab is visible to `super_admin`, `country_admin`, and
`org_admin` (full CRUD, RLS-scoped) and to `viewer` (read-only, via the system-wide read policy) —
using the existing plain 4-role check already used by every other non-capability-gated tab in
`AdminView.vue`, not `hasCapability()` (spec 018's opt-in capability-grant mechanism for 4
specific admin areas: Hazard Taxonomy, SOP Repository, Map Layers, Audit).

**Rationale**: Spec 018's capability-grant system was deliberately scoped to 4 pre-identified
admin areas after a full RBAC blast-radius audit; extending it to a 5th area without a fresh
audit/decision would silently grow that system's surface beyond its reviewed scope. Since every
role that needs shelter access (all 4 roles, with `viewer` getting read-only via RLS rather than
tab-hiding) already has a natural default under the plain role model, there is no access gap that
capability-grants would need to solve here.

**Alternatives considered**: Adding `shelter_management` as a 5th spec-018 capability: rejected —
YAGNI, since no access requirement in this spec calls for delegating shelter admin access to a
country_admin/org_admin who wouldn't already have it by virtue of their base role.
