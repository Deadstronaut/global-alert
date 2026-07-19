# Feature Specification: Country-Locked Map View

**Feature Branch**: `044-country-locked-exclusive-layers`

**Created**: 2026-07-19

**Status**: Draft

**Note (2026-07-19)**: This feature originally also included a "mutually exclusive hexagon
layers" component (hiding the hazard-event hexagon grid whenever an exposure layer was toggled
on, and vice versa). That component was implemented, then explicitly reverted at the user's
request after live review — the desired behavior is the opposite: the left-side hazard view mode
(status/hexagon/heat) and the right-side exposure-layer panel MUST coexist independently, never
hide each other, so a user can see how a selected exposure layer (e.g. roads, rivers, WorldPop
population) correlates with the hazard status/hexagon/heat view underneath it. This spec has been
rewritten to reflect only the surviving scope (the country-locked camera behavior). The directory
name (`044-country-locked-exclusive-layers`) is kept as-is for continuity with the git history
rather than renamed.

**Input**: User description (original): "Country-locked map view with mutually exclusive hexagon
layers. Context: this project has two related map UX gaps discovered in practice. (1)
Country-scoped/locked user accounts (this project's existing federated-per-country login
architecture — anon users see all countries, logged-in users are scoped to exactly one country)
currently get no special map camera behavior at all: the map still behaves like the global/anon
browsing mode (free pan/zoom across all countries, double-click on any country flies the camera
there). For a country-locked user, the map should instead open already fitted to their own
country's bounds at a sensible default zoom (e.g. Turkey ~5.2 — a per-country configurable value,
not hardcoded, following this project's existing data-driven-not-hardcoded convention for
country-specific behavior), and the existing double-click-to-navigate-to-a-different-country
interaction should simply not be wired up for that user (they can still zoom in/out and pan within
reason, they just can't select a different country's hexagon/data). Anon/global users keep today's
existing behavior unchanged (single-click selects a country and shows its hazard-event hexagon
grid, double-click flies/zooms to that country)." (The original description's second part, about
mutually exclusive hexagon layers, is superseded by the Note above and intentionally omitted here.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A country-locked user opens the map already on their own country (Priority: P1) 🎯 MVP

A user whose login is scoped to a single country (this project's existing federated-per-country
account model) opens the map and sees it already framed on their own country at a sensible zoom
level, instead of a world view they'd have to manually navigate from.

**Why this priority**: This is the most visible, most frequently experienced gap — every single
session by a country-scoped user currently starts with an irrelevant global view before they can
do anything useful.

**Independent Test**: Log in as a country-locked user (e.g. Turkey-scoped), open the map, confirm
the initial camera is already fitted to Turkey's bounds at that country's configured default zoom,
with no manual navigation required.

**Acceptance Scenarios**:

1. **Given** a user's login is scoped to Turkey, **When** they open the map, **Then** the map's
   initial camera is fitted to Turkey's bounds at Turkey's configured default zoom level (no
   manual zoom/pan needed to see their own country).
2. **Given** a user's login is scoped to Madagascar, **When** they open the map, **Then** the same
   outcome occurs for Madagascar, using the same generic per-country configuration mechanism as
   Turkey (no country-specific code).
3. **Given** an anonymous (non-logged-in) user, **When** they open the map, **Then** today's
   existing global/world view behavior is unchanged.

---

### User Story 2 - A country-locked user cannot navigate away to another country (Priority: P1) 🎯 MVP

A country-locked user tries to interact with a country other than their own on the map (e.g.
double-clicking a neighboring country) and nothing happens — they remain within their own
country's data, since their account has no access to any other country's information.

**Why this priority**: Directly enforces this project's existing country-scoping access model at
the map-interaction level — without this, a locked user could still visually navigate to another
country even though the underlying data access is already restricted, creating a confusing
"you can look but the data won't follow" experience.

**Independent Test**: As a country-locked user, double-click on a country other than the one
you're scoped to; confirm no camera navigation occurs and no other country's hexagon/data
selection is triggered. Confirm normal zoom in/out and panning within the view still work.

**Acceptance Scenarios**:

1. **Given** a Turkey-scoped user, **When** they double-click on a different country on the map,
   **Then** the camera does not fly to that country and that country's data is not selected.
2. **Given** a Turkey-scoped user, **When** they zoom in or pan around the map, **Then** normal
   zoom/pan interaction still works freely (only cross-country navigation is restricted).

### Edge Cases

- What happens if a country-locked user has no configured default zoom value for their country
  yet? → Fall back to a reasonable generic default (fit-to-bounds with standard padding, matching
  the existing anon-mode zoomToCountry behavior) rather than failing to open the map — this
  mirrors the project's general "missing per-country config degrades gracefully, never blocks
  access" convention.
- What happens when a country-locked user's own country has zero hazard events or zero exposure
  data at the moment they open the map? → The map still opens correctly framed on their country;
  an empty hexagon grid/layer is a normal, expected state (matches this project's general
  "zero valid records is not a failure" convention), not an error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a country-locked user opens the map, the system MUST set the initial camera to
  fit that user's assigned country's bounds at a per-country configurable default zoom level.
- **FR-002**: The per-country default zoom level MUST be derived from configuration/data (not
  hardcoded per-country logic in source code) — onboarding a new country's default zoom MUST be
  achievable by adding configuration, not by changing code.
- **FR-003**: If a country-locked user's country has no configured default zoom, the system MUST
  fall back to a fit-to-bounds camera view (matching the existing anon-mode zoom-to-country
  behavior) rather than failing to display the map.
- **FR-004**: For a country-locked user, the system MUST NOT allow the double-click-to-navigate
  interaction to select or fly the camera to any country other than the user's own assigned
  country.
- **FR-005**: For a country-locked user, normal zoom and pan interaction within the map MUST
  continue to function without restriction.
- **FR-006**: For an anonymous (non-logged-in) user, all existing map camera and navigation
  behavior (free pan/zoom, single-click select, double-click fly-to-country) MUST remain
  unchanged.
- **FR-007**: This feature MUST NOT alter how exposure datasets are fetched, aggregated, computed,
  or stored (specs 038/040/041/043's pipelines), and MUST NOT hide or otherwise coordinate
  visibility between the hazard-event hexagon grid / heat view and the exposure-layer panel — the
  two MUST remain fully independent and simultaneously visible, so a user can visually correlate a
  selected exposure layer (e.g. roads, rivers, WorldPop population) against whichever hazard view
  mode (status/hexagon/heat) is currently active underneath it. *(This requirement replaces the
  original spec's FR-007 through FR-010, which described the opposite — mutually exclusive —
  behavior; see the Note at the top of this document.)*

### Key Entities

- **Country default zoom configuration**: A per-country value representing the map's default
  zoom level when a country-locked user opens the map on that country — data-driven, extensible to
  new countries without code changes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A country-locked user's first view of the map, on every session, is already framed
  on their own country — 0 manual navigation actions required to see their own country's data.
- **SC-002**: A country-locked user cannot cause the map camera to navigate to, or select data
  for, any country other than their own, verified across repeated double-click attempts on other
  countries.
- **SC-003**: Anonymous/global users experience zero behavioral change to today's existing map
  navigation.
- **SC-004**: Toggling any exposure-layer dataset on/off never changes the currently-active hazard
  view mode (status/hexagon/heat), and switching the hazard view mode never changes which
  exposure-layer datasets are visible — the two remain independently controllable at all times.

## Assumptions

- "Country-locked user" refers to this project's existing federated-per-country login/account
  scoping (already implemented and documented as intentional architecture) — this feature adds
  map-camera behavior for that existing user category; it does not introduce any new
  authentication or authorization mechanism.
- The per-country default zoom value is a new, small piece of configuration (e.g. one numeric
  column/table entry per country) — where exactly it is stored is a planning-phase decision, not a
  product-scope one; any storage location consistent with this project's existing
  data-driven-per-country-config convention (used by served-country lists, HydroSHEDS continent
  mapping, etc.) satisfies this requirement.
- Restricting cross-country double-click navigation for a locked user is a map-interaction-layer
  change only; it is not a substitute for and does not replace any existing server-side/API-level
  data access restriction already in place for that user's account scope.
