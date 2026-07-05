# Feature Specification: Impact Analysis & Exposure Modelling

**Feature Branch**: `008-impact-analysis`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Build the Impact Analysis / Exposure Modelling module (SRS Module M5), full scope (frontend + PostGIS), not just the easy frontend parts. Context: this is a Vue 3 + Supabase (MapLibre GL, H3 hexbin aggregation) disaster early-warning platform. Research confirmed: no PostGIS extension is enabled anywhere, no exposure/vulnerability datasets exist, no geocoding search box exists, no split-view (map + detail panel) UI exists (only popups), no charting library exists (no time-series graph in event popups), cap_drafts.area_polygon is just a WKT text column (not real PostGIS geometry). Client-side geo libs available: h3-js, topojson-client, world-atlas (no turf.js). Scope per SRS Module M5: (1) admin upload/management of exposure datasets (e.g., population density, critical infrastructure) as GeoJSON, stored as real PostGIS geometry; (2) a guided 2-step impact analysis workflow — select a hazard event, select an exposure dataset, compute zonal statistics (e.g., population sum) within the hazard's affected area; (3) save/reload named impact analysis scenarios (hazard+exposure+params combination) for reuse; (4) export impact analysis results in CSV/JSON/GeoJSON; (5) frontend usability: a split-view (map alongside a detail/results panel, not just popups), a geocoding search box to jump to a location/address, and a lightweight 24-hour trend indicator in event detail (not necessarily a full charting library — something proportionate to this project's existing 'no chart library' baseline). Explicitly OUT of scope: full risk-scenario modeling with vulnerability indices and probabilistic simulation (tracked separately as the not-yet-started 'Risk & Scenario Modeling' roadmap module), forecast-model/AI integration for projected impact (tracked separately as the not-yet-started 'Forecasting/AI' roadmap module), and Shapefile upload (GeoJSON-only for v1, Shapefile parsing requires additional server-side tooling not yet justified)."

## Clarifications

### Session 2026-07-06

- Q: What determines the default buffer radius used to define a hazard event's "affected area" when no more specific area is already known (FR-006)? → A: Hazard-type-aware: for earthquakes, radius is derived from magnitude via a formula (radius_km = 2^magnitude, consistent with the intuition that each whole-magnitude step roughly doubles the felt-effect radius); for all other hazard types, a fixed lookup table by severity level (critical=50km, high=25km, moderate=10km, low=5km, minimal=2km) is used, since they don't carry a magnitude field.

## Clarifications

### Session 2026-07-06

