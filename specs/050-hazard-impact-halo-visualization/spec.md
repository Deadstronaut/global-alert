# Feature Specification: Hazard Impact Halo Visualization

**Feature Branch**: `050-hazard-impact-halo-visualization`

**Created**: 2026-07-28

**Status**: Draft

**Input**: User description (Turkish, paraphrased): "When I select a hazard event on the map, I want to see a translucent circular halo/ring around it showing roughly how far its impact reaches — like a deprem (earthquake) in red, a wildfire showing how far it's spread. A vertical slider inside the event's info card should control the halo's intensity/opacity (dial it up to concentrate, down to fade it out). Separately, I'd love to see WHICH individual buildings are likely affected, colored red-to-yellow by estimated severity — but I understand we don't have real structural health data for buildings, only a distance/magnitude-based estimate. Do we even have every building's location on record? Let's spec this out properly."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Impact halo ring on the selected event (Priority: P1)

When a user clicks/selects any hazard event on the map (earthquake, wildfire, flood, etc.), a translucent circular overlay appears centered on the event, sized to that event's existing estimated impact radius (the same per-hazard-type radius already computed by `src/lib/hazardBuffer.js` — `2^magnitude` km for earthquakes, severity-based km for other types). The event's info card gets a vertical slider controlling the halo's opacity/intensity, independent of the existing horizontal layer-opacity sliders used elsewhere in this app (a deliberate, explicit break from that convention, per this feature's own request) — dragging it down fades the halo out entirely (visually equivalent to hidden); dragging it up concentrates/intensifies it.

**Why this priority**: This is the whole visual "wow" ask and needs zero new data — every hazard event already carries lat/lng/magnitude/severity, and `defaultBufferRadiusKm()` already exists and is used elsewhere (ImpactPanel's analysis radius). It is also the safest to ship first: a pure visualization layer with no new backend/data dependency.

**Independent Test**: Select any single hazard event on the map (2D mode) and confirm a translucent circle appears at the correct radius; drag the vertical slider and confirm opacity changes live; deselect the event and confirm the halo disappears.

**Acceptance Scenarios**:

1. **Given** a user has selected an earthquake event with magnitude 7.8, **When** the halo renders, **Then** its radius matches `defaultBufferRadiusKm()`'s existing earthquake formula (2^7.8 ≈ 223km) — the same number already shown/used in the Impact Analysis panel for this event, so the two stay consistent.
2. **Given** the halo is visible, **When** the user drags the vertical slider to its minimum, **Then** the halo's opacity reaches 0 (effectively hidden) without needing a separate on/off toggle.
3. **Given** a user selects a different event while one is already selected, **When** the new selection renders, **Then** the halo moves/resizes to the new event (no leftover halo from the previous selection).
4. **Given** a user deselects the event entirely (closes the info card), **When** that happens, **Then** the halo is removed from the map.

---

### User Story 2 - Distance-graded critical facility coloring within the halo (Priority: P2)

Within the halo's radius, the existing critical-infrastructure points (schools, hospitals/clinics, police/fire stations — the `osm-buildings` exposure source, already shown on the map and already listed in the Impact Analysis panel per spec 049/the critical-infrastructure-dataset-scoping fix) are colored on a red-to-yellow gradient based on their distance from the event center: closer to the epicenter reads more red (higher estimated severity), closer to the halo's outer edge reads more yellow (lower estimated severity). This is an explicit, deterministic distance-decay estimate — not a structural damage assessment — and must be labeled as such in the UI (matches this project's established constitution principle of never overstating what a deterministic estimate actually models, same rationale as the cascade-rules recommendation text's "başlangıç/örnek değeri" framing).

**Why this priority**: Builds directly on US1's halo/radius plumbing and uses data this app already has (osm-buildings' critical-infrastructure points) — no new import needed. Answers the user's "which of the buildings we already show are more affected" question for the subset of buildings we do have real records for.

**Independent Test**: Select an earthquake event with several critical-infrastructure points inside its halo at varying distances; confirm the ones nearest the center render visibly more red than the ones near the edge, and confirm a UI label/tooltip clarifies this is a distance-based estimate, not a damage assessment.

**Acceptance Scenarios**:

