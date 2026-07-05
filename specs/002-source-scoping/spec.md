# Feature Specification: Data Source Country Scoping

**Feature Branch**: `002-source-scoping`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "Data source country scoping: add an optional country_code (scope) column to the data_sources table so sources can be marked as global (visible/managed by everyone, e.g. USGS, NASA FIRMS) or country-specific (visible/managed only by that country's admins, e.g. Kandilli/AFAD for Turkey). Super Admin (UN level) sees and manages all sources. A Country Admin (e.g. Madagascar) should only see global sources plus sources scoped to their own country — never another country's local sources. In the existing 'Sources' tab (AdminView.vue / SourceHealthCard.vue), render global sources in one group at the top, a thin visual divider, then the country-specific sources for the viewing admin's country below it. This does not change how disaster events themselves are country-tagged (that already works via existing country_code/boundary geocoding on events) — this is purely about scoping the data_sources catalog/admin visibility and management, building on top of the existing 001-data-ingestion-monitoring feature (data_sources table, sourcesStore, Sources tab)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Country Admin sees only relevant sources (Priority: P1)

A Country Admin for a newly onboarded country (e.g. Madagascar) opens the Sources tab and sees only the sources that are actually relevant to their country: worldwide sources (USGS, NASA FIRMS, etc.) plus any source specifically configured for their own country. They never see another country's local sources (e.g. Kandilli, AFAD for Turkey), so the panel reads as if it were built for their country alone.

**Why this priority**: This is the core problem reported by the user — onboarding a new country currently leaks unrelated countries' local infrastructure into the admin view, which breaks the "clean slate per country" expectation and is confusing/inappropriate for a country ministry to see another nation's internal source list.

**Independent Test**: Log in as a Country Admin scoped to a country with no local sources configured (e.g. Madagascar); confirm the Sources tab shows only global sources and zero Turkey-specific entries.

**Acceptance Scenarios**:

1. **Given** a Country Admin scoped to Madagascar, **When** they open the Sources tab, **Then** they see all global sources and zero sources scoped to Turkey or any other country.
2. **Given** a Country Admin scoped to Turkey, **When** they open the Sources tab, **Then** they see all global sources plus all sources scoped to Turkey (e.g. Kandilli, AFAD), and no sources scoped to any other country.
3. **Given** a source has no country scope set (global), **When** any Country Admin of any country views the Sources tab, **Then** that source is visible to all of them.

---

### User Story 2 - Grouped display: global vs. local (Priority: P1)

Within the Sources tab, an admin (any role) sees global sources grouped together at the top, then a clear visual divider, then their country's local sources below it — so the distinction between "worldwide infrastructure" and "our own local feed" is immediately obvious at a glance, without reading each row individually.

**Why this priority**: Directly requested by the user as the UI shape for this feature; without it, even correctly-scoped data reads as one undifferentiated list and doesn't communicate the global/local distinction.

**Independent Test**: As any admin with at least one global and one country-scoped source visible, open the Sources tab and confirm two visually separated groups appear in a fixed order (global first, local second), each internally consistent (no interleaving).

**Acceptance Scenarios**:

1. **Given** an admin has both global and country-scoped sources visible, **When** they open the Sources tab, **Then** global sources render as one contiguous group above a visual divider, and country-scoped sources render as one contiguous group below it.
2. **Given** an admin's country has zero local sources configured, **When** they open the Sources tab, **Then** only the global group is shown (the divider and empty local group are not rendered as a confusing blank section).
3. **Given** a Super Admin (UN level) who can see sources from multiple countries at once, **When** they open the Sources tab, **Then** sources are grouped as global first, then local sources grouped/labeled per country (so multiple countries' sources are not merged into one undifferentiated "local" bucket).

---

### User Story 3 - Super Admin manages scope when creating/editing a source (Priority: P2)

A Super Admin (UN level), when creating a new source or editing an existing one, can set its scope: either "global" (no country) or a specific country. A Country Admin creating a source (per existing 001 permissions) can only create sources scoped to their own country — they cannot create or reassign a source as global or to another country.

**Why this priority**: Without a way to set scope, the new column is inert — sources default to one state forever. This is required for the feature to be usable, but is secondary to the read/visibility behavior (US1/US2) which is the reported pain point.

**Independent Test**: As a Super Admin, create a new source and set it to global; create another and scope it to a specific country; confirm both save and appear in the correct group for the correct audience. As a Country Admin, confirm the scope field is locked to their own country in the creation form.

**Acceptance Scenarios**:

1. **Given** a Super Admin is creating a source, **When** they choose "Global" scope, **Then** the source is saved with no country association and becomes visible to all admins.
2. **Given** a Super Admin is creating a source, **When** they choose a specific country as scope, **Then** the source is saved as scoped to that country and becomes visible only to that country's admins (plus Super Admin).
3. **Given** a Country Admin is creating a source, **When** they open the creation form, **Then** the scope is pre-set/locked to their own country and cannot be changed to global or another country.
4. **Given** an existing country-scoped source, **When** a Super Admin edits it to change its country scope, **Then** the change takes effect immediately and the source moves to the correct group for all affected admins on next view.

### Edge Cases

- What happens when a source has a country scope value that doesn't match any known/active country (e.g. the country was deprovisioned)? The source should still be visible to Super Admin (so it can be reassigned or removed) but should not appear for any Country Admin.
- How does the system handle a Country Admin whose own account has no country assigned (misconfigured profile)? They should see only global sources and no local group, rather than erroring or seeing everything.
- What happens to existing sources created before this feature (all currently unscoped)? They must default to "global" scope so nothing that is currently visible disappears or breaks for existing admins.
- What happens when an Org Admin or Viewer (non-country-admin roles) opens the Sources tab? They follow the same scoping rule as the Country Admin of their own country (global + their own country's local sources), consistent with existing 001 read-visibility rules.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow each data source to be assigned either a "global" scope (no country) or a scope of exactly one specific country.
- **FR-002**: System MUST show every admin all global-scope sources, regardless of the admin's own country.
- **FR-003**: System MUST show a Country Admin (and Org Admin/Viewer) only the country-scoped sources that match their own assigned country, never another country's sources.
- **FR-004**: System MUST show a Super Admin (UN level) all sources regardless of scope, with country-scoped sources clearly labeled by their country.
- **FR-005**: The Sources tab MUST render global-scope sources as one visually grouped section positioned above a visual divider, and country-scoped sources as a separate grouped section below it.
- **FR-006**: The Sources tab MUST omit the local-sources group and divider entirely when the viewing admin has zero visible country-scoped sources (no empty section shown).
- **FR-007**: System MUST default every pre-existing data source (created before this feature) to "global" scope, preserving current visibility for all existing admins.
- **FR-008**: System MUST restrict a Country Admin's source-creation and source-editing actions to their own country's scope only — they cannot create or reassign a source as global or to a different country.
- **FR-009**: System MUST allow a Super Admin to set or change any source's scope to global or to any specific country.
- **FR-010**: System MUST NOT alter how individual disaster events are tagged with a country (existing event-level `country_code`/boundary-geocoding behavior is out of scope for this feature and remains unchanged).

### Key Entities

- **Data Source Scope**: An attribute of an existing data source record representing either "global" (no country) or a single specific country. Determines catalog visibility and management permissions, independent of the country tagging applied to individual disaster events.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin for a newly onboarded country with no local sources sees zero unrelated countries' sources in the Sources tab, 100% of the time.
- **SC-002**: 100% of existing sources remain visible to the admins who could already see them before this feature ships (no regression from the default-to-global rule).
- **SC-003**: An admin can visually distinguish global vs. local sources within 2 seconds of opening the Sources tab without reading individual row labels (grouped layout with divider).
- **SC-004**: A Country Admin's attempt to create or reassign a source outside their own country's scope is blocked 100% of the time.

## Assumptions

- "Country" for scoping purposes is the same `country_code` concept already established by the 001 feature and the existing profiles/RLS model (e.g. `profiles.country_code`) — no new country/region taxonomy is introduced.
- Org Admins and Viewers inherit the same source-visibility rule as the Country Admin of their own country (read visibility only; creation/editing remains restricted per existing 001 role rules).
- A source is scoped to exactly one country or is global — multi-country shared local sources are out of scope for this feature (can be revisited later if a real case arises).
- This feature only affects the `data_sources` catalog and its admin UI; it does not touch `fetch-*` edge functions' actual polling logic, deduplication, or event ingestion pipeline.
- Existing Super Admin, Country Admin, Org Admin, and Viewer role definitions from `docs/security_roles_protocol.md` and the 001 feature remain unchanged; this feature only adds a new dimension (source scope) to what each role can see/edit within the Sources tab.
