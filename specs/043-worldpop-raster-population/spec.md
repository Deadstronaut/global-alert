# Feature Specification: WorldPop Raster Population Exposure Source

**Feature Branch**: `043-worldpop-raster-population`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Add raster population data as a new exposure source, starting with WorldPop, converting it into the same H3-hexagon exposure format Kontur Population already uses. Context: this project's Data Sources Inventory has an unresolved gap — WorldPop, Meta/HDX Population, and GHSL were all evaluated as population sources but never integrated, specifically because they deliver raw raster/GeoTIFF pixel data and the project had no raster-processing infrastructure (Kontur was the only population source integrated because it pre-aggregates into H3 hexagons on its own end). This feature closes that gap for WorldPop specifically: WorldPop provides a free, no-waitlist, per-country REST API (https://hub.worldpop.org/rest/data/pop/wpgp?iso3=<ISO3>) returning direct GeoTIFF download URLs (100m resolution population-count rasters, e.g. https://data.worldpop.org/GIS/Population/Global_2000_2020/2020/TUR/tur_ppp_2020.tif) — no ambiguous package search like Kontur's HDX step, no continent-file download like HydroRIVERS/HydroBASINS. The new pipeline must: download a served country's GeoTIFF, read it without a native/GDAL dependency (a pure-JS GeoTIFF reader is acceptable and was already smoke-tested working in this project's Deno runtime), aggregate pixel population values into H3 hexagon cells at a chosen resolution (mirroring Kontur's own H3-hexagon output shape), and write the result into the existing generic exposure_datasets/exposure_features tables using the same writer Kontur/roads/rivers/basins already use — so it appears as a normal toggleable, click-inspectable layer in the existing exposure-layer map (spec 042) with zero UI code changes, exactly like every other exposure source added so far. Scope is Turkey and Madagascar only, matching this project's established MVP demo scope. Meta/HDX Population and GHSL are explicitly out of scope for this feature (their raster access patterns haven't been independently confirmed) but the pipeline should be built generically enough that adding them later means writing a new small "GeoTIFF source config" entry, not new raster-processing logic. The country-level UI toggle behavior for this new layer requires zero new code — it already works generically via spec 042's existing layer panel, confirmed with the user directly before this spec was written."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A second, independent population estimate appears automatically (Priority: P1) 🎯 MVP

An analyst comparing population exposure for Turkey (or Madagascar) can select WorldPop's population layer alongside (or instead of) Kontur's, giving a second, independently-sourced estimate — useful for cross-checking, since the two sources use different methodologies and may disagree in ways worth knowing about before an impact estimate is trusted.

**Why this priority**: This is the entire value of the feature — closing this project's longest-standing data gap (raw-raster population sources were evaluated months ago and never resolved) and giving analysts a second opinion on population exposure, which single-source estimates cannot provide.

**Independent Test**: For a served country with no WorldPop dataset yet, run the import process and confirm a resulting exposure dataset (population, WorldPop-sourced) appears and is usable in Impact Analysis / the exposure-layer map exactly like Kontur's.

**Acceptance Scenarios**:

1. **Given** Turkey is a served country with no existing WorldPop dataset, **When** the import runs, **Then** a WorldPop population exposure dataset for Turkey appears, made of H3 hexagon cells each carrying an estimated population value, structurally consistent with (but a distinct dataset from) Kontur's existing Turkey population layer.
2. **Given** Madagascar is a served country, **When** the import runs, **Then** the same outcome occurs for Madagascar, using the same generic import code as Turkey (no country-specific logic).
3. **Given** a country's WorldPop dataset was previously imported, **When** the import runs again for that country (e.g. a newer year's raster becomes available), **Then** the prior dataset is fully replaced (superseded) by the new one, with no duplicate or orphaned data left behind — consistent with every other exposure source in this system.

---

### User Story 2 - The new layer behaves exactly like every other exposure layer, with zero new UI work (Priority: P1) 🎯 MVP

A user viewing the map's exposure-layer panel sees the WorldPop layer listed and toggleable alongside Kontur, roads, rivers, and basins, and can click any hexagon to see its population value — using the map's existing generic layer/popup behavior, not a new or different interaction pattern.

**Why this priority**: Directly confirms the payoff of this project's generic exposure-layer architecture (spec 042) — a fifth distinct source type should require zero rendering/popup code changes, the same way the fourth one (HydroRIVERS/HydroBASINS) did.

**Independent Test**: With a WorldPop dataset imported for at least one served country, open the map, confirm the layer panel lists it, toggle it on, click a hexagon, and confirm its population value appears in the popup — without any code changes to the map's rendering, store, or popup logic.

**Acceptance Scenarios**:

1. **Given** a WorldPop dataset exists for a served country, **When** a user opens the map's exposure-layer panel, **Then** the WorldPop layer appears in the list alongside every other available layer, initially toggled off.
2. **Given** the WorldPop layer is toggled on, **When** a user clicks a hexagon, **Then** a popup shows that hexagon's estimated population value, using the same generic popup mechanism every other exposure layer already uses.

---

### User Story 3 - Malformed or out-of-scope raster data never corrupts the map (Priority: P3)

A raster pixel or resulting hexagon with an invalid/non-finite population value, or a hexagon that falls outside the served country's boundary, is excluded from the imported dataset rather than silently corrupting Impact Analysis or crashing the import.

**Why this priority**: A correctness/robustness safety net — the feature already delivers value once User Stories 1–2 work.

**Independent Test**: Feed a raster region containing a no-data/invalid pixel value through the aggregation path; confirm the resulting dataset excludes hexagons derived entirely from invalid data, and the import still completes successfully for the rest of the country.

**Acceptance Scenarios**:

1. **Given** a GeoTIFF containing no-data/invalid pixel values (a normal, expected condition at raster edges and over water), **When** the import aggregates pixels into hexagons, **Then** those pixels are excluded from the aggregation rather than being treated as zero or crashing the process.
2. **Given** an aggregated hexagon's resulting value is non-finite or the hexagon falls outside the served country's boundary, **When** the import writes results, **Then** that hexagon is excluded with the exclusion logged, and every other valid hexagon for that country is still written.

### Edge Cases

- What happens when WorldPop has no data for a served country (e.g. a country too new or too small to be covered)? → That country is skipped for that import run, logged, and does not block other served countries' imports — the same "zero valid records is not a failure" convention already used by every other exposure source in this system.
- What happens when a raster's resolution produces a hexagon aggregation with only a handful of source pixels (e.g. a very small island)? → The hexagon is still included as long as its aggregated value is valid (finite, non-negative) — no minimum-pixel-count threshold is imposed, matching this system's general preference for inclusion over silent exclusion when data is merely sparse rather than invalid.
- What happens if WorldPop publishes a newer year's raster for an already-imported country? → Re-running the import supersedes the prior dataset, per User Story 1's acceptance scenario 3 — this is a normal, expected periodic refresh, not a special case.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a second, independently-sourced population exposure dataset (from WorldPop) for each served country, structurally consistent with Kontur's existing population exposure format (H3 hexagon cells, each carrying an estimated population value).
- **FR-002**: System MUST NOT depend on any paid, waitlist-gated, or access-request-pending data source for this feature — only WorldPop's free, immediately-accessible per-country API and GeoTIFF downloads are in scope.
- **FR-003**: The import mechanism MUST derive each served country's raster source location generically (via WorldPop's per-country API, keyed by country code) — no country name or country-specific logic MAY be hardcoded in source code; per-country behavior MUST be driven entirely by existing configuration/data (served countries list).
- **FR-004**: System MUST aggregate raster pixel population values into H3 hexagon cells at a single, consistently-applied resolution across all served countries.
- **FR-005**: System MUST store the resulting WorldPop dataset using the same generalized exposure storage mechanism already used by every other exposure source (population, roads, rivers, basins), so it appears in the exposure-layer map identically to those sources, with no source-specific rendering or popup code required.
- **FR-006**: System MUST replace (supersede) a served country's prior WorldPop dataset only after the new dataset has been fully and successfully written — a failed or partial import MUST NOT delete or corrupt existing data.
- **FR-007**: System MUST track and expose the WorldPop source's health state (healthy/degraded/down/disabled), last-attempt time, and last-success time, consistent with every other data source.
- **FR-008**: System MUST exclude individual hexagons with a non-finite, negative, or entirely-no-data-derived population value from the imported dataset, logging each exclusion with a reason, without failing the import for the rest of the country's data.
- **FR-009**: A single served country's import failure (e.g. WorldPop has no data for that country, or the download fails) MUST NOT block or fail the import for any other served country.
- **FR-010**: System MUST scope this MVP to exactly the currently served countries (Turkey and Madagascar) while keeping the import mechanism generic enough to onboard additional countries by relying on the same per-country API call alone — no source-code changes.
- **FR-011**: The raster-to-hexagon pipeline (download, read, aggregate) MUST be built as a source-agnostic mechanism configured by a small per-source description (API/URL pattern, resolution, band selection), not as WorldPop-specific logic — so that adding a future raster source (e.g. Meta/HDX Population, GHSL) is a configuration addition, not new processing code, once that source's own access pattern is independently confirmed.
- **FR-012**: The exposure-layer map (spec 042) MUST display and support click-inspection of the WorldPop layer with zero code changes to its rendering, store, color-assignment, or popup logic — confirming spec 042's generic-by-design guarantee continues to hold for a raster-derived source, not just vector sources.

