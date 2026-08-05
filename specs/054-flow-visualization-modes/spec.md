# Feature Specification: Flow Visualization Modes & Overlays

**Feature Branch**: `054-flow-visualization-modes`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Extend the existing wind/ocean-current flow-visualization feature (specs/053-wind-flow-visualization) into the full nullschool.net/NASA GEOS-5-style Mode + Animate + Overlay control system. The user wants this app's flow-visualization panel to match that reference tool's structure, not just wind+currents. Already shipped: Animate=Wind and Animate=Currents. Real data sources identified: CAMS/Copernicus/ECMWF (aerosols/chem), CMEMS (already integrated for Currents), OVATION/SWPC/NOAA (space weather/aurora), WAVEWATCH III/NCEP/NWS (ocean waves)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See ocean wave conditions animated on the map (Priority: P1)

An operator monitoring a coastal country wants to see current ocean wave height/direction on the map the same way they can already see wind and ocean currents, so they can judge sea-state risk (e.g. for evacuation-by-boat planning or coastal-hazard awareness) without leaving the map.

**Why this priority**: Waves is the most natural next step — it reuses the same "Ocean" grouping Currents already established, has a well-known free public data source, and was one of only two concrete extensions the user repeatedly pointed at (the other being Chem/Particulates, User Story 2).

**Independent Test**: Can be fully tested by opening the flow control panel, selecting Ocean mode, enabling the Waves animation, and confirming animated wave data renders on the map with a correct "as of" timestamp — independent of whether Chem/Particulates (User Story 2) exists.

**Acceptance Scenarios**:

1. **Given** the flow control panel is open, **When** the user selects Ocean mode and enables Waves, **Then** an animated layer showing wave direction/height appears on the map within the same performance budget as the existing Wind/Currents layers.
2. **Given** Waves is enabled, **When** the underlying data hasn't refreshed within its expected cadence, **Then** the panel shows the same "stale data" warning pattern already used for Wind/Currents.
3. **Given** the wave data source has no coverage for the user's current map view (e.g. a fully landlocked area), **When** Waves is enabled, **Then** the map shows no wave particles there without an error, consistent with how Wind/Currents already behave over data gaps.

---

### User Story 2 - See air quality / aerosol conditions as a color overlay (Priority: P2)

An operator wants to see current air-quality conditions (particulate matter, aerosol concentration) as a color-graded layer on the map, the way the reference tool shows "Sulfate Extinction" or "PM2.5" overlays, so they can factor air quality into public-health guidance during events like wildfires or dust storms.

**Why this priority**: This is the second concrete, real-data-backed extension the user repeatedly pointed at (CAMS/Copernicus). It introduces a genuinely new visual layer type (a color-graded overlay, not an animated particle flow) rather than reusing the Wind/Currents pattern directly, and gives the panel real value even for countries with no meaningful wind/current/wave story that day (e.g. an inland wildfire-smoke event) — so it's sequenced right after the more directly-reusable Waves story.

**Independent Test**: Can be fully tested by opening the flow control panel, choosing an air-quality overlay (e.g. PM2.5), and confirming a color-graded layer with a legend appears on the map — independent of whether Waves (User Story 1) exists.

**Acceptance Scenarios**:

