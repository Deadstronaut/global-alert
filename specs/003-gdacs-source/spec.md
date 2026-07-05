# Feature Specification: GDACS Global Data Source

**Feature Branch**: `003-gdacs-source`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Add GDACS (Global Disaster Alert and Coordination System, gdacs.org — a joint European Commission / UN OCHA initiative) as a new multi-hazard data source for the existing hazard-agnostic ingestion pipeline (feature 001-data-ingestion-monitoring) and the country-scoping model (feature 002-source-scoping). GDACS is a genuinely global/worldwide source and should be registered as a global-scope data source (country_code = NULL), visible to every admin. GDACS publishes a combined feed covering multiple hazard types (earthquake, tropical cyclone, flood, volcano, drought) in a single event list — this is the first data source in this system that natively spans multiple of the app's existing hazard_type categories from one endpoint. Each GDACS event must be normalized into this app's existing DisasterEvent/normalized-record shape and routed to the correct existing hazard-type table (earthquake, wildfire, flood, drought — GDACS's 'tropical cyclone' and 'volcano' categories fall outside the 5 hazard types this app currently supports, so those two categories are explicitly excluded/dropped during normalization, not stored). Reuse existing per-source health tracking, payload validation, and deduplication conventions. WMO CAP integration is explicitly out of scope (constitution Principle II forbids inbound CAP hub ingestion)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Global hazard coverage without a country tie (Priority: P1)

An administrator (any country, or Super Admin) opens the Sources tab and sees GDACS listed as a global source alongside USGS and NASA FIRMS — it is not scoped to any one country, and every admin benefits from the additional worldwide earthquake/flood/drought coverage it brings, without needing per-country configuration.

**Why this priority**: This is the core value of adding GDACS — broader worldwide coverage for hazard types the system already tracks, available to everyone immediately with zero per-country setup.

**Independent Test**: After the feature ships, log in as any Country Admin (including one with no local sources, e.g. Madagascar) and confirm GDACS appears in the Global group of the Sources tab with a healthy status once it has successfully fetched at least once.

**Acceptance Scenarios**:

1. **Given** GDACS is registered as a data source, **When** any admin opens the Sources tab, **Then** GDACS appears in the Global group (not the Local group), regardless of the admin's own country.
2. **Given** GDACS's feed contains an earthquake, a flood, and a drought event in the same fetch cycle, **When** the fetch completes, **Then** all three events appear in their respective existing hazard-type views (earthquake, wildfire, flood, drought layers) exactly as if they had come from any other existing source for that hazard type.

---

### User Story 2 - Out-of-scope hazard categories are safely dropped, not stored (Priority: P1)

GDACS's feed includes "tropical cyclone" and "volcano" events, which are not among the 5 hazard types this system currently models (earthquake, wildfire, flood, drought, food_security). When these appear in a fetch, the system must not error, crash, or attempt to store them under an incorrect hazard type — they are simply excluded from this ingestion, the same way a malformed record would be excluded, with a clear reason recorded.

**Why this priority**: Without this, an unhandled category could either crash the fetch (breaking coverage for the other, in-scope hazard types in the same batch) or get miscategorized into an existing table with the wrong hazard type — both unacceptable per the system's existing data-quality guarantees.

**Independent Test**: Feed a batch containing one tropical cyclone event, one volcano event, and one earthquake event through the GDACS ingestion path; confirm only the earthquake event is stored, the other two are excluded with a recorded reason, and the fetch as a whole reports success (not a failure) for the in-scope portion.

**Acceptance Scenarios**:

1. **Given** a GDACS fetch returns a tropical cyclone event, **When** it is processed, **Then** it is excluded from storage and the exclusion is recorded with a reason indicating an unsupported hazard category, and does not prevent other in-scope events in the same batch from being stored.
2. **Given** a GDACS fetch returns a volcano event, **When** it is processed, **Then** the same exclusion behavior applies as for tropical cyclone events.
3. **Given** a GDACS fetch returns only out-of-scope categories (no earthquake/flood/drought events at all), **When** the fetch completes, **Then** the source's health status still reflects a successful fetch (a quiet/filtered feed is not a failure), consistent with the existing "zero records is not a failure" convention from feature 001.

---

### User Story 3 - GDACS participates in existing health monitoring and deduplication (Priority: P2)

An administrator viewing the Sources tab sees GDACS's health status (healthy/degraded/down), last successful fetch time, and consecutive failure count exactly like any other source. If GDACS and an existing source (e.g. USGS) both report the same real-world earthquake, only one event appears — not a duplicate.

**Why this priority**: Consistency with the existing monitoring and data-quality model is important for operability, but is secondary to the coverage itself (US1) and safe handling of unsupported categories (US2), which are the higher-impact/higher-risk parts of this feature.

**Independent Test**: Temporarily point GDACS's endpoint at an invalid URL and confirm its health status degrades exactly like any existing source would; separately, feed a GDACS earthquake event with the same approximate location and time as an already-ingested USGS earthquake and confirm only one event is retained.

**Acceptance Scenarios**:

1. **Given** GDACS's endpoint fails to respond, **When** consecutive failures accumulate past the configured threshold, **Then** GDACS's health state transitions to degraded/down exactly as any existing source would (per feature 001's state machine).
2. **Given** GDACS reports an earthquake within the existing deduplication distance/time window of an event already ingested from another source, **When** both are processed, **Then** only one event is retained per the existing deduplication rule for that hazard type.

### Edge Cases

- What happens when a GDACS event's hazard category (earthquake/flood/drought) is recognized, but the individual record is otherwise malformed (missing coordinates, invalid timestamp)? It is rejected by the existing payload validation step exactly like a malformed record from any other source, not specially handled.
- What happens if GDACS's feed format changes in a way that makes the whole response unparseable? The fetch is treated as a failure for health-tracking purposes, consistent with how any existing source's fetch failure is handled — it must not crash the polling cycle for other sources.
- What happens the first time GDACS is registered, before its first successful fetch? It appears in the Global group with a pending/healthy-by-default status and no last-success time, consistent with how a newly registered source behaves today (per feature 001).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support GDACS as a data source registered with global scope (no country association), visible to and manageable only by roles already permitted to manage global sources (per feature 002's existing scope rules).
- **FR-002**: System MUST fetch GDACS's combined multi-hazard feed on a schedule consistent with how other sources of comparable update frequency are polled.
- **FR-003**: System MUST normalize each GDACS event of a supported hazard type (earthquake, wildfire, flood, drought) into this system's existing normalized event shape and route it to the corresponding existing hazard-type storage, indistinguishable in structure from events from any other source of that hazard type.
- **FR-004**: System MUST exclude GDACS events whose hazard category is not among the 5 currently supported hazard types (specifically: tropical cyclone, volcano), recording the exclusion with a reason, without storing them and without treating their presence as a fetch failure.
- **FR-005**: System MUST apply the existing payload validation rules to every in-scope GDACS record before storage, identical to the validation applied to existing sources.
- **FR-006**: System MUST apply the existing deduplication rule (per hazard type) across GDACS and all other sources reporting the same hazard type, so the same real-world event reported by multiple sources is not stored more than once.
- **FR-007**: System MUST track GDACS's fetch health (success/failure, consecutive failures, last success time, healthy/degraded/down state) using the same mechanism already used for all other sources.
- **FR-008**: System MUST allow an authorized administrator to view GDACS's health status, and its recorded excluded/rejected records with their reasons, using the same interfaces already used for other sources' health and audit history.

### Key Entities

- **GDACS Data Source**: A new entry in the existing data source catalog, global in scope, distinguished from existing sources only by covering multiple hazard types from a single endpoint rather than one hazard type per source.
- **Unsupported Hazard Category**: A category present in GDACS's feed (tropical cyclone, volcano) that has no corresponding hazard type in this system today; treated as an exclusion reason, not a new hazard type.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every admin, regardless of their own country (including a country with zero local sources), sees GDACS listed as a global source within the Sources tab, 100% of the time.
- **SC-002**: 100% of GDACS events in supported hazard categories (earthquake, wildfire, flood, drought) that pass validation appear in their respective hazard views, with no data loss beyond the existing validation/deduplication rules.
- **SC-003**: 100% of GDACS events in unsupported categories (tropical cyclone, volcano) are excluded without ever appearing in any hazard-type view or causing a fetch-level failure.
- **SC-004**: A GDACS fetch failure is visible in the Sources tab as a degraded/down health state within the same number of polling cycles as any existing source's failure would be (per feature 001's existing thresholds).

## Assumptions

- GDACS's feed is treated as one logical data source in the catalog for this feature; if operational needs later require splitting it per-hazard-type (e.g. separate health tracking per category), that is a follow-up decision, not part of this feature.
- "Tropical cyclone" and "volcano" remain unsupported until a separate, explicit decision is made to add them as new hazard types system-wide (per this project's constitution, Principle I — hazard types are added via configuration, not a one-off carve-out for a single source); this feature does not add them.
- GDACS's polling interval will be chosen to match the update cadence of its underlying categories (comparable to the existing earthquake/flood/drought sources' intervals), not a new, separate cadence policy.
- No new authentication/API-key requirement is assumed for GDACS's public feed; if one is discovered to be required during implementation, it follows the same secret-handling convention already used for existing sources requiring API keys (e.g. NASA FIRMS).
- This feature does not change the existing deduplication distance/time thresholds per hazard type — GDACS participates using the same thresholds already defined for each hazard type.
- WMO CAP ingestion is explicitly excluded from this feature per the project constitution's Scope Discipline principle (inbound CAP hub ingestion is out of scope) and is not addressed here.