1. **Given** two critical-infrastructure points at different distances from the same event within the halo radius, **When** both render, **Then** the nearer one is visually more red (higher severity) than the farther one.
2. **Given** a critical-infrastructure point outside the halo radius, **When** the halo is shown, **Then** that point is NOT recolored (only points inside the radius are affected).
3. **Given** any severity-colored point, **When** a user opens its popup/tooltip, **Then** the copy explicitly states this is a distance-based estimate, not a confirmed damage assessment.

---

### User Story 3 - Individual building-level affected estimate (Priority: P3, blocked on new data)

Beyond critical facilities, show which ordinary buildings (homes, general structures — not just schools/hospitals/police) are likely affected, same red-to-yellow distance grading.

**Why this priority**: This is the feature the user most viscerally wants ("hangi binalar tahminen etkilenir" — which buildings are estimated affected), but it is NOT buildable with today's data. Investigated live during this conversation: the `osm-buildings` exposure source is actually critical-infrastructure POINTS (schools/clinics/police stations tagged via OSM `amenity=*`), not general building footprints — there is no dataset in this system today recording the location of ordinary residential/commercial buildings. Every served country (TR/MG/MY) would need a genuine new import (OSM `building=*` polygon/point extracts, comparable in scope to the DEM-slope/landslide import already built) before this story is buildable at all.

**Why P3 not P1**: Explicitly sequenced last and marked blocked — shipping US1+US2 delivers real, demoable value with zero new data dependency; this story requires a new data-acquisition effort (research the right OSM building extract source per country, likely large data volumes — Turkey alone has millions of building footprints) that should be scoped and estimated separately before committing to it, not bundled into this spec's initial implementation.

**Independent Test**: Not testable until a building-footprint exposure source exists for at least one served country — this story's completion criterion IS that import existing (comparable acceptance bar to the DEM-slope import: real polygon/point count in `exposure_datasets` for the source).

**Research note (verified live during spec authoring, 2026-07-28)**: Overpass (the live API this project's existing `osmBuildingsFetch.ts`/`osmRoadsFetch.ts` already query) is not a good fit for a full country-wide `building=*` pull — it is a shared, free community server with its own soft rate-limiting and this project's own 180s per-query timeout; a Turkey-scale building count would be 1-2 orders of magnitude larger than the already-narrow critical-infrastructure query this codebase deliberately scoped down to avoid exactly that problem. Instead, **Microsoft's "Global ML Building Footprints"** dataset (free, public, no-auth, Azure blob storage — same access shape as the Copernicus DEM data DEM-slope already pulls from) was checked live and confirmed reachable with real per-country tile coverage for all three served countries: **Turkey 266 tiles, Madagascar 140 tiles, Malaysia 98 tiles** (quadkey-tiled, listed in `dataset-links.csv` at the dataset's public index). This is the recommended source to plan against for this story — a new raster-importer-style module (fetch a country's quadkey tiles, parse each tile's building polygons, write as a new `building_footprints`-style exposure source), following the exact same pattern already established for DEM-slope/GHSL, not a live Overpass query at country scale.

Before committing to the import, the data can be spot-checked visually without writing any code: **Overpass Turbo** (overpass-turbo.eu) lets `osmBuildingsFetch.ts`'s existing query style be run and previewed directly on a map in-browser; **QGIS** (free desktop GIS) can open a downloaded Microsoft Building Footprints tile (GeoJSON/CSV) directly for a visual sanity check before the first real import run. Neither tool needs to be integrated into this app — they are external, one-time verification aids for whoever plans/implements this story.

**Acceptance Scenarios**:

1. **Given** a building-footprint exposure source exists for a country, **When** an event's halo is shown, **Then** buildings inside the radius render with the same distance-based red-to-yellow grading as US2's critical-infrastructure points.
2. **Given** no building-footprint source exists yet for a country, **When** an event is selected there, **Then** the UI clearly states building-level detail is unavailable for this country (never silently shows nothing with no explanation).

### Edge Cases

