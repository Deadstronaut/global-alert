# Feature Specification: OSM/Overpass Road Network Exposure Source

**Feature Branch**: `040-osm-roads-exposure`

**Created**: 2026-07-18

**Status**: Draft

**Context**: At the UNDP partner meeting, the project's near-term goal was confirmed as an MVP demo
scoped to two countries — Turkey and Madagascar — rather than the full 185-country rollout. The
partner's original datalist proposed the Google Roads API for road-network data; that source was
evaluated (see `docs/Data_Sources_Comparison.pdf` and this project's UNDP request list) and
explicitly rejected for the generic product: it is a paid, metered API (~$150+/month per country
deployment) and, being a snap-to-road/route-matching service, is not even designed for bulk
network download. OpenStreetMap's Overpass API is the free, globally-accessible equivalent already
identified as the preferred alternative. This feature adds road-network data as a new exposure
source using Overpass, following the same source-catalog/import pattern established by spec 038
(Kontur Population) — the only other auto-imported exposure source in this system.

**Input**: User description: "Add OSM/Overpass road network as a new exposure data source,
following the same pattern as spec 038 (Kontur Population). Google Roads API is explicitly
rejected due to cost. Use the free OSM/Overpass API to fetch each served country's road network
and store it as an exposure layer (same exposure_datasets/exposure_features tables that Kontur
population and manual uploads already write to), so it appears in Impact Analysis like any other
exposure dataset. Given Overpass's rate limits and heavy-query cost for large areas, this should
be a periodic/batch import (like Kontur's weekly cron), not a live per-request fetch. MVP scope:
only Turkey and Madagascar need to actually resolve/import successfully; the mechanism itself
must remain generic/country-agnostic in code — adapter code is generic, per-country config lives
in the database, never hardcoded country names in source files."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Road network appears automatically, without manual upload (Priority: P1)

An administrator who previously had to manually upload a road-network file (or do without one)
before running an impact analysis now finds that road exposure data for their country is already
present, kept up to date automatically from OpenStreetMap, without anyone having to find, export,
and upload a file.

**Why this priority**: This is the entire point of the feature — it replaces the rejected paid
Google Roads API with a free, working data path for the single asset layer most requested for the
UNDP demo (roads are one of the few PDF-listed sources the client explicitly asked about by name).

**Independent Test**: For a served country with no manually uploaded road exposure dataset, run
one import cycle and confirm a resulting `exposure_datasets`/`exposure_features` set (roads,
attributed to OSM) is usable in an impact analysis exactly like manually uploaded data.

**Acceptance Scenarios**:

1. **Given** a served country has never had a road exposure dataset manually uploaded, **When**
   the scheduled road import runs successfully for that country, **Then** an exposure dataset
   attributed to OpenStreetMap appears and its features are usable in impact analysis the same way
   as manually uploaded exposure data.
2. **Given** an admin runs the Impact Analysis Wizard, **When** they reach the "select asset layer"
   step, **Then** the auto-imported road dataset is selectable alongside any manually uploaded
   exposure datasets, clearly labeled with its source.

---

### User Story 2 - Admins can see health/freshness of the road source (Priority: P1)

An administrator viewing the Sources view can see the road-network source listed with its current
health state (healthy/degraded/down), when it last succeeded, and how many consecutive failures it
has had — the same visibility already available for Kontur Population and hazard sources.

**Why this priority**: A road layer that has silently gone stale (e.g. Overpass rejecting queries
after a rate-limit change) would undermine trust in impact analysis without anyone noticing; parity
with existing source-health visibility is required before this data can be relied on operationally.

**Independent Test**: Temporarily point the road source's query endpoint at an invalid URL and
confirm its entry in the Sources view degrades to a failing health state after the configured
number of consecutive failures, exactly as Kontur Population's entry would.

**Acceptance Scenarios**:

1. **Given** the road source is registered, **When** an admin opens the Sources view, **Then** it
   is listed with its own health state, last successful import time, and consecutive failure count.
2. **Given** the road source's query fails repeatedly, **When** consecutive failures exceed the
   configured threshold, **Then** its health state transitions to degraded/down using the same
   state machine and thresholds already used for Kontur Population and hazard sources.

---

### User Story 3 - Malformed or oversized responses never corrupt the map (Priority: P2)

When Overpass returns a road segment with invalid/empty geometry, or a country's query result is so
large it cannot be safely processed in one import run, that segment or run is excluded/reported
with a recorded reason — it never enters the map or an impact analysis as bad data, and a failure
for one country never blocks the import for another.

**Why this priority**: Road data feeds directly into impact analysis for humanitarian
decision-making; secondary to getting core coverage (US1) and visibility (US2) working, since
malformed records are expected to be the exception for a well-established public dataset like OSM.

**Independent Test**: Feed a batch containing one road segment with invalid/empty geometry and one
valid segment through the import path; confirm only the valid segment is stored, the invalid one is
excluded with a recorded reason, and the import is still reported as successful for the valid
portion.

**Acceptance Scenarios**:

1. **Given** an Overpass response contains a way with invalid or empty geometry, **When** it is
   processed, **Then** the record is excluded from storage with a recorded reason, and does not
   prevent other valid records in the same batch from being stored.
2. **Given** an Overpass query for one country times out or returns an error, **When** the import
   runs, **Then** that country is skipped (not treated as a fatal error for the whole import run)
   and other served countries' imports still complete.
3. **Given** a country's road network returns zero usable segments, **When** the import completes,
   **Then** the source's health status still reflects a successful run, consistent with the
   existing "zero valid records is not a failure" convention used for Kontur Population and hazard
   sources.

### Edge Cases

- What happens when a served country has no `country_boundaries` row yet (not yet onboarded)? That
  country is skipped for this import cycle, exactly as Kontur Population already skips countries
  with no resolved dataset — this is not an error.
- What happens when Overpass's public endpoint rate-limits or times out for a large country? The
  import for that country is treated as a failure for health-tracking purposes and retried on the
  next scheduled cycle; it must not block or fail the import for other served countries.
- What happens to previously imported road features when the import runs again for the same
  country? The prior run's road features for that country are superseded by the new import (old
  segments are not silently left alongside new ones), consistent with Kontur Population's
  supersession behavior.
- What happens if OSM tagging classifies a way as a road type this system doesn't care about (e.g.
  a footpath vs. a highway)? Only way types matching this system's road-classification filter are
  imported; others are excluded, not stored as unclassified noise.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support OpenStreetMap (via the Overpass API) as a distinct, independently
  tracked road-network data source, producing exposure data scoped to the countries this system
  serves.
