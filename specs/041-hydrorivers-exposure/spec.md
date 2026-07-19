# Feature Specification: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

**Feature Branch**: `041-hydrorivers-exposure`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Add HydroRIVERS global river-network dataset as a new exposure data source, following the same pattern as spec 038 (Kontur Population) — a one-time/periodic static file import, not a live per-request API, since HydroRIVERS (part of the HydroSHEDS/HydroBASINS family, same source visible in Google Flood Hub's "hybas_" gauge IDs) is distributed as free downloadable shapefiles organized by continent, not queryable by country like Overpass. Context: this follows up on the OSM/Overpass roads exposure source (spec 040); UNDP demo scope remains Turkey + Madagascar only. Live flood hazard forecasting (Google Flood Hub / Flood Forecasting API) was investigated and explicitly deferred — its API is free but currently waitlist-gated with a multi-month approval time, incompatible with the demo timeline, so it is out of scope for this feature and may become its own future feature once/if access is granted. This feature is scoped to the river network geometry only (an exposure layer showing river courses, like roads), sourced from HydroRIVERS' free, no-waitlist shapefile downloads, each river reach carrying its length, order, and long-term average discharge estimate attributes, stored in the same exposure_datasets/exposure_features tables as Kontur population and OSM roads so it appears in Impact Analysis identically. The import mechanism must remain generic/country-agnostic in code per this project's existing architecture principle (adapter code is generic, per-country config lives in the database, never hardcoded country names in .ts source) — country scoping is done by spatially clipping the downloaded continent-level river network to each served country's boundary (country_boundaries table), mirroring how Kontur's population import already clips/filters continent-scale source data per served country."

**Amendment (2026-07-19)**: Extended, before planning began, to also include HydroBASINS watershed boundaries alongside HydroRIVERS. The user observed that Google Flood Hub's basin-boundary display and per-basin attribute popup (e.g. "Havza boyutu (km²)") — shown when clicking a gauge — is itself built on HydroBASINS data (the "hybas_" gauge ID prefix is a HydroBASINS identifier), which is separately, freely, and immediately downloadable from HydroSHEDS with no Google dependency and no waitlist. Since HydroBASINS shares HydroRIVERS' distribution model (free, continent-organized shapefiles, same license), it is folded into this single feature rather than becoming a separate spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - River network appears automatically for a served country (Priority: P1) 🎯 MVP

An admin or analyst opens Impact Analysis for Turkey (or Madagascar) and sees the country's river network as a selectable exposure layer, without anyone having manually uploaded it — the same experience they already have with population (Kontur) and road-network (OSM) exposure data.

**Why this priority**: This is the entire value of the feature — river-network exposure enables flood-impact estimation (which roads/settlements sit near which rivers) even before live flood-hazard forecasting is available. Without this, there is no river data in the system at all.

**Independent Test**: For a served country with no manually uploaded river dataset, run the import process and confirm a resulting exposure dataset (rivers) appears and is usable in Impact Analysis exactly like manually uploaded data.

**Acceptance Scenarios**:

1. **Given** Turkey is a served country with no existing river-network dataset, **When** the HydroRIVERS import runs, **Then** a river-network exposure dataset for Turkey appears in Impact Analysis, clipped to Turkey's boundary, with each river reach carrying its length, stream order, and average discharge estimate.
2. **Given** Madagascar is a served country, **When** the import runs, **Then** the same outcome occurs for Madagascar, using the same generic import code (no country-specific logic).
3. **Given** a country's river-network dataset was previously imported, **When** the import runs again for that country, **Then** the prior dataset is fully replaced (superseded) by the new one, with no duplicate or orphaned data left behind.

---

### User Story 2 - Watershed boundaries with clickable basin details (Priority: P1) 🎯 MVP

An analyst looking at Impact Analysis for Turkey (or Madagascar) can see watershed/basin boundary outlines on the map, and clicking a basin reveals its details (at minimum its area), the same experience the user identified and liked in Google Flood Hub's basin popup ("Havza boyutu (km²)").

**Why this priority**: Called out by the user as a specifically valuable, well-liked piece of Google Flood Hub's UX, and it is fully achievable from the same open, no-waitlist HydroBASINS data already being imported for country scoping context — no reason to defer it alongside the flood-forecast pieces that genuinely require the gated API.

**Independent Test**: For a served country, run the basin import and confirm watershed boundary polygons appear on the map for that country; clicking one displays its area and identifying attributes without requiring any other feature to be built first.

**Acceptance Scenarios**:

1. **Given** Turkey is a served country with no existing watershed dataset, **When** the HydroBASINS import runs, **Then** watershed boundary polygons for Turkey appear in Impact Analysis, clipped to Turkey's boundary.
2. **Given** a watershed boundary is displayed on the map, **When** a user clicks/selects it, **Then** its area and basin identifier are shown, matching the kind of detail the user saw in Google Flood Hub's basin popup.
3. **Given** Madagascar is a served country, **When** the import runs, **Then** the same outcome occurs for Madagascar, using the same generic import code as Turkey (no country-specific logic).

---

### User Story 3 - Health/freshness visibility (Priority: P2)

An admin viewing the Sources admin view sees the HydroRIVERS and HydroBASINS sources' health state and last-import time, consistent with every other data source in the system (hazard sources, Kontur population, OSM roads).

**Why this priority**: Operational visibility matters, but is secondary to the data actually being present and usable (User Stories 1–2).

**Independent Test**: Trigger an import failure (e.g. an inaccessible source file) and confirm the Sources view reflects a degraded/failing state after the configured threshold, exactly as it does for other sources.

**Acceptance Scenarios**:

1. **Given** a HydroRIVERS or HydroBASINS source has never successfully imported, **When** an admin views the Sources list, **Then** its health state, last-attempt time, and last-success time are visible and consistent with the rest of the system.
2. **Given** an import attempt fails, **When** the failure is recorded, **Then** the source's health state degrades following the same state machine used by every other source.

---

### User Story 4 - Malformed or out-of-scope records never corrupt the map (Priority: P3)

A river reach or watershed polygon with invalid geometry, a record entirely outside any served country's boundary, or a reach with a non-finite length is excluded from the imported dataset and logged with a reason, rather than silently corrupting Impact Analysis or crashing the import.

**Why this priority**: A correctness/robustness safety net — important, but the feature already delivers value once User Stories 1–3 work, even before every edge case in the raw dataset is provably handled.

**Independent Test**: Feed a batch containing one invalid-geometry record and one valid record through the import path; confirm only the valid record is stored, the invalid one is excluded with a recorded reason, and the import still reports success for the rest of the batch.

**Acceptance Scenarios**:

1. **Given** a batch of river reaches including one with degenerate/empty geometry, **When** the import processes the batch, **Then** the invalid reach is rejected with a logged reason and every other valid reach is still imported.
2. **Given** a reach that falls outside every served country's boundary after clipping, **When** the import processes it, **Then** it is excluded without being treated as an error.
3. **Given** a batch of watershed polygons including one with degenerate/empty geometry, **When** the import processes the batch, **Then** the invalid polygon is rejected with a logged reason and every other valid polygon is still imported.

### Edge Cases

- What happens when the downloaded continent-level source file (river or basin) contains zero records intersecting a served country's boundary (e.g. a very small or landlocked administrative area)? → Import completes successfully with zero features for that country; this is not treated as a failure (matches the existing "zero valid records is not a failure" convention already used by population and roads).
- How does the system handle a served country whose continent-level source file has not yet been downloaded/staged? → That country is skipped for that import run, logged, and does not block other served countries' imports.
- What happens if the same continent-level file needs to cover two served countries in different continents (Turkey in Europe/Asia border region, Madagascar in Africa)? → Each served country is clipped independently from its own appropriate continental source file; the import mechanism treats "which continent file covers which country" as configuration, not hardcoded logic.
- Which HydroBASINS hierarchy level (the dataset ships multiple nested levels, from large regional basins down to small sub-basins) is imported? → A single, moderately detailed level is chosen as the default for map display and click-to-inspect (see Assumptions) — not configurable per country in this MVP, to keep the mechanism simple; a finer/coarser level is future work if the demo shows the chosen level is wrong.
- What happens when a watershed polygon spans the boundary between a served and a non-served country? → The polygon is clipped to the served country's boundary like any other exposure geometry, consistent with how river reaches and road ways are already handled at borders.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide river-network exposure data (geometry plus length, stream order, and average discharge attributes) for each served country, sourced from HydroRIVERS.
- **FR-002**: System MUST NOT depend on the Google Flood Hub / Flood Forecasting API or any other waitlist-gated or paid service for this feature — only freely and immediately downloadable HydroRIVERS/HydroBASINS data is in scope.
- **FR-003**: The import mechanism MUST derive per-country river networks and watershed boundaries by spatially clipping continent-level source data to each served country's stored boundary — no country name or country-specific logic MAY be hardcoded in source code; per-country behavior MUST be driven entirely by existing configuration/data (served countries list, country boundaries).
- **FR-004**: System MUST store imported river-network and watershed data using the same generalized exposure storage mechanism already used for population (Kontur) and road-network (OSM) exposure data, so both appear in Impact Analysis identically to those sources.
- **FR-005**: System MUST replace (supersede) a served country's prior river-network or watershed dataset only after the new dataset has been fully and successfully written — a failed or partial import MUST NOT delete or corrupt existing data.
- **FR-006**: System MUST track and expose the HydroRIVERS and HydroBASINS sources' health state (healthy/degraded/down/disabled), last-attempt time, and last-success time, consistent with every other data source.
- **FR-007**: System MUST exclude individual river reaches or watershed polygons with invalid/empty geometry (and, for river reaches, non-finite length) from the imported dataset, logging each exclusion with a reason, without failing the import for the rest of the batch.
- **FR-008**: A single served country's import failure (e.g. missing or unreadable source file for its continent) MUST NOT block or fail the import for any other served country, for either the river or the basin dataset.
- **FR-009**: System MUST scope this MVP to exactly the currently served countries (Turkey and Madagascar) while keeping the import mechanism generic enough to onboard additional countries by adding boundary/config data alone, with no source-code changes — mirroring the pattern already established for population and road-network exposure sources.
- **FR-010**: River-network and watershed exposure datasets MUST be refreshed periodically (not on every page load or per-request), consistent with the low real-world rate of change of this geometry, using a schedule at least as infrequent as the existing road-network import's weekly cadence.
- **FR-011**: Users MUST be able to select/click a watershed boundary on the map and see its identifying details, at minimum its area — mirroring the basin-detail popup interaction the user identified in Google Flood Hub.

### Key Entities

- **River reach**: A single segment of the global river network (from HydroRIVERS), with a line geometry, length, stream order (a measure of the reach's position in the river hierarchy, from small headwater streams to major rivers), a long-term average discharge estimate, and the served country it has been clipped to.
- **Watershed / basin polygon**: A single sub-basin boundary (from HydroBASINS), with a polygon geometry, area, a basin identifier (and, where useful, upstream/downstream topology coding), and the served country it has been clipped to.
- **Exposure dataset (river network / watershed)**: A named, versioned collection of river reaches or watershed polygons for one served country, stored and superseded using the same generalized exposure-dataset mechanism as population and road-network data, so it can be selected and displayed in Impact Analysis like any other exposure layer.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For both Turkey and Madagascar, a river-network exposure dataset is present and selectable in Impact Analysis without any manual data upload.
- **SC-002**: For both Turkey and Madagascar, watershed boundary polygons are present, selectable in Impact Analysis, and show basin area/details when clicked, without any manual data upload.
- **SC-003**: Re-running the import for a country never results in more than one active river-network (or watershed) exposure dataset for that country at a time.
- **SC-004**: 100% of river reaches or watershed polygons with invalid geometry (or, for reaches, non-finite length) are excluded from Impact Analysis while every other valid record in the same batch is still imported.
- **SC-005**: The HydroRIVERS and HydroBASINS sources' current health state and last-successful-import time are visible in the Sources admin view within the same interface used for every other data source, requiring no separate tooling to check.
- **SC-006**: Onboarding a new served country requires adding boundary/configuration data only — zero source-code changes to the import mechanism itself.

## Assumptions

- HydroRIVERS' and HydroBASINS' continent-level shapefiles are downloaded/staged as a manual or semi-manual step (similar to how Kontur's per-country population datasets are resolved from HDX), not fetched live per-request — matching this feature's "static/periodic import" scope decision (no live per-country API exists for either dataset, unlike Overpass for roads).
- "Served countries" continues to mean the existing `country_boundaries`-derived list already used by every other exposure/hazard source in this system (currently Turkey, Malaysia, and Madagascar); this MVP's success is measured against Turkey and Madagascar specifically, per UNDP's confirmed demo scope.
- Live flood hazard forecasting (Google Flood Hub / Flood Forecasting API) is explicitly out of scope for this feature; it is a separate, deferred concern pending waitlist approval and would warrant its own future specification.
- A weekly (or less frequent) refresh cadence is an acceptable default for river-network and watershed geometry, which changes on the order of years to decades, not days — a stricter freshness requirement was not indicated.
- Reasonable defaults for "invalid" river reach or watershed data (non-finite length, empty/degenerate geometry) mirror the validation conventions already established for population and road-network records in this system.
- HydroBASINS ships multiple nested hierarchy levels (coarse regional basins down to fine sub-basins); this MVP imports a single default level chosen for reasonable map density and click-to-inspect usability at country scale (not the finest level, which would be too dense for a country-wide view) — the exact level is a planning-phase decision, not a product-scope one.
