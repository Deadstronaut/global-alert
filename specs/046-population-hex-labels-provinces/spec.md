# Feature Specification: Population Hexagon Labels + Province-Level Population View

**Feature Branch**: `046-population-hex-labels-provinces`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Hexagon population labels + province-level population view: (1) When a country's hexagon grid is at a zoom/resolution where individual hexagons are large enough to read text, display the aggregated population number as a label inside each hexagon, reusing the already-loaded population exposure dataset's metric_value per cell — only relevant when a population exposure layer is the active/selected one. (2) Add the ability to view population aggregated by administrative/province boundaries (e.g. Turkey's il — Aydın, İzmir) instead of hexagons, reusing the province boundary data already bundled in the app for at least Turkey and Malaysia; a country without boundary data should degrade gracefully rather than error."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read population counts directly off the hexagon grid (Priority: P1)

A user has selected a country and turned on a population exposure layer (Kontur or WorldPop). As they zoom in, each hexagon is large enough to read comfortably. Today they must click a hexagon and read a popup to learn its population; this story lets them see the number directly on the map without clicking anything, for every hexagon in view at once.

**Why this priority**: This is the concrete, immediately-usable half of the request — it makes population data readable at a glance and was the first thing asked for, with an existing data source (no new fetch).

**Independent Test**: With a population exposure layer active and a country selected, zoom in until hexagons are visually large; confirm each hexagon shows its population number, that labels disappear again when zoomed out past the readability threshold, and that no crash/slowdown occurs on the country with the most hexagons.

**Acceptance Scenarios**:

1. **Given** a population exposure layer (Kontur or WorldPop) is toggled on for the selected country, **When** the user zooms in far enough that hexagons render at a size where text is legible, **Then** each visible hexagon displays its population count as a number.
2. **Given** hexagon labels are showing, **When** the user zooms back out past the legibility threshold, **Then** the labels disappear (hexagon fills remain, only the text is hidden) to avoid unreadable overlapping numbers.
3. **Given** no population exposure layer is active (e.g. only "durum"/hazard-status hex mode, or no exposure layer toggled on), **When** the user views the hexagon grid, **Then** no population numbers are shown — labels only ever apply to population-layer hexagons.
4. **Given** a hexagon's population value is very large (e.g. hundreds of thousands), **When** its label renders, **Then** the number is displayed in a compact, readable form (e.g. "482K" rather than "482367") rather than overflowing the hexagon.

---

### User Story 2 - View population by province instead of by hexagon (Priority: P2)

A user wants to understand population at a familiar administrative granularity — "how many people live in Aydın vs. İzmir" — rather than an abstract hexagon grid. This story adds a toggle to switch the population view from hexagons to province-level shading, using each province's total population (summed from the underlying population exposure data) with the same graduated color treatment already used for population hexagons.

**Why this priority**: Valuable but more speculative ("bir ihtimalimiz olabilir mi" — "could we possibly...") than Story 1, and depends on per-country boundary data whose completeness across all served countries is not yet confirmed — lower priority, buildable after Story 1 ships.

**Independent Test**: For a country with available province boundary data, switch the population view to "by province"; confirm each province is shaded by its aggregated population with a visible legend/label, and that switching back to hexagon view restores the prior display exactly.

**Acceptance Scenarios**:

1. **Given** a population exposure layer is active for a country that has province boundary data available, **When** the user switches to province view, **Then** the map shows each province shaded by its total aggregated population instead of hexagons.
2. **Given** province view is active, **When** the user clicks/hovers a province, **Then** they see the province's name and total population (mirroring the existing hexagon click-to-inspect popup pattern).
3. **Given** a country has no province boundary data available, **When** the user attempts to switch to province view for that country, **Then** the option is unavailable or clearly disabled (not a broken/blank map) — the hexagon view remains fully usable.
4. **Given** province view is active, **When** the user switches back to hexagon view, **Then** the hexagon grid reappears exactly as it was before switching (no lost state).

---

### Edge Cases

- What happens when a population layer with zero features is active (e.g. an unpopulated area)? Hexagons/provinces with no population data show no label / neutral shading rather than "0" or an error.
- What happens if both Kontur and WorldPop population layers are toggled on simultaneously? Each layer's own hexagons show their own labels independently (matches existing per-layer toggle behavior — no merging of the two sources' numbers).
- What happens when the user is zoomed to a level where hexagons are technically "large enough" per a fixed threshold, but there are still thousands of them on screen (e.g. panning across a dense city)? Label rendering must not visibly stall map interaction — see SC-002.
- What happens when a province's boundary partially overlaps two hexagon-population source datasets (e.g. sits right at the edge of available data)? The province shows the sum of whatever population data intersects it; a province with no intersecting data at all is treated like the zero-population case above.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display each hexagon's aggregated population value as an on-map text label once the hexagon grid is rendered at a size where the label is legible, and MUST hide these labels below that size threshold.
- **FR-002**: Population hexagon labels MUST only appear when a population-sourced exposure layer (Kontur or WorldPop) is the one currently rendering that hexagon grid — hazard-status ("durum") hexagons and non-population exposure layers are never labeled by this feature.
- **FR-003**: Large population values MUST be displayed in an abbreviated form (e.g. thousands/millions suffix) rather than the full raw number, to fit inside a hexagon.
- **FR-004**: System MUST provide a way for the user to switch the population view from per-hexagon display to per-province (administrative boundary) display, for countries where province boundary data is available.
- **FR-005**: Province view MUST shade each province using the same graduated (choropleth) color convention already used for population hexagons, scaled to that country's actual min/max province population.
- **FR-006**: Province view MUST show a province's name and aggregated population on click/hover, consistent with the existing exposure-feature popup pattern.
- **FR-007**: For a country with no available province boundary data, the province-view option MUST be unavailable (disabled/hidden) rather than producing a broken or empty map when selected.
- **FR-008**: Switching between hexagon view and province view MUST NOT lose or corrupt the underlying population data or other independent map state (selected country, other active exposure layers, hazard-status mode).
- **FR-009**: Province-level population totals MUST be derived from the already-loaded population exposure data (aggregating existing per-cell values into each province), not from a new/separate data fetch or a new backend data source.

