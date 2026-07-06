# Feature Specification: Hazard Taxonomy Admin

**Feature Branch**: `010-hazard-taxonomy-admin`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Build the Hazard Taxonomy Admin module (SRS Module M1, docs/21_structured_srs.md §3.1). Today hazard types (earthquake, wildfire, flood, drought, food_security, tsunami, cyclone, volcano, epidemic) and their severity thresholds are hardcoded: the same HAZARD_TYPES array is duplicated across at least 6 files (ContactFormModal.vue, FileImportForm.vue, ManualEntryForm.vue, SourceFormModal.vue, CapView.vue, IncidentsView.vue), and severity-level breakpoints (e.g. earthquake magnitude >=7.0 = critical) are hardcoded in src/utils/severity.js, supabase/functions/shared/normalize.ts, and server/src/processors/normalizer.js. This directly violates constitution Principle I (Hazard-Agnostic, Model-Driven Design). Scope: (1) a hazard_types registry table (code, display name, category, description, is_active) manageable by super_admin only — global taxonomy, not per-country; deactivation not hard delete; (2) a hazard_thresholds table storing severity-level breakpoints per hazard type, replacing the hardcoded SEVERITY_FN map in src/utils/severity.js only (normalize.ts/normalizer.js are separate runtimes, not touched this phase); (3) an admin UI tab to view/create/edit/deactivate hazard types and thresholds; (4) the 6 hardcoding files migrated to read from a shared hazard-types store backed by this registry, seeded with the 9 existing types so nothing regresses. Out of scope: hierarchical hazard relationships, regional threshold overrides, hazard encyclopedia UI, re-pointing the two backend normalization runtimes. Users: super_admin only for writes; other roles get read-only access via existing selectors."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage the hazard type registry (Priority: P1)

A super_admin opens a new "Hazard Taxonomy" admin tab and sees every hazard type currently known to the system (seeded from the 9 already in production use: earthquake, wildfire, flood, drought, food_security, tsunami, cyclone, volcano, epidemic), each with its category, description, and active/inactive status. They can add a new hazard type (code, display name, category, description) or deactivate an existing one.

**Why this priority**: This directly closes the constitution violation this spec exists to fix — today, adding a hazard type means editing 6+ frontend files plus 3 backend runtimes. Even landing just the registry (without every consumer migrated yet) makes the taxonomy visible and manageable for the first time, and is the foundation every other story in this spec builds on.

**Independent Test**: Can be fully tested by logging in as super_admin, confirming all 9 existing hazard types appear pre-seeded with correct categories, adding a 10th (e.g. "landslide"), and deactivating one, then confirming a non-super_admin role cannot reach this tab at all.

**Acceptance Scenarios**:

1. **Given** the registry has been seeded, **When** a super_admin opens the Hazard Taxonomy tab, **Then** all 9 existing hazard types are listed with their category and active status.
2. **Given** the Hazard Taxonomy tab, **When** a super_admin adds a new hazard type with a unique code, **Then** it is saved and immediately available for selection anywhere a hazard-type selector exists (Story 3).
3. **Given** an existing hazard type with historical disaster-event rows referencing it, **When** a super_admin deactivates it, **Then** the hazard type is marked inactive but historical rows and their hazard_type value remain intact and queryable.
4. **Given** a country_admin, org_admin, or viewer session, **When** they attempt to open the Hazard Taxonomy tab or call its underlying write operations directly, **Then** access is denied — this registry is super_admin-only, unlike this app's other admin features which are country/org-scoped.
5. **Given** an attempt to add a hazard type with a code that already exists (active or inactive), **When** the form is submitted, **Then** it is rejected with a clear "code already exists" message, not a duplicate row.

---

### User Story 2 - Configure severity threshold breakpoints (Priority: P1)