- What happens when an event has no magnitude (e.g. a flood/wildfire event without a numeric severity value driving the buffer formula)? → Falls back to the existing `SEVERITY_RADIUS_KM` severity-tier radius already used by `defaultBufferRadiusKm()`, same as today's Impact Analysis panel.
- What happens when the halo's radius would extend into another country or off-map? → Rendered as-is (a circle, not clipped to any boundary) — matches how the existing Impact Analysis buffer radius already behaves (no country clipping there either).
- What happens when a user rapidly selects many events in succession? → Only one halo is ever shown at a time (the currently-selected event's), same convention as the existing single-selection info card.
- What happens on the 3D globe view (globe.gl), not just the 2D MapLibre view? → [NEEDS CLARIFICATION: this halo could be a flat circle overlay on the 2D map (straightforward, matches existing circle-radius rendering already used for "Uyarı Yarıçapı") or could also need a 3D-globe equivalent — confirm whether 3D support is in scope for v1 or 2D-only is acceptable.]
- What happens when NO critical-infrastructure dataset exists for a selected event's country (US2)? → No colored points render inside the halo; this is not an error, just an empty result (matches this app's existing "not_evaluable"/empty-state conventions elsewhere).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a translucent circular overlay centered on a selected hazard event's lat/lng, sized to that event's existing `defaultBufferRadiusKm()` value (no new radius-calculation logic — reuse what Impact Analysis already uses).
- **FR-002**: System MUST provide a vertical slider (visually distinct from this app's existing horizontal layer-opacity sliders) in the selected event's info card, controlling the halo's opacity from fully transparent to fully intense.
- **FR-003**: The halo MUST update (move/resize) when the selected event changes, and MUST be removed when no event is selected.
- **FR-004**: System MUST color critical-infrastructure points (existing `osm-buildings` source) within the halo's radius on a red-to-yellow gradient by distance from the event center — nearer reads more severe (red), farther reads less severe (yellow).
- **FR-005**: Any distance-graded severity coloring or label MUST explicitly state it is a distance-based estimate, not a confirmed structural damage assessment — matching this project's constitution principle of not overstating deterministic-estimate outputs (same rationale already applied to cascade_rules' recommendation text).
- **FR-006**: System MUST NOT recolor critical-infrastructure points outside the halo's radius.
- **FR-007** *(User Story 3, blocked)*: Building-level (not just critical-infrastructure) severity coloring requires a new building-footprint exposure source per country — out of scope for this spec's initial implementation; tracked as a follow-up dependency.

### Key Entities *(include if feature involves data)*

- **Impact halo**: A client-side, ephemeral map overlay (not persisted) — center (event lat/lng), radius (km, from `defaultBufferRadiusKm()`), opacity (user-controlled, 0-1). No new database table.
- **Distance-graded severity**: A derived, per-critical-infrastructure-point value computed client-side (or via a lightweight RPC) from `ST_Distance(point, event_center) / halo_radius_km`, normalized to 0-1 and mapped onto a red-to-yellow color ramp. Not persisted — recomputed on every event selection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Selecting any hazard event on the 2D map shows the impact halo within the same render pass as the existing event-selection info card (no separate loading step/spinner — this is pure client-side geometry, no new network round-trip).
- **SC-002**: The vertical intensity slider visibly changes halo opacity with no perceptible lag (same frame, standard MapLibre paint-property update).
- **SC-003**: Critical-infrastructure points within the halo visibly separate into at least 3 distinguishable severity bands (not just "colored or not") when tested against a real event with 10+ nearby critical-infrastructure points (e.g. the Kahramanmaraş/Gaziantep earthquake scenario already used throughout this project's live-testing).

## Assumptions

- 2D MapLibre view is the primary/required target for v1; 3D globe support is a `NEEDS CLARIFICATION` open question above, not assumed in scope.
- The halo radius reuses `src/lib/hazardBuffer.js`'s existing per-hazard-type formula unchanged — this spec does not revisit whether that formula itself is accurate, only visualizes it.
- User Story 3 (individual building-level detail) is explicitly out of scope for this spec's initial implementation and requires a separate future data-acquisition effort (a real OSM building-footprint import per served country) before it can be planned/estimated.
- No new persisted data/tables are needed for User Stories 1-2 — this is a rendering feature over data that already exists (event lat/lng/magnitude, existing critical-infrastructure points).