### Key Entities

- **Population hexagon label**: A per-cell text overlay showing that cell's population value, derived from the population exposure dataset's existing metric value — no new stored entity, a rendering-only derivative of existing data.
- **Province population aggregate**: A per-province total population value, computed by summing the population exposure data that falls within that province's boundary — derived at render/view-switch time from existing exposure data and existing province boundary geometry, not persisted as a new table.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can read a hexagon's population count directly from the map, without opening a popup, for any hexagon visible once zoomed to a legible size.
- **SC-002**: Turning on hexagon population labels for the densest served country's population layer does not introduce a noticeable map interaction stall (panning/zooming remains smooth, matching the existing unlabeled hexagon grid's responsiveness).
- **SC-003**: A user can switch to province-level population view for any served country that has boundary data, and see population differences between provinces at a glance via shading, without needing to click each one individually.
- **SC-004**: Attempting province view on a country without boundary data never produces a blank, broken, or crashed map — the user always has a working population view available (hexagon view).

## Assumptions

- Turkey and Malaysia already have province/admin-boundary geometry bundled in the app (existing `tr-provinces` / `my-provinces` data, used elsewhere for admin boundary selection); this feature reuses that data rather than sourcing new boundary geometry. Madagascar's boundary-data availability is unconfirmed and will be verified during planning; if unavailable, Madagascar simply falls under FR-007's graceful-degradation case for launch.
- The "legible size" zoom/resolution threshold for showing hexagon labels is a reasonable default tuned during implementation (e.g. tied to spec 045's existing hex-resolution levels) rather than a user-configurable setting — this keeps the feature simple (Constitution Principle VIII) and matches how the existing manual resolution slider already caps hexagon count for performance.
- Both parts of this feature operate only on data already loaded for the currently active population exposure layer(s) — they do not change how or when that underlying data is fetched (spec 042's existing fetch/render pipeline, and this session's fix ensuring Kontur data loads within performance limits).
- Province view is a distinct, manually-toggled display mode, independent of the automatic zoom-based hexagon resolution and the manual resolution slider from spec 045 — switching to province view does not change or interact with the slider's stored value.
