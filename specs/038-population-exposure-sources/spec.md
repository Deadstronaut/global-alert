# Feature Specification: Population Exposure Data Sources

**Feature Branch**: `038-population-exposure-sources`

**Created**: 2026-07-09

**Status**: Draft

**Amendment (2026-07-09, during planning)**: WorldPop was removed from this feature's scope after
live verification found every WorldPop resource for a served country is GeoTIFF-only (raster) with
no vector/CSV extract — ingesting it would require a raster-processing dependency this feature
deliberately does not take on (see plan.md's Complexity Tracking and data-model.md §5b).

**Amendment 2 (2026-07-09, during implementation)**: Meta/HDX Population was also removed from this
feature's scope, after live verification found its per-country CSV resource is raw ~30m-resolution
point grid data — Turkey's alone is 134MB compressed / ~1.1GB uncompressed / 18.6 million rows.
This is not feasible to download/parse within an Edge Function, nor sensible to store as 18.6M
individual `exposure_features` rows (compare to Kontur's ~400m pre-aggregated H3 hexagons, orders
of magnitude smaller). Meta shares WorldPop's underlying problem (raw grid-resolution source data
requiring spatial aggregation before it fits this feature's exposure model) despite its simpler
file format — see data-model.md §5c.

**Amendment 3 (2026-07-09, during implementation)**: GHSL was also removed from this feature's
scope. Verified live: GHSL's population grid is distributed as a single ~400MB global GeoTIFF zip
per epoch/resolution, additionally split into row/column raster tiles (e.g.
`GHS_POP_..._R1_C8.zip`) — no vector or per-country download exists. This is the same
raster-processing problem as WorldPop (data-model.md §5b), just discovered later because GHSL's
"Data download" listing in the client's PDF gave no format hint the way HDX's package metadata did
for the other three.

This feature now covers **one** source: Kontur Population. WorldPop, Meta/HDX Population, and GHSL
are all left for a separately-scoped future feature that properly budgets for raster processing
and/or spatial aggregation, rather than folding that complexity into what was meant to be this
project's lowest-risk, simplest integration tier. The original 4-source request is preserved below
for history; treat "four sources" / "WorldPop" / "Meta" / "GHSL" mentions in the untouched text
below as superseded by these three amendments.

**Input**: User description: "Add population exposure data source ingestion: WorldPop, Kontur Population, GHSL, and Meta/HDX population datasets. These are all 'cell/hexagon-level population count' datasets fetched via API (WorldPop and Kontur and Meta via HDX API, GHSL via periodic data download) and written into the existing exposure_features table (dataset_id, geom, metric_value = population count, properties JSONB for source metadata) via a new scheduled Edge Function, mirroring the existing GDACS-style trackedFetch + upsert pattern used in supabase/functions/shared (resolveSourceId, recordFetchOutcome, logRejectedPayload) but targeting exposure_features instead of hazard event tables. No schema/migration changes should be required since exposure_features already supports a single scalar metric_value + free-form JSONB properties per feature, scoped by country_code/org_id like existing exposure datasets. Each of the 4 sources should be tracked in data_sources (or an equivalent registry) for health/failure monitoring consistent with existing hazard sources, so admins get the same visibility (ACTIVE/PAUSED/DEGRADED/INACTIVE style state) they already have for GDACS/USGS/etc. This is explicitly scoped as Tier 1 (lowest risk) of a larger 14-source external data integration effort requested by the client (see MHEWS Datalist and Risk and Scenario Modeling PDFs) — INFORM Index, vector building/road data, and WMS/WFS raster layers (CHIRPS, soil moisture, FAPAR) are explicitly OUT of scope for this spec and will be separate future specs."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Population coverage appears automatically, without manual upload (Priority: P1)

An administrator who previously had to manually upload a population shapefile before running an impact analysis now finds that population exposure data for their country is already present, kept up to date automatically from public population datasets (WorldPop, Kontur Population, GHSL, Meta/HDX), without anyone having to find, download, and upload a file.

**Why this priority**: This is the entire point of the feature — it removes the manual-upload bottleneck for the single most commonly needed exposure layer (population) and is a prerequisite for later Impact Analysis and Risk & Scenario Modeling work described in the client's requirement documents.

**Independent Test**: For a country with no manually uploaded population exposure dataset, confirm that after the scheduled import has run at least once, at least one auto-imported population exposure dataset exists and its features can be used in an impact analysis (spatial intersection with a hazard) exactly as a manually uploaded dataset would be.

**Acceptance Scenarios**:

1. **Given** a country has never had a population exposure dataset manually uploaded, **When** the scheduled population import runs successfully for that country, **Then** an exposure dataset attributed to the relevant source (WorldPop, Kontur, GHSL, or Meta/HDX) appears and its features are usable in impact analysis the same way as manually uploaded exposure data.
2. **Given** an admin runs an Impact Analysis Wizard flow, **When** they reach the "select asset layer" step, **Then** the auto-imported population datasets are selectable alongside any manually uploaded exposure datasets, clearly labeled with their source.

---

### User Story 2 - Admins can see health/freshness of each population source (Priority: P1)

An administrator viewing the Sources tab (or an equivalent data-source management view) can see each of the four population sources (WorldPop, Kontur Population, GHSL, Meta/HDX) listed with its current health state (healthy/degraded/down), when it last succeeded, and how many consecutive failures it has had — the same visibility already available for hazard sources like GDACS and USGS.

**Why this priority**: Population data silently going stale or failing to import would undermine trust in downstream impact analysis and risk scoring without anyone noticing; parity with existing source-health visibility is required before this data can be relied on operationally.

**Independent Test**: Temporarily point one population source's endpoint at an invalid URL and confirm its entry in the Sources view degrades to a failing health state after the configured number of consecutive failures, exactly as an existing hazard source would.

**Acceptance Scenarios**:

1. **Given** all four population sources are registered, **When** an admin opens the Sources view, **Then** each source is listed with its own health state, last successful import time, and consecutive failure count.
2. **Given** a population source's endpoint fails repeatedly, **When** consecutive failures exceed the configured threshold, **Then** its health state transitions to degraded/down using the same state machine and thresholds already used for hazard sources.
3. **Given** a population source recovers after a period of failure, **When** the next import succeeds, **Then** its health state returns to healthy and the failure streak resets, consistent with existing source-health behavior.

---

### User Story 3 - Malformed or out-of-range records are rejected, not silently corrupted (Priority: P2)

When a population source's import returns a record with an invalid geometry, a missing/negative population value, or a location outside any country this system serves, that record is excluded from storage with a recorded reason — it never enters the map or an impact analysis as bad data, and it never crashes the rest of that source's import.

**Why this priority**: Population counts feed directly into humanitarian decision-making (via impact analysis and, eventually, risk scoring); silently importing corrupt values would be worse than not having the data at all. This is secondary to getting the core coverage (US1) and visibility (US2) working, since malformed records are expected to be the exception, not the norm, for these well-established public datasets.

**Independent Test**: Feed a batch containing one record with a negative population value, one with an empty/invalid geometry, and one valid record through a population source's import path; confirm only the valid record is stored, the other two are excluded with a recorded reason, and the import as a whole is reported as successful (not a failure) for the valid portion.

**Acceptance Scenarios**:

1. **Given** an import batch contains a record with a negative or non-numeric population value, **When** it is processed, **Then** the record is excluded from storage with a recorded reason, and does not prevent other valid records in the same batch from being stored.
2. **Given** an import batch contains a record with an invalid or empty geometry, **When** it is processed, **Then** the same exclusion behavior applies.
3. **Given** an import batch contains only invalid records (no valid population cells at all), **When** the import completes, **Then** the source's health status still reflects a successful import (an empty or fully-filtered batch is not treated as a fetch failure), consistent with the existing "zero records is not a failure" convention used for hazard sources.

### Edge Cases

- What happens when two population sources both cover the same geographic cell (e.g. WorldPop and Kontur both have a value for the same area)? Both are stored as separate exposure features attributed to their own source/dataset; the system does not attempt to merge or deduplicate population counts across sources, and a user selecting an asset layer for impact analysis picks one source's dataset explicitly.
- What happens the first time a source is registered, before its first successful import? It appears in the Sources view with a pending/healthy-by-default status and no last-success time, consistent with how a newly registered hazard source behaves today.
- What happens if a source's upstream format changes in a way that makes the whole response unparseable? The import is treated as a failure for health-tracking purposes, consistent with how any existing source's fetch failure is handled — it must not crash imports for the other three population sources.
- What happens when a population source has no data at all for a given country (e.g. a very small or newly onboarded country)? No exposure dataset is created for that source/country combination; this is not treated as an error, and the admin can still manually upload a population dataset for that country as before.
- What happens to previously imported population features when a source's scheduled import runs again? The prior run's features for that source/country are superseded by the new import (old values are not silently left alongside new ones for the same cell), so impact analyses always use the most recently imported values per source.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support WorldPop, Kontur Population, GHSL, and Meta/HDX population data as distinct, independently tracked data sources, each producing exposure data scoped to the countries this system serves.
- **FR-002**: System MUST periodically import each population source's data on a schedule appropriate to that source's own update frequency (these datasets update far less often than real-time hazard feeds).
- **FR-003**: System MUST store each imported population source's data as one or more exposure datasets/features usable by Impact Analysis in the same way as a manually uploaded exposure dataset, clearly attributed to its originating source.
- **FR-004**: System MUST validate every population record before storage (valid geometry, non-negative numeric population value, location within a served country), excluding invalid records with a recorded reason rather than storing them or failing the whole import.
- **FR-005**: System MUST track each population source's import health (success/failure, consecutive failures, last success time, healthy/degraded/down state) using the same mechanism already used for hazard sources.
- **FR-006**: System MUST allow an authorized administrator to view each population source's health status and its recorded rejected/excluded records with reasons, using the same interfaces already used for hazard sources' health and audit history.
- **FR-007**: System MUST supersede a source's previously imported population features for a given country when a newer import for that same source/country completes successfully, so impact analyses always reflect the latest imported values.
- **FR-008**: System MUST NOT require a manual upload step for population data that is available from one of these four sources for a served country; manual upload MUST remain available as a fallback for countries or areas these sources do not cover.
- **FR-009**: System MUST keep each source's imported data separate and independently selectable — the system does not merge, average, or deduplicate population values across WorldPop, Kontur, GHSL, and Meta/HDX for the same location.

### Key Entities

- **Population Data Source**: One of WorldPop, Kontur Population, GHSL, or Meta/HDX Population — a new entry in the existing data-source catalog, distinguished from hazard sources by producing exposure/population data on a periodic (not real-time) schedule rather than hazard events.
- **Population Exposure Dataset/Feature**: An auto-imported exposure dataset (and its features) attributed to one of the four population sources, holding a population count value per cell/area, usable anywhere an existing (manually uploaded) exposure dataset is usable today.
- **Rejected Population Record**: A record from a population source's import that failed validation (invalid geometry, invalid population value, or out-of-coverage location) and was excluded with a recorded reason, mirroring the existing rejected-payload concept used for hazard sources.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any served country covered by at least one of the four population sources, a usable population exposure dataset is available for Impact Analysis without any manual upload, within one scheduled import cycle of the feature going live.
- **SC-002**: 100% of the four population sources are visible in the Sources view with independent health state, last-success time, and consecutive-failure count, matching the visibility already provided for existing hazard sources.
- **SC-003**: A population source's import failure is visible as a degraded/down health state within the same number of import cycles as any existing hazard source's failure would be, per the existing health state machine's thresholds.
- **SC-004**: 100% of population records with invalid geometry or invalid (negative/non-numeric) population values are excluded from storage and never appear in an impact analysis result.
- **SC-005**: Administrators can distinguish which of the four sources any given population exposure dataset came from, 100% of the time, when selecting an asset layer in the Impact Analysis Wizard.

## Assumptions

- WorldPop, Kontur Population, and Meta/HDX Population are all accessed through HDX (Humanitarian Data Exchange) as the common access point; GHSL is accessed via its own periodic data-download mechanism rather than HDX. All four are treated as independent sources in the catalog regardless of access mechanism.
- These four sources publish pre-aggregated population counts per cell/hexagon/grid area (not raw imagery or individual building-level counts), consistent with how they are described in the client's data-source list; this feature does not perform any new spatial aggregation beyond what each source already provides.
- No new database schema or migration is required: population features are stored using the existing exposure dataset/feature model (a dataset record plus per-feature geometry, a single numeric population value, and free-form source-metadata properties), the same model already used for manually uploaded exposure data.
- Import scheduling for these sources follows the same "no server-side cron" convention already used for hazard sources in this system (triggered on an interval by the running application), unless a scheduling mechanism is introduced as a prerequisite in a separate feature.
- No new authentication/API-key requirement is assumed beyond what each source's public API already requires; if a source requires an API key or access token, it follows the same secret-handling convention already used for existing hazard sources requiring credentials (e.g. NASA FIRMS).
- This feature does not include INFORM Index (vulnerability), building/road vector data (OpenBuildingMap, OSM, Google Roads), or raster/WMS hazard-adjacent layers (CHIRPS, EU GDO soil moisture, FAPAR, JRC GFM) — those are explicitly out of scope and are expected to be addressed, if at all, in separate future features.
- This feature does not include any risk-scoring or hazard-intensity-classification logic (e.g. combining population exposure with hazard intensity and a vulnerability factor) — it only makes population exposure data available for use by the existing Impact Analysis capability; risk scoring remains part of the separate, not-yet-started Risk & Scenario Modeling roadmap module.