### Key Entities

- **Raster population source config**: A small, data-driven description of one GeoTIFF-based population source (its per-country API/URL pattern, pixel value meaning, and the H3 resolution to aggregate into) — WorldPop is the first and only configured entry for this MVP; Meta/HDX Population and GHSL are named as the next candidates once their own access patterns are confirmed, but are not configured in this feature.
- **Aggregated population hexagon**: One H3 hexagon cell for a served country, holding a population value derived by summing/aggregating the raster pixels whose centers fall within that cell — stored via the same exposure-dataset mechanism as Kontur's own hexagons, but as a distinct dataset (not merged with Kontur's).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For both Turkey and Madagascar, a WorldPop population exposure dataset is present and selectable in the exposure-layer map without any manual data upload.
- **SC-002**: An analyst can view both Kontur's and WorldPop's population estimates for the same country side by side (one at a time, via the existing layer toggle) to compare them, without needing any tool or process outside this system.
- **SC-003**: Re-running the import for a country never results in more than one active WorldPop exposure dataset for that country at a time.
- **SC-004**: 100% of hexagons derived from invalid/no-data-only raster regions are excluded from the map while every other valid hexagon for the same country is still imported.
- **SC-005**: The WorldPop source's current health state and last-successful-import time are visible in the Sources admin view within the same interface used for every other data source.
- **SC-006**: Adding a WorldPop layer to the map required zero changes to the map's existing rendering/store/popup code — verified by code review (no new source-specific branches introduced).