- Q: What determines the default buffer radius used to define a hazard event's "affected area" when no more specific area is already known (FR-006)? → A: Hazard-type-specific, using whatever field is most physically meaningful for that type: earthquakes use a magnitude-derived formula (radius_km = 2^magnitude); other hazard types (wildfire, flood, drought, tsunami, cyclone, volcano, epidemic) use a severity-based lookup table (critical=50km, high=25km, moderate=10km, low=5km, minimal=2km) since they don't carry a magnitude field today. This mapping is implemented per hazard type (not a single global formula) so a more specific field (e.g., a wildfire's burned-area extent, if it becomes available later) can replace that type's default without affecting other types.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload and manage an exposure dataset (Priority: P1)

A super_admin or country_admin uploads a GeoJSON file containing exposure data (e.g., population density polygons for their country) through an admin screen. The system validates and stores it as real spatial geometry, making it available for later impact queries.

**Why this priority**: Every other capability in this module depends on at least one exposure dataset existing — without this, "impact analysis" has nothing to analyze against.

**Independent Test**: Can be fully tested by uploading a valid GeoJSON file as an authorized admin and confirming it appears in a list of available exposure datasets with correct feature count and geometry type.

**Acceptance Scenarios**:

1. **Given** a valid GeoJSON FeatureCollection with a numeric property (e.g., population), **When** an authorized admin uploads it and names the dataset, **Then** it is stored and appears in the exposure dataset list with its feature count.
2. **Given** a malformed or non-GeoJSON file, **When** an admin attempts to upload it, **Then** the system rejects it with a clear validation error and stores nothing.
3. **Given** an exposure dataset scoped to one country, **When** a country_admin from a different country views the dataset list, **Then** they do not see it (consistent with existing country-scoped visibility patterns).
4. **Given** an existing exposure dataset is no longer needed, **When** an authorized admin deletes it, **Then** it is removed from the list and no longer selectable in the impact analysis workflow.

---

### User Story 2 - Run a spatial impact query (Priority: P1)

A country_admin selects a detected hazard event and an exposure dataset, and the system computes zonal statistics — e.g., total population — within the hazard's affected area, displaying the result in a dedicated results panel.

**Why this priority**: This is the module's core value proposition (SRS FR-0221/FR-0370, "zonal statistics within hazard polygon") — without it, uploaded exposure data (Story 1) has no analytical use.

**Independent Test**: Can be fully tested by selecting a known hazard event and a known exposure dataset and confirming the computed sum matches a manually-verified expectation for that combination.

**Acceptance Scenarios**:

1. **Given** a selected hazard event and a selected exposure dataset covering its area, **When** the user runs the analysis, **Then** the system displays the summed exposure value (e.g., population) within the hazard's affected area.
2. **Given** a selected hazard event whose affected area does not intersect the chosen exposure dataset at all, **When** the analysis runs, **Then** the result clearly shows zero/no overlap rather than an error or a misleading blank result.
3. **Given** an analysis is running against a large exposure dataset, **When** the user waits for the result, **Then** the computation completes without the browser or request timing out for this platform's realistic dataset sizes.

---

### User Story 3 - Save and reload an impact analysis scenario (Priority: P2)

A user who has configured a hazard+exposure+parameter combination saves it with a name, so they (or another authorized user in the same scope) can reload the exact same analysis later without reconfiguring it from scratch.

**Why this priority**: Convenience/reproducibility layered on top of Story 2's core computation — valuable for recurring drills/reports, but the module delivers its primary value without it.

**Independent Test**: Can be fully tested by running an analysis, saving it as a named scenario, navigating away, then reloading the saved scenario and confirming it reproduces the same selections and result.

**Acceptance Scenarios**:

1. **Given** a completed impact analysis, **When** the user saves it with a name, **Then** the hazard/exposure/parameter selection is persisted and appears in a list of saved scenarios.
2. **Given** a saved scenario, **When** a user loads it, **Then** the same hazard event, exposure dataset, and parameters are restored and the analysis can be re-run.

---

### User Story 4 - Split-view map with a detail panel (Priority: P2)

Instead of relying solely on map popups, a user viewing the map and doing impact analysis sees a persistent side panel showing selected-event details and analysis results alongside the map, so the map is not obscured by a popup while working through the workflow.

**Why this priority**: Meaningfully improves usability of Stories 1-3 but the underlying analytical capability already works via popups/modals without it — this is a UX upgrade, not a blocker.

**Independent Test**: Can be fully tested by selecting a hazard event on the map and confirming its details and any impact-analysis controls/results appear in a persistent side panel rather than only a transient popup.

**Acceptance Scenarios**:

1. **Given** a user clicks a hazard event on the map, **When** the split-view is active, **Then** event details appear in the side panel without covering the map area the user was viewing.
2. **Given** the side panel is showing impact analysis results, **When** the user selects a different hazard event, **Then** the panel updates to the newly selected event without requiring a page reload.

---

### User Story 5 - Geocoding search (Priority: P2)

A user types a place name or address into a search box and the map recenters/zooms to that location, so they don't have to manually pan/zoom to find a specific area before running an impact analysis there.

**Why this priority**: A navigation convenience independent of the core analytical workflow (Stories 1-3) — useful, but analysis can already be performed by manually navigating the map to a known hazard event.

**Independent Test**: Can be fully tested by typing a known place name and confirming the map recenters to the correct location.

**Acceptance Scenarios**:

1. **Given** a user enters a recognizable place name, **When** they submit the search, **Then** the map recenters and zooms to that location.
2. **Given** a user enters a query that matches no location, **When** they submit the search, **Then** the system shows a clear "no results" state rather than silently doing nothing.

---

### User Story 6 - Export impact analysis results (Priority: P3)

A user who has run an impact analysis exports the results as CSV, JSON, or GeoJSON for use in an external report or GIS tool.

**Why this priority**: Valuable for reporting workflows, but the analysis itself (Story 2) already delivers its core value on-screen without export.

**Independent Test**: Can be fully tested by running an analysis and exporting each of the three formats, confirming each file's content matches the on-screen result.

**Acceptance Scenarios**:

1. **Given** a completed impact analysis, **When** the user exports as CSV or JSON, **Then** a file downloads containing the summary statistics.
2. **Given** a completed impact analysis, **When** the user exports as GeoJSON, **Then** a file downloads containing the affected-area geometry and per-feature exposure values used in the computation.

---

### Edge Cases

- What happens when an exposure dataset upload contains geometries in a coordinate system other than WGS84 (the standard used by this platform's maps)? The upload is rejected with a message indicating WGS84 (EPSG:4326) is required — no automatic reprojection is performed in v1.
- What happens when a hazard event has no defined "affected area" (e.g., a point event with no associated radius/magnitude-derived buffer)? A default buffer radius (per hazard type, consistent with existing severity/magnitude data already on the event) is used to define the affected area for zonal statistics purposes.
- What happens if two impact analyses are requested concurrently by the same or different users? Each runs independently; there is no shared mutable state between concurrent analysis requests.
- What happens when a saved scenario references an exposure dataset or hazard event that has since been deleted? Loading the scenario shows a clear "referenced data no longer available" state rather than crashing or silently substituting different data.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow org_admin/country_admin/super_admin to upload a GeoJSON FeatureCollection as a new exposure dataset, with at least one selectable numeric property to use as the exposure metric (e.g., population).
- **FR-002**: System MUST validate uploaded GeoJSON structurally (valid FeatureCollection, WGS84 coordinates, at least one numeric property present) before storing, rejecting invalid uploads with a clear error and persisting nothing on failure.
- **FR-003**: System MUST store exposure dataset geometries as real spatial geometry (not text), scoped by country_code (and org_id where applicable) consistent with existing scoped-visibility patterns (specs 004/006).
- **FR-004**: System MUST allow an authorized user to list, view metadata for (name, feature count, upload date), and delete their own scope's exposure datasets.
- **FR-005**: System MUST provide a guided workflow: (a) select a detected hazard event, (b) select an available exposure dataset, (c) compute and display the summed exposure metric within the hazard event's affected area.
- **FR-006**: System MUST define a hazard event's "affected area" as a circular buffer around its point location, with a default radius determined per hazard type (Edge Cases/Clarifications): earthquakes use radius_km = 2^magnitude; all other hazard types use a severity-based lookup table (critical=50km, high=25km, moderate=10km, low=5km, minimal=2km). This per-type mapping MUST be structured so an individual hazard type's radius logic can be replaced independently (e.g., if a more specific field becomes available for that type later) without affecting other types.
- **FR-007**: System MUST clearly indicate a zero-overlap result as "no exposure data intersects this area," distinct from an error state or a missing-data state.
- **FR-008**: System MUST allow saving the current hazard+exposure+parameter selection as a named, reloadable scenario, scoped to the saving user's country/org visibility.
- **FR-009**: System MUST restore all selections (hazard event, exposure dataset, parameters) when a saved scenario is loaded, and MUST show a clear "referenced data no longer available" state if the hazard event or exposure dataset it references has since been deleted.
- **FR-010**: System MUST provide a persistent split-view side panel (map remains visible) for displaying selected hazard event details and impact analysis controls/results, replacing reliance on transient popups for this workflow.
- **FR-011**: System MUST provide a geocoding search box that recenters/zooms the map to a matched location, and MUST show a clear "no results" state for unmatched queries.
- **FR-012**: System MUST export completed impact analysis results as CSV, JSON, and GeoJSON, with the GeoJSON export including the affected-area geometry and the per-feature exposure values used in the computation.
- **FR-013**: System MUST reject exposure dataset uploads using a non-WGS84 coordinate reference system with a clear error, without attempting automatic reprojection (Edge Cases).
- **FR-014**: System MUST record exposure dataset uploads and deletions in the existing `audit_log` table via the existing `log_table_change()` trigger pattern (specs 004/006/007).
- **FR-015**: System MUST present all new UI text through the existing i18n system, with translations for all 7 supported locales (tr/en/es/fr/ru/ar/zh).

### Key Entities

- **Exposure Dataset**: A named collection of geographic features with an associated numeric exposure metric (e.g., population), scoped to a country/org, stored with real spatial geometry. Attributes: name, description, feature count, uploaded-by user, country_code/org_id, created_at.
- **Impact Analysis Scenario**: A saved, named reference to a specific hazard event + exposure dataset + parameter combination (e.g., buffer radius override), reloadable to reproduce the same analysis. Attributes: name, hazard event reference, exposure dataset reference, parameters, created-by user, country_code/org_id scope, created_at.
- **Hazard Event (existing, read-only from this feature)**: The already-ingested detected event (spec 001-003) used as the basis for defining an affected area; this feature does not modify hazard event data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can go from selecting a hazard event and exposure dataset to seeing a computed zonal-statistics result in under 10 seconds for this platform's realistic dataset sizes.
- **SC-002**: 100% of invalid (malformed/non-WGS84) exposure dataset uploads are rejected with a clear error, storing no partial data.
- **SC-003**: A saved scenario reproduces its original hazard/exposure/parameter selection with 100% fidelity when reloaded (assuming referenced data still exists).
- **SC-004**: Geocoding search successfully recenters the map for a recognizable place name in under 3 seconds.
- **SC-005**: 100% of exported result files (CSV/JSON/GeoJSON) contain data that exactly matches the on-screen analysis result at the time of export.
- **SC-006**: All Impact Analysis UI text renders correctly in all 7 supported locales.

## Assumptions

- GeoJSON is the only supported upload format for v1; Shapefile upload (SRS MHEWS-SD-STORE-03) is deferred since it requires additional server-side parsing tooling not yet part of this project's stack, consistent with Constitution Principle VIII (justify new complexity before adopting it) — this can be added later as its own increment if a real operator need arises.
- "Zonal statistics" in this spec means a sum of a single numeric property across exposure features intersecting a hazard's affected area — more advanced statistics (weighted vulnerability indices, population-at-risk probability curves) are part of the separate, not-yet-started "Risk & Scenario Modeling" roadmap module.
- The geocoding provider is a per-deployment configuration concern (an API key/endpoint set by each country deployment's operator), consistent with the established precedent (specs 004/005) that project-level external-service configuration is not hardcoded by this codebase — this spec implements the search UI and a thin Edge Function proxy, not a specific hardcoded geocoding vendor.
- The "24-hour trend indicator" (originally scoped as a full time-series graph) is implemented as a lightweight, dependency-free visual (e.g., a small inline sparkline or a simple up/down/stable indicator with the raw recent-count numbers), not a full charting library integration — proportionate to this project's current zero-charting-library baseline (Constitution Principle VIII).
- PostGIS is enabled as a Postgres extension within the existing Supabase database — this is a database extension, not a new external service, so it does not conflict with Constitution Principle VIII's "no new services" constraint; it is the standard, minimal-complexity way to achieve real spatial geometry storage and zonal-statistics queries in Postgres.