A super_admin selects a hazard type in the Hazard Taxonomy tab and defines its severity breakpoints: a metric name (e.g. "magnitude" for earthquake), a unit, and an ordered list of {minimum value, severity level} pairs (minimal/low/moderate/high/critical).

**Why this priority**: The registry alone (Story 1) only names hazard types; the actual "what to do when data arrives" logic — severity computation — is the other half of the constitution violation. Both are P1 because a hazard type with no threshold config is unusable for real event classification.

**Independent Test**: Can be fully tested by editing earthquake's existing breakpoints (e.g. changing the "critical" threshold from 7.0 to 7.5), then confirming a manually-entered earthquake event with magnitude 7.2 is now classified "high" instead of "critical" — proving the frontend severity computation actually reads the new config instead of the old hardcoded function.

**Acceptance Scenarios**:

1. **Given** a hazard type with no threshold config yet, **When** a super_admin defines breakpoints, **Then** they are saved and used by `computeSeverity()` for that hazard type from that point on.
2. **Given** earthquake's pre-seeded breakpoints (matching today's hardcoded values exactly, so nothing regresses), **When** the system computes severity for a magnitude-6.0 event, **Then** the result is unchanged from today's behavior ("high").
3. **Given** a hazard type's breakpoints are edited, **When** a new event is classified afterward, **Then** the updated breakpoints apply immediately (no deploy needed).
4. **Given** breakpoints submitted out of ascending order (e.g. "high" threshold higher than "critical" threshold), **When** the form is submitted, **Then** it is rejected with a validation error, since ambiguous/contradictory breakpoints would make severity computation nondeterministic.

---

### User Story 3 - Frontend hazard-type selectors read from the registry (Priority: P2)

The 6 files that currently hardcode their own `HAZARD_TYPES` array (ContactFormModal.vue, FileImportForm.vue, ManualEntryForm.vue, SourceFormModal.vue, CapView.vue, IncidentsView.vue) instead read the list of active hazard types from the new registry via a shared store, so a hazard type added in Story 1 automatically appears in every one of these selectors without another code change.

**Why this priority**: This is the "prove the fix actually works end-to-end" story — without it the constitution violation is only half-fixed. It's P2 rather than P1 because it's a mechanical migration of existing working UI, lower risk than the registry/threshold logic itself, and each call site can be migrated independently.

**Independent Test**: Can be fully tested by adding a new hazard type via Story 1, then opening each of the 6 affected forms and confirming the new type appears as a selectable option in all of them, with no code change required.

**Acceptance Scenarios**:

1. **Given** a new hazard type is added via the registry, **When** any of the 6 affected forms is opened, **Then** the new hazard type appears in that form's hazard-type selector.
2. **Given** a hazard type is deactivated, **When** any of the 6 affected forms is opened, **Then** the deactivated type no longer appears as selectable for new entries, but existing rows already using it are unaffected and still display correctly.
3. **Given** the registry is temporarily unreachable (network error), **When** any of the 6 forms loads, **Then** it falls back to the last-known/bundled list rather than showing an empty, unusable selector.

### Edge Cases