## Assumptions

- WorldPop's per-country REST API and direct GeoTIFF downloads remain free and require no registration/API key, consistent with what was confirmed during this feature's own research; if that changes, this feature's viability would need to be reassessed (mirroring how Google Flood Hub's waitlist was handled as an explicit blocker for a different feature).
- A single H3 resolution is chosen as this MVP's default for WorldPop hexagons (a planning-phase decision, not a product-scope one) — it does not need to exactly match Kontur's own resolution, since the two sources are shown as separate, independently-toggleable layers rather than merged into one.
- "Served countries" continues to mean the existing `country_boundaries`-derived list already used by every other exposure/hazard source in this system; this MVP's success is measured against Turkey and Madagascar specifically, per the project's confirmed demo scope.
- Meta/HDX Population and GHSL remain explicitly out of scope for this feature — their own access patterns (registration requirements, file formats, licensing) have not been independently researched, unlike WorldPop's, and are called out in the Data Sources Inventory as separate, unresolved items.
- No raster reprojection/coordinate-system handling beyond what a standard GeoTIFF reader provides out of the box is assumed necessary — WorldPop's rasters are published in a standard geographic projection compatible with this system's existing WGS84-based geometry handling; a genuine reprojection requirement, if discovered during implementation, would be a live finding requiring its own decision, not something to silently work around.
