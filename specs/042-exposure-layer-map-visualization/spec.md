# Feature Specification: Exposure Layer Map Visualization

**Feature Branch**: `042-exposure-layer-map-visualization`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Add toggleable exposure-layer map visualization to the main map view. Context: this project already stores multiple types of exposure data (road networks from OSM, population from Kontur, and soon river networks and watershed boundaries from HydroRIVERS/HydroBASINS, spec 041) in the generic exposure_datasets/exposure_features tables, but none of it is currently rendered on the map at all — the only existing UI touchpoint is ImpactPanel.vue's single-select dropdown, which feeds a numeric buffer-radius impact calculation, not a visual map layer. The user was shown Google Flood Hub's UI (on/off toggle switches for multiple simultaneous layers like flood zones/frequency shading, plus click-to-inspect popups showing details like basin area) and wants the same kind of interactive map experience for this project's own exposure layers: independently toggleable layers per exposure source/type (not just one dataset selected from a dropdown), rendered as map overlays (lines for roads/rivers, polygons for population zones/watersheds, etc.), with click-to-inspect behavior showing that feature's key attributes (e.g. a watershed polygon shows its area, a road segment shows its classification, a population zone shows its population count). This must work generically across all exposure_features hazard_types/source_names already in the system (roads, population, and future river/basin types) without hardcoding per-source logic, consistent with this project's existing architecture principle that adapter/display code should be generic and data-driven. Scope: this is a visualization feature only — it does not change how data is imported or stored (spec 038/040/041 already cover that); it should work with whatever exposure data currently exists (today: only an OSM roads dataset for Turkey, 37,407 features) and should not require any specific dataset to exist to be considered done, since Kontur population and HydroRIVERS/HydroBASINS data are not yet live-imported for either served country (Turkey, Madagascar). Given past findings in this project (spec 040) that rendering ~37K line features can strain client resources, consider that a large feature count per layer is a realistic condition to design for, not an edge case to ignore."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn an exposure layer on or off on the map (Priority: P1) 🎯 MVP

A user viewing the map sees a list of available exposure layers (one per imported exposure dataset/source — e.g. "OSM Roads (Turkey)") and can independently switch each one on or off, seeing its geometry appear or disappear on the map, without affecting any other layer or losing their current map view.

**Why this priority**: This is the entire value of the feature — without it, no exposure data is visible on the map at all, no matter how much is imported. Everything else (styling, click-to-inspect) only matters once a layer can be shown.

**Independent Test**: With only the currently existing OSM roads dataset for Turkey, open the map, turn the "OSM Roads (Turkey)" layer on, confirm road geometry appears; turn it off, confirm it disappears; confirm no other part of the map (hazard markers, boundaries) is affected.

**Acceptance Scenarios**:

1. **Given** one or more exposure datasets exist for the current view, **When** a user opens the map, **Then** they see a layer control listing each available exposure dataset by name/source, all initially off.
2. **Given** a layer is toggled on, **When** the toggle is switched off, **Then** that layer's geometry is removed from the map while all other active layers remain unaffected.
3. **Given** zero exposure datasets exist for a given context (e.g. a country with no imported data yet), **When** a user opens the map, **Then** the layer control clearly indicates there is nothing to show for that context, rather than appearing broken or empty with no explanation.

---

### User Story 2 - Inspect a feature's details by clicking it (Priority: P1) 🎯 MVP

A user who has an exposure layer turned on can click any individual feature on that layer (a road segment, a population zone, a river reach, a watershed polygon) and see a popup with that feature's key attributes, the same experience the user liked in Google Flood Hub's basin-click popup.

**Why this priority**: Called out directly by the user as the specific interaction they want replicated; a toggleable layer with no way to inspect individual features only shows shapes, not information.

**Independent Test**: With the OSM roads layer on, click a road segment and confirm a popup appears showing that segment's attributes (e.g. its road classification); click empty map space and confirm no stray popup appears.

**Acceptance Scenarios**:

1. **Given** an exposure layer is turned on and visible, **When** a user clicks a feature on that layer, **Then** a popup appears showing that feature's available attributes (e.g. name/classification, length or area, and any measured value such as population count or discharge estimate) without the user needing to know which exposure source it came from.
2. **Given** a feature has few or no descriptive attributes beyond its measured value, **When** it is clicked, **Then** the popup still shows whatever is available (e.g. just the measured value) rather than appearing broken.
3. **Given** a popup is open, **When** the user clicks a different feature or elsewhere on the map, **Then** the previous popup closes and, if applicable, the new one opens — never more than one popup open at a time.

---

### User Story 3 - Layers stay usable with large datasets (Priority: P2)

A user turns on a layer backed by a very large dataset (tens of thousands of features, as already seen with the OSM roads import) and the map remains responsive — panning, zooming, and toggling other layers do not become sluggish or freeze the browser.

**Why this priority**: Directly informed by this project's own real production data — a live population dataset (Kontur, Turkey) has 457,761 features, and OSM roads (Turkey) has 5,233 — so a large feature count per layer is not a hypothetical, it's the current reality for at least one already-imported source. *(Correction, 2026-07-19: this story originally cited a stale, never-actually-written "37,407 features" figure for OSM roads, discovered during this feature's own implementation to be dangling metadata with zero real rows behind it — see research.md's addendum. Roads data was re-imported for real, and Kontur population data was imported for the first time in the same session, giving this story real numbers an order of magnitude larger than originally assumed.)*

**Independent Test**: Turn on the existing 457,761-feature Kontur population (Turkey) layer alone, and confirm the map remains interactive (pan/zoom stays smooth, the browser tab does not become unresponsive) throughout normal use.

