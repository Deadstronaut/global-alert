# Phase 0 Research: Data Source Country Scoping

No `NEEDS CLARIFICATION` markers remained after `/speckit-clarify` (spec quality checklist passed
in full). This file documents the technical decisions made to resolve the Technical Context and
Constitution Check, for traceability.

## 1. Where does scope live: new table vs. column on `data_sources`?

**Decision**: Add a single nullable `country_code TEXT` column directly to the existing
`data_sources` table.

**Rationale**: The scope is a 1:0..1 relationship (a source is global or belongs to exactly one
country — spec Assumptions). A join table would only be justified for many-to-many scoping
("shared regional source"), which the spec explicitly puts out of scope. A column is the minimal
change (Constitution VIII — Simplicity/YAGNI) and mirrors how `profiles.country_code`,
`cap_drafts.country_code`, `incidents.country_code` etc. already represent the identical
single-country-or-null-for-global concept elsewhere in this schema.

**Alternatives considered**:
- Separate `data_source_scopes` join table — rejected: over-engineered for a 1:0..1 relationship,
  no current requirement for multi-country sources.
- A `scope` enum (`'global'|'country'`) plus a separate `country_code` column — rejected: redundant
  state (the two columns could disagree); `country_code IS NULL` already unambiguously means global,
  exactly as the existing `profiles`/`cap_drafts` convention treats a null country_code elsewhere in
  this codebase (super_admin has `country_code IS NULL`, per `docs/security_roles_protocol.md` §4).

## 2. How is read visibility enforced?

**Decision**: Reuse the exact RLS pattern from `20260704_country_scoped_disaster_reads.sql`:
narrow the existing 001 `public_read_data_sources` policy (`FOR SELECT USING (true)`) to the
`anon` role only, and add a `country_scoped_read_data_sources` policy for the `authenticated` role
using `current_profile_role() = 'super_admin' OR data_sources.country_code IS NULL OR
data_sources.country_code = (SELECT country_code FROM profiles WHERE id = auth.uid())`.

**Rationale**: This is the established, already-audited pattern in this codebase for "global
default, narrowed for authenticated non-super-admins" — reusing it means no new authorization
mechanism (Constitution V, VIII) and no new recursion risk (the existing
`current_profile_role()` SECURITY DEFINER helper already solves the profiles-RLS-self-recursion
problem documented in 001's migration comments). The one addition versus the disaster-event
version: `country_code IS NULL` must also grant access (global sources), which the disaster-event
policy didn't need since every event always has a concrete country_code once geocoded.

**Alternatives considered**:
- Filtering in the frontend only (`sourcesStore.fetchSources()` applies a `.eq`/`.or` filter) —
  rejected as the *sole* mechanism: RLS is the enforcement boundary in this codebase (Constitution
  V); a frontend-only filter is convenience/UX, not security, and a determined client could still
  query Supabase directly and see everything. RLS remains authoritative; the frontend does not need
  its own duplicate filter for `fetchSources()` since Postgres already returns only visible rows.

## 3. How is write access (create/edit) restricted for `country_admin`?

**Decision**: No RLS change needed for INSERT/UPDATE beyond what 001 already has
(`admins_write_data_sources` / `admins_update_data_sources`, gated to `super_admin`/`country_admin`
roles). Add a `CHECK`-style enforcement at the RLS policy level: extend the existing
`admins_write_data_sources`/`admins_update_data_sources` `USING`/`WITH CHECK` clauses so a
`country_admin` may only write rows where `country_code = (SELECT country_code FROM profiles WHERE
id = auth.uid())` (never `NULL`/global, never another country), while `super_admin` keeps
unrestricted write access.

**Rationale**: Consistent with the org/country-scoped write pattern already used for
`cap_drafts`/`incidents`/`drill_sessions` in `20260704_org_scoped_rls.sql` (role-conditional `USING`
clauses per role). Enforcing this in RLS (not just hiding the scope field in
`SourceFormModal.vue`) means the restriction holds even if the form is bypassed — matches
Constitution V's "enforced at the database level" stance already used throughout this schema.

**Alternatives considered**: Enforce only in the Vue form (locking/hiding the scope picker) —
rejected as the sole mechanism for the same reason as item 2 above: form-only restrictions are
UX, not the security boundary.

## 4. Default scope for pre-existing sources

**Decision**: The new `country_code` column defaults to `NULL` (global) with no backfill needed —
`NULL` is the column's natural default, so all 5 existing sources (USGS, Kandilli, AFAD, NASA
FIRMS, etc. — currently registered as `data_sources` rows from 001) remain visible to every admin
exactly as today (spec FR-007, edge case "what happens to existing sources").

**Rationale**: Satisfies SC-002 (no regression) with zero migration-time data work — this is
simpler and lower-risk than an explicit backfill UPDATE statement, and matches spec Assumptions
("no reasonable default exists" is not the case here — global is the only default that preserves
current behavior).

**Alternatives considered**: Backfilling Kandilli/AFAD rows to `country_code = 'TR'` at migration
time — considered, but rejected for *this* migration: the spec's actual reported problem is about
*newly onboarded* countries never seeing Turkey's local sources, not about Turkey's own sources
needing to be hidden from Turkey. Scoping Kandilli/AFAD to `'TR'` is a reasonable follow-up data
change but is an operational/content decision (which sources should actually be marked local),
not a schema requirement — left as a manual admin action via the now-available scope picker
(US3), not hardcoded into the migration.

## 5. Frontend grouping logic placement

**Decision**: Extract a pure function `groupSourcesByScope(sources, viewerCountryCode) => {
global: Source[], local: Source[] }` in `src/utils/sourceScope.js`, called from `AdminView.vue`'s
Sources tab render, rather than inlining a computed property directly in the `.vue` file.

**Rationale**: Matches the existing `src/utils/` convention for small, independently-testable pure
helpers (`severity.js`, `pointInPolygon.js`, `geoCountry.js`) and satisfies the Constitution's
non-negotiable-test-first requirement is NOT triggered here (grouping is not one of the four listed
critical zones: dedup, severity mapping, CAP validation, proximity calc) — but Vitest coverage is
still cheap and valuable given FR-005/FR-006's precise "omit empty section" behavior, so a unit
test is included anyway as good practice, not a constitutional requirement.

**Alternatives considered**: Inline `computed()` in `AdminView.vue` — rejected only because
`AdminView.vue` is already very large (1000+ line diff from the in-flight RBAC work); keeping new
logic in a separate testable file avoids growing that file further, consistent with Constitution
VIII's "smallest change" preference applied to file organization, not just architecture.