- **FR-002**: System MUST NOT use the Google Roads API or any other paid, per-call-metered road
  data source for this feature.
- **FR-003**: System MUST periodically import each served country's road network on a schedule
  appropriate to how often road networks actually change (materially less frequently than real-time
  hazard feeds), not on a live per-request basis.
- **FR-004**: System MUST store imported road data as one or more exposure datasets/features usable
  by Impact Analysis in the same way as a manually uploaded exposure dataset, clearly attributed to
  OpenStreetMap as the source.
- **FR-005**: System MUST validate every road segment before storage (valid, non-empty geometry;
  location within a served country), excluding invalid segments with a recorded reason rather than
  storing them or failing the whole import.
- **FR-006**: System MUST track the road source's import health (success/failure, consecutive
  failures, last success time, healthy/degraded/down state) using the same mechanism already used
  for Kontur Population and hazard sources.
- **FR-007**: System MUST allow an authorized administrator to view the road source's health status
  and its recorded rejected/excluded records with reasons, using the same interfaces already used
  for other sources' health and audit history.
- **FR-008**: System MUST supersede a country's previously imported road features when a newer
  import for that country completes successfully, so impact analyses always reflect the latest
  imported network.
- **FR-009**: System MUST keep per-country import failures isolated — a query failure or timeout
  for one served country MUST NOT prevent the import from completing for other served countries in
  the same run.
- **FR-010**: The adapter code MUST remain generic and country-agnostic — no country name, country
  code, or country-specific query parameter may be hardcoded in source files; which countries are
  queried MUST be derived from the existing served-countries mechanism.
- **FR-011**: System MUST NOT require a manual upload step for road data that Overpass successfully
  covers for a served country; manual upload MUST remain available as a fallback for countries or
  areas OSM does not adequately cover.

### Key Entities

- **Road Network Data Source**: OpenStreetMap/Overpass — a new entry in the existing data-source
  catalog, distinguished from hazard sources by producing exposure/road data on a periodic (not
  real-time) schedule, mirroring how Kontur Population is already catalogued.
- **Road Exposure Dataset/Feature**: An auto-imported exposure dataset (and its line-geometry
  features) attributed to OpenStreetMap, usable anywhere an existing (manually uploaded or
  Kontur-imported) exposure dataset is usable today.
- **Rejected Road Segment**: A record from the road import that failed validation (invalid/empty
  geometry, or an unsupported way type) and was excluded with a recorded reason, mirroring the
  existing rejected-payload concept used for Kontur Population and hazard sources.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For Turkey and Madagascar (the confirmed MVP demo countries), a usable road exposure
  dataset is available for Impact Analysis without any manual upload, within one scheduled import
  cycle of the feature going live.
- **SC-002**: The road source is visible in the Sources view with independent health state,
  last-success time, and consecutive-failure count, matching the visibility already provided for
  Kontur Population and hazard sources.
- **SC-003**: The road source's import failure is visible as a degraded/down health state within
  the same number of import cycles as any existing source's failure would be, per the existing
  health state machine's thresholds.
- **SC-004**: 100% of road segments with invalid or empty geometry are excluded from storage and
  never appear in an impact analysis result.
- **SC-005**: Zero recurring per-call monetary cost is incurred for road data, for any number of
  served countries.

## Assumptions

- Overpass's public API (`overpass-api.de` or an equivalent public mirror) is used with no API key,
  consistent with this project's preference for free, key-less global APIs (per the UNDP source
  strategy already agreed for this project).
- A served country must already have a `country_boundaries` row (the existing onboarding
  prerequisite used by `getServedCountryCodes()`) before its road network can be imported; onboarding
  Madagascar into `country_boundaries` is a dependency of this feature reaching SC-001, not something
  this feature itself performs. Turkey is already onboarded.
- "Road network" for this MVP means OSM ways tagged with a `highway` value in the commonly used
  motorway/trunk/primary/secondary/tertiary/residential/unclassified classes — footpaths, cycleways,
  and other non-vehicular way types are out of scope for this feature.
- Road geometries are stored as line features (not polygons), consistent with how OSM represents
  ways; this differs from Kontur's polygon (H3 hexagon) features but uses the same
  `exposure_datasets`/`exposure_features` tables, which already support arbitrary GeoJSON geometry
  types.
- Given Overpass's per-query cost for large areas, a country's query may need to be split into
  smaller sub-areas (e.g. by administrative boundary) rather than one single nationwide query; the
  exact splitting strategy is an implementation detail for the planning phase, not a requirement
  here.
- This feature does not include buildings (OpenBuildingMap/OSM buildings), which remain a
  separately-scoped future feature even though they could reuse the same Overpass-based pattern.
- This feature does not include any new risk-scoring logic that specifically weights road
  connectivity/accessibility — it only makes road exposure data available for use by the existing
  Impact Analysis capability, consistent with how spec 038 scoped population data.