1. **Given** the flow control panel is open, **When** the user selects an air-quality overlay, **Then** a color-graded layer with a legend (matching this app's existing gridded-metric legend style) appears on the map.
2. **Given** an air-quality overlay is active, **When** the user also has Wind enabled, **Then** both layers are visible together (animated flow over/under the color overlay), matching the reference tool's combined "Wind @ Surface + [overlay]" presentation.
3. **Given** no air-quality data is available yet for the current period, **When** the user selects the overlay, **Then** the panel shows the same graceful "unavailable" state already used elsewhere in this panel, not a broken/blank layer.

---

### User Story 3 - Understand what's available vs. not yet supported (Priority: P3)

A user browsing the flow control panel for the first time wants to see the full range of modes the reference tool offers (Air, Ocean, Chem, Particulates, Space, Bio) so they understand the app's ambition, while clearly seeing which ones are functional today versus planned for later — without being misled into thinking something is broken.

**Why this priority**: Lower priority than actually shipping data — this is about honest expectation-setting in the UI once the higher-value stories exist, not a standalone source of new information.

**Independent Test**: Can be fully tested by opening the panel and confirming every listed mode is either interactive (has real data) or clearly marked as not-yet-available, with no mode appearing clickable-but-silently-broken.

**Acceptance Scenarios**:

1. **Given** the flow control panel is open, **When** the user looks at the Mode list, **Then** every mode without real data behind it (per this spec's scope decisions) is visibly disabled/labeled, not presented as a working option.
2. **Given** a disabled mode, **When** the user attempts to interact with it, **Then** nothing happens except perhaps a short explanatory note — no console error, no partial/broken layer.

---

### Edge Cases

- What happens when a user enables multiple animated layers at once (e.g. Wind + Waves) on a lower-powered device? Performance must stay within this app's existing multi-layer budget (see spec 053's SC-003/SC-004) — if it can't, the panel should make combining animated layers a deliberate choice, not a silent slowdown.
- How does the system handle a data source (CAMS, WAVEWATCH III) being temporarily unreachable, the same way CMEMS's ocean-currents source has been observed to have transient connectivity issues? The existing "stale/unavailable" UI pattern must cover this without new special-casing.
- What happens if a user has Currents (Animate) and an air-quality Overlay both enabled simultaneously? Both must coexist without one silently disabling the other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The flow control panel MUST let users select Ocean mode's Waves animation, in addition to the already-shipped Wind and Currents animations.
- **FR-002**: When Waves is enabled, the system MUST render an animated layer depicting wave conditions on the 2D map, following the same visual/performance conventions (particle-trail style, staleness indication) as the existing Wind/Currents layers.
- **FR-003**: The flow control panel MUST let users select at least one air-quality/aerosol Overlay (e.g. PM2.5), in addition to the animated Wind/Currents/Waves layers.
- **FR-004**: When an air-quality Overlay is enabled, the system MUST render a color-graded layer with an on-screen legend describing what the colors mean.
- **FR-005**: Animated layers (Wind/Currents/Waves) and the air-quality Overlay MUST be able to be enabled simultaneously without one disabling or hiding the other.
- **FR-006**: The system MUST refresh Waves and Overlay data on a periodic schedule matching each source's own natural update cadence (mirroring how Wind's 6-hour and Currents' daily cadence were each matched to their source in spec 053).
- **FR-007**: The flow control panel MUST show every Mode option the reference tool offers (Air, Ocean, Chem, Particulates, Space, Bio) for context, but MUST clearly distinguish functional modes (those with real data per this spec's scope) from not-yet-available ones — visible-but-disabled with a "coming soon"-style note, matching how Currents itself was presented in this panel before its own data source existed (spec 053).
- **FR-008**: When a data source used by this feature becomes temporarily unreachable, the system MUST show the same graceful "unavailable"/"stale" state already established for Wind/Currents (spec 053 FR-006), not a broken layer or an unhandled error.

### Key Entities

- **Flow Snapshot**: Extends the existing entity from spec 053 — a periodically-refreshed animated-flow dataset (now potentially including a `wave` layer type alongside the existing `wind`/`ocean_current` types), each tied to a source, an issued time, and a data range.
- **Overlay Snapshot**: A new kind of periodically-refreshed dataset representing a color-graded (not animated-particle) condition layer — e.g. an air-quality reading — tied to a source, an issued time, a value range, and the color scale used to render it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can enable Waves and see animated wave conditions on the map within the same load-time budget already established for Wind/Currents (spec 053's SC criteria).
- **SC-002**: A user can enable an air-quality Overlay and correctly read, via the on-screen legend, what a given color represents, without needing to leave the map.
- **SC-003**: Enabling any combination of the available animated layers plus the air-quality Overlay together does not degrade map interaction (pan/zoom) below this app's existing multi-layer performance baseline.
- **SC-004**: A first-time user can, within the flow control panel alone (no external documentation), correctly identify which modes are functional today and which are not yet available.

## Assumptions

- Waves (Ocean mode) and an air-quality Overlay (Chem/Particulates mode) are the two extensions actually built in this phase — Space (aurora/space weather) and Bio modes have no identified real, freely-accessible data source and are explicitly out of scope for this spec; they still appear in the Mode list per FR-007 for context, but are non-functional.
- The air-quality Overlay's initial data source is CAMS (Copernicus Atmosphere Monitoring Service); if that source turns out to require access this app cannot obtain within its existing self-hosted/free-tier constraints, an equivalent freely-accessible aerosol/air-quality source may be substituted, following the same evaluation approach used for Wind (GFS) and Currents (CMEMS) in spec 053.
- Waves' initial data source is NOAA WAVEWATCH III (NCEP/NWS), consistent with this app's existing preference for free, no-registration-required NOAA sources where one exists (as GFS was preferred for Wind); this may need re-evaluation during planning, the same way Currents' original NOAA RTOFS choice had to be replaced with CMEMS after RTOFS proved GDAL-incompatible.
- The Mode/Animate/Overlay panel remains a single, app-wide (not per-country) control, consistent with the existing FlowControlPanel — the same assumption already made for Wind/Currents in spec 053.
- This spec covers the 2D map only, consistent with spec 053's existing 2D-first scope decision; the 3D globe view remains out of scope.
