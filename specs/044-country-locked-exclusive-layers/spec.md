# Feature Specification: Country-Locked Map View with Mutually Exclusive Hexagon Layers

**Feature Branch**: `044-country-locked-exclusive-layers`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Country-locked map view with mutually exclusive hexagon layers.
Context: this project has two related map UX gaps discovered in practice. (1) Country-scoped/
locked user accounts (this project's existing federated-per-country login architecture — anon
users see all countries, logged-in users are scoped to exactly one country) currently get no
special map camera behavior at all: the map still behaves like the global/anon browsing mode
(free pan/zoom across all countries, double-click on any country flies the camera there). For a
country-locked user, the map should instead open already fitted to their own country's bounds at
a sensible default zoom (e.g. Turkey ~5.2 — a per-country configurable value, not hardcoded,
following this project's existing data-driven-not-hardcoded convention for country-specific
behavior), and the existing double-click-to-navigate-to-a-different-country interaction should
simply not be wired up for that user (they can still zoom in/out and pan within reason, they just
can't select a different country's hexagon/data). Anon/global users keep today's existing
behavior unchanged (single-click selects a country and shows its hazard-event hexagon grid,
double-click flies/zooms to that country). (2) Independently of the above, there are currently two
different kinds of hexagon-shaped map layers that were never designed to interact: (a) the
existing hazard-event hexagon grid that appears when a country is single-clicked/selected
(clusters hazard events by lat/lng into hexagon cells — already implemented, works well per user
feedback), and (b) the newer generic exposure-layer panel (spec 042/043 — population/Kontur,
WorldPop, roads, rivers, watershed-basin hexagon/vector layers, independently toggleable, each
with click-to-inspect popups showing real metric values). Right now both can be visible
simultaneously with no coordination, which is confusing and wasn't an intentional design. The fix:
introduce a single shared 'active hexagon view' concept with exactly two mutually exclusive
states — 'hazard' (the event hexagon grid) and 'exposure' (any exposure-layer panel dataset).
Turning on the hazard hex view automatically turns off any active exposure layers; turning on any
exposure layer automatically turns off the hazard hex view. Within the 'exposure' state, multiple
exposure datasets may still be toggled on simultaneously exactly as spec 042 already allows
(population + roads + rivers together, for example) — the mutual exclusion is only between the
'hazard' state and the 'exposure' state as a whole, not between individual exposure datasets. This
feature is UI/UX and map-interaction logic only — no changes to how exposure datasets are
fetched, aggregated, or stored (specs 038/040/041/043's pipelines are unaffected); it only changes
when/how these two already-existing categories of hexagon layers are shown together on the map,
plus adds the country-locked camera behavior for scoped logins."

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

---

### User Story 3 - Selecting one hexagon view automatically closes the other (Priority: P1) 🎯 MVP

A user viewing the hazard-event hexagon grid (shown after selecting a country) switches to an
exposure layer (e.g. population) from the exposure-layer panel, and the hazard hexagon grid
disappears automatically — and vice versa — so only one kind of hexagon layer is ever visible at
once, avoiding the current confusing overlap.

**Why this priority**: This is the second concrete, currently-broken behavior the feature exists
to fix — today both layer types can linger on screen simultaneously with no coordination.

**Independent Test**: With a country selected (hazard hexagon grid visible), toggle on any
exposure-layer dataset from the panel; confirm the hazard hexagon grid disappears. Then toggle the
exposure layer off and reselect the hazard view; confirm the exposure layer(s) disappear.

**Acceptance Scenarios**:

1. **Given** the hazard-event hexagon grid is currently visible for a selected country, **When**
   a user toggles on an exposure-layer dataset (e.g. WorldPop population), **Then** the hazard
   hexagon grid is hidden and the exposure layer becomes visible.
2. **Given** one or more exposure-layer datasets are currently visible, **When** a user re-selects
   the country to show the hazard hexagon grid again, **Then** all currently-visible exposure
   layers are hidden and the hazard hexagon grid becomes visible.
3. **Given** one or more exposure-layer datasets are already visible, **When** a user toggles on
   an additional exposure-layer dataset, **Then** both remain visible together (multi-select
   within the exposure state is unaffected — only the hazard-vs-exposure switch is exclusive).

### Edge Cases

- What happens if a country-locked user has no configured default zoom value for their country
  yet? → Fall back to a reasonable generic default (fit-to-bounds with standard padding, matching
  the existing anon-mode zoomToCountry behavior) rather than failing to open the map — this
  mirrors the project's general "missing per-country config degrades gracefully, never blocks
  access" convention.
- What happens if a user switches from the hazard hexagon view directly to a second exposure
  layer while a first exposure layer is already active? → No conflict — both exposure layers
  coexist normally (User Story 3, Acceptance Scenario 3); the exclusivity only ever fires on a
  hazard-vs-exposure transition, not between exposure layers.
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
- **FR-007**: The system MUST maintain a single shared "active hexagon view" state with exactly
  two mutually exclusive values: the hazard-event hexagon grid, or the exposure-layer panel's
  active dataset(s).
- **FR-008**: When the hazard-event hexagon grid becomes active, the system MUST automatically
  deactivate (hide) any currently-visible exposure-layer datasets.
- **FR-009**: When any exposure-layer dataset becomes active, the system MUST automatically
  deactivate (hide) the hazard-event hexagon grid if it is currently visible.
- **FR-010**: Multiple exposure-layer datasets MUST remain independently toggleable amongst
  themselves (existing spec 042 behavior) — the mutual exclusion introduced by this feature
  applies only between the hazard state and the exposure state as a whole, never between
  individual exposure datasets.
- **FR-011**: This feature MUST NOT alter how exposure datasets are fetched, aggregated, computed,
  or stored (specs 038/040/041/043's pipelines) — it changes only map camera/interaction behavior
  and hexagon-layer visibility coordination.

### Key Entities

- **Country default zoom configuration**: A per-country value representing the map's default
  zoom level when a country-locked user opens the map on that country — data-driven, extensible to
  new countries without code changes.
- **Active hexagon view state**: A single shared piece of map UI state representing which of the
  two mutually exclusive hexagon-layer categories (hazard-event grid, or exposure-layer panel) is
  currently shown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A country-locked user's first view of the map, on every session, is already framed
  on their own country — 0 manual navigation actions required to see their own country's data.
- **SC-002**: A country-locked user cannot cause the map camera to navigate to, or select data
  for, any country other than their own, verified across repeated double-click attempts on other
  countries.
- **SC-003**: At any point in time, at most one of {hazard-event hexagon grid, exposure-layer
  panel} is visible on the map — never both simultaneously.
- **SC-004**: Switching between the hazard hexagon view and any exposure layer (in either
  direction) requires exactly one user action (one click/toggle) — no manual "turn off the other
  one first" step is ever required.
- **SC-005**: Anonymous/global users experience zero behavioral change to today's existing map
  navigation.

## Assumptions

- "Country-locked user" refers to this project's existing federated-per-country login/account
  scoping (already implemented and documented as intentional architecture) — this feature adds
  map-camera and layer-visibility behavior for that existing user category; it does not introduce
  any new authentication or authorization mechanism.
- The per-country default zoom value is a new, small piece of configuration (e.g. one numeric
  column/table entry per country) — where exactly it is stored is a planning-phase decision, not a
  product-scope one; any storage location consistent with this project's existing
  data-driven-per-country-config convention (used by served-country lists, HydroSHEDS continent
  mapping, etc.) satisfies this requirement.
- "Hazard-event hexagon grid" refers to the existing, already-implemented hexagon-shaped
  clustering of hazard events by latitude/longitude shown when a country is selected — this
  feature does not change how that grid computes or clusters events, only when it is shown
  relative to the exposure-layer panel.
- "Exposure-layer panel" refers to the existing generic layer panel introduced in spec 042
  (population/Kontur, WorldPop, roads, rivers, watershed basins, and any future exposure source) —
  this feature does not change what datasets appear there or how they are fetched, only the
  panel's coordination with the hazard hexagon grid's visibility.
- Restricting cross-country double-click navigation for a locked user is a map-interaction-layer
  change only; it is not a substitute for and does not replace any existing server-side/API-level
  data access restriction already in place for that user's account scope.