**Acceptance Scenarios**:

1. **Given** a layer with tens of thousands of features is turned on, **When** the user pans or zooms the map, **Then** the map continues to respond without freezing or becoming unusably slow.
2. **Given** a large layer is on, **When** the user also turns on a second layer, **Then** both remain visible and the map remains usable (this may include reasonable, clearly-communicated simplifications such as showing less detail when zoomed out, as long as the user is not blocked from using the map).

---

### User Story 4 - New exposure sources appear automatically (Priority: P3)

When a new type of exposure data is imported into the system in the future (e.g. HydroRIVERS river networks or HydroBASINS watersheds, per spec 041), it automatically becomes available as a toggleable layer with no changes to this feature's own code.

**Why this priority**: A confirmation of the generic/data-driven design principle already established elsewhere in this project, rather than new user-facing value on its own — valuable to state explicitly so this feature isn't accidentally built in a way that requires future rework for each new exposure source.

**Independent Test**: Without modifying this feature's code, import a new exposure dataset of a type not previously present (e.g. via spec 041 once implemented) and confirm it appears in the layer control automatically.

**Acceptance Scenarios**:

1. **Given** a new exposure dataset of a previously-unseen source type is imported, **When** a user opens the map, **Then** it appears in the layer list automatically, styled and click-inspectable using the same generic rules as every other layer.

### Edge Cases

- What happens when an exposure dataset's geometry type is one the map doesn't have a specific style for yet (e.g. a future point-based exposure type)? → It is still rendered using a sensible generic default style rather than being silently skipped.
- How does the system distinguish between different simultaneously-visible layers so a user doesn't confuse a road segment's popup with a river reach's popup? → Each popup clearly identifies which layer/source the clicked feature belongs to.
- What happens when a user is viewing a country/region with no exposure datasets at all? → Handled explicitly in User Story 1's third acceptance scenario (clear empty state, not a broken-looking control).
- What happens if a layer toggle is switched on while the map is still loading that layer's data? → The toggle reflects a loading state and the user is not left wondering whether their click registered.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The map MUST present a control listing every exposure dataset currently available for the user's context, each independently toggleable on/off.
- **FR-002**: Turning a layer on MUST render its features as map overlays using a geometry-appropriate style (lines for line geometry, filled/outlined shapes for polygon geometry) without requiring any per-source-specific code — the rendering logic MUST be driven generically by each feature's stored geometry type and metric, not by hardcoded knowledge of "roads" or "population" as special cases.
- **FR-003**: Turning a layer off MUST remove only that layer's features from the map, leaving every other active layer and the base map unaffected.
- **FR-004**: Clicking an individual rendered feature MUST show a popup with that feature's available attributes and its measured value (e.g. population count, road/river length, discharge estimate, basin area), sourced generically from that feature's stored properties rather than per-source-specific display code.
- **FR-005**: Only one feature's popup MAY be open at a time; opening a new one MUST close any previously open popup.
- **FR-006**: The map MUST remain responsive (pannable, zoomable, other layers toggleable) while displaying a layer containing tens of thousands of features.
- **FR-007**: A context with zero available exposure datasets MUST present a clear, explicit empty state in the layer control, not an empty or broken-looking list.
- **FR-008**: A newly imported exposure dataset of a previously-unseen source type MUST become available in the layer control automatically, without requiring changes to this feature's code.
- **FR-009**: This feature MUST NOT alter how exposure data is imported, validated, or stored — it is read-only against the existing `exposure_datasets`/`exposure_features` data.

### Key Entities

- **Exposure layer**: A user-facing, toggleable representation of one exposure dataset already stored in the system (e.g. "OSM Roads (Turkey)", "Kontur Population (Madagascar)") — its on/off state, and the rendered features and popups it produces, are all derived generically from the dataset's existing geometry and attribute data.
- **Feature popup**: The on-click detail view for a single exposure feature, generically assembled from that feature's stored properties and measured value, without per-source-specific display logic.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can turn any available exposure layer on or off from the map in a single interaction, with the visual change appearing immediately.
- **SC-002**: A user can click any visible exposure feature and see its key details in under 1 second, without leaving the map view.
- **SC-003**: A layer containing 400,000+ features (matching the scale of the real Kontur population/Turkey dataset now in production) can be displayed while the map remains interactive — pan/zoom actions do not visibly stall.
- **SC-004**: When a new exposure source type is added to the system, it becomes visible as a toggleable layer with zero changes to this feature's code — verified by adding a new source type and confirming no code modification was needed.
- **SC-005**: A user in a context with no exposure data present sees a clear indication of that (not a confusing empty or broken-looking control) 100% of the time.

## Assumptions

- This feature renders exposure data on the project's existing primary map component; it does not introduce a new, separate mapping surface.
- "Available for the user's context" follows the same served-country scoping already used everywhere else in this system (a user only sees layers relevant to countries they have access to).
- Large-dataset responsiveness (User Story 3 / FR-006 / SC-003) may be achieved through reasonable, standard mapping techniques (e.g. reduced detail at low zoom, clustering, or lazy loading) at the implementation's discretion — this specification requires the user-facing outcome (a responsive map), not a specific technique.
- Click-to-inspect popups show whatever attributes/measured value each feature already has in storage; this feature does not add new attributes to the underlying data, only surfaces what already exists (per FR-009).
- Layer on/off state does not need to persist across sessions or be shareable via a link in this MVP — each map session starts with all layers off, matching the "everything starts off" pattern already observed in Google Flood Hub's own layer panel.