- What happens if a threshold breakpoint list is empty (no breakpoints defined) for a hazard type? `computeSeverity()` must have a defined fallback (matching today's existing fallback behavior of returning `'low'` for anything not in the hardcoded map) rather than throwing or returning `null`.
- What happens when a hazard type referenced by existing disaster-event rows is deactivated? Historical event rows are untouched (their `hazard_type` string value doesn't change); only new admin selectors/entry forms stop offering it going forward (Story 1 scenario 3).
- What happens if two super_admins edit the same hazard type's thresholds concurrently? Last write wins, consistent with how every other admin-editable table in this app already behaves (no optimistic-locking precedent exists elsewhere to deviate from).
- What happens to the 9 pre-existing hazard types' data once this feature ships? They are seeded into the registry with their current hardcoded categories/thresholds preserved exactly, so zero behavioral regression on day one (Story 2 scenario 2).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a global (not country-scoped) registry of hazard types: code (unique), display name, category (meteo/hydro/geo/bio/tech), description, and active/inactive status.
- **FR-002**: System MUST restrict hazard type registry write access (create/edit/deactivate) to `super_admin` only; other roles get read-only access via existing selectors, not the admin tab itself.
- **FR-003**: System MUST NOT hard-delete a hazard type — deactivation only, preserving any historical disaster-event rows that reference it.
- **FR-004**: System MUST reject a hazard type creation attempt whose code duplicates an existing one (active or inactive).
- **FR-005**: System MUST maintain, per hazard type, an ordered set of severity threshold breakpoints (metric name, unit, and minimum-value-to-severity-level pairs covering minimal/low/moderate/high/critical).
- **FR-006**: System MUST validate that threshold breakpoints are internally consistent (strictly ascending minimum values across increasing severity levels) before saving.
- **FR-007**: System MUST compute an event's severity using the hazard type's configured breakpoints, with today's exact hardcoded values pre-seeded so no existing severity classification changes on day one.
- **FR-008**: System MUST provide a documented, safe fallback severity (`'low'`, matching current behavior) when a hazard type has no configured breakpoints, rather than failing.
- **FR-009**: System MUST seed the registry with the 9 hazard types currently in production use (earthquake, wildfire, flood, drought, food_security, tsunami, cyclone, volcano, epidemic), preserving their existing categorization and threshold values.
- **FR-010**: The 6 identified frontend call sites (ContactFormModal.vue, FileImportForm.vue, ManualEntryForm.vue, SourceFormModal.vue, CapView.vue, IncidentsView.vue) MUST read their hazard-type options from the shared registry-backed source instead of a locally hardcoded array.
- **FR-011**: Each of the 6 call sites MUST fall back to a bundled/cached list if the registry is unreachable, rather than rendering an empty selector.
- **FR-012**: System MUST log every hazard type/threshold create/edit/deactivate action to the existing audit trail (`log_table_change()` pattern), consistent with every other admin-managed table.

### Key Entities

- **HazardType**: A registry entry for one kind of hazard. Attributes: code (unique, e.g. "earthquake"), display name, category (meteo/hydro/geo/bio/tech), description, active/inactive status.
- **HazardThreshold**: The severity-breakpoint configuration for one hazard type. Attributes: owning hazard type, metric name (e.g. "magnitude"), unit, an ordered array of {minimum value, severity level} pairs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A super_admin can add a brand-new hazard type and have it appear in every relevant selector across the app without any code change or redeploy.
- **SC-002**: Editing a hazard type's severity breakpoints changes how newly-classified events are scored immediately, without a deploy.
- **SC-003**: Zero behavioral change in severity classification for the 9 existing hazard types on the day this feature ships (regression-free migration).
- **SC-004**: Only `super_admin` accounts can create, edit, or deactivate hazard types or their thresholds; every other role is denied.
- **SC-005**: If the hazard-type registry is temporarily unreachable, every one of the 6 affected forms still renders a usable (if possibly stale) hazard-type selector rather than an empty one.

## Assumptions

- `supabase/functions/shared/normalize.ts` (Deno Edge Functions) and `server/src/processors/normalizer.js` (the separate Node.js aggregator) continue using their own hardcoded severity logic in this phase — re-pointing those two independent runtimes at the same DB-driven config is a larger follow-up, not required for this spec's Success Criteria.
- The existing 9 hazard types' current hardcoded category groupings (not previously explicit anywhere in code) are inferred reasonably for seeding (e.g. earthquake/tsunami/volcano -> geo, wildfire -> meteo-adjacent, flood/drought -> hydro, food_security -> bio/socio) and can be corrected by a super_admin post-launch without any migration.
- No existing UI currently exposes hazard *categories* to end users; this spec introduces category as a registry attribute for future grouping/filtering use, not as a new mandatory user-facing filter in this phase.
