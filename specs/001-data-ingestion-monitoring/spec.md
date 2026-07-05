# Feature Specification: Data Source Health, State Tracking & Payload Validation

**Feature Branch**: `001-data-ingestion-monitoring`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Data Ingestion & Monitoring modülünü genişletme (PRD modül M3). Source Registration & Health Dashboard, Source State Machine (healthy/degraded/down/disabled), Checksum/Payload Validation. Kapsam dışı: OGC WMS/WFS adapter, yeni hazard tipi, forecasting/nowcasting."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Monitor Data Source Health (Priority: P1)

As a Tenant Admin, I want to see the live health status of every configured data source
(earthquake, wildfire, flood, drought, food security feeds) in one dashboard, so that I know
immediately when a source stops delivering fresh data and can act before operators trust stale
information.

**Why this priority**: Without visibility into source health, stale or broken feeds silently
degrade alert accuracy — this is the foundation all other work in this feature builds on.

**Independent Test**: Can be fully tested by disabling a real source's network access (or
pointing it at a broken endpoint) and confirming the dashboard shows that source's status
change from "healthy" to "degraded" or "down" within one polling cycle, without needing the
state machine or validation features implemented yet.

**Acceptance Scenarios**:

1. **Given** all configured data sources have fetched successfully within their expected
   interval, **When** a Tenant Admin opens the health dashboard, **Then** every source shows a
   "healthy" status with its last successful fetch timestamp.
2. **Given** a data source has not returned a successful fetch for longer than its configured
   staleness threshold, **When** the dashboard refreshes, **Then** that source is shown as
   "stale/degraded" with a visible warning indicator and the elapsed time since last success.
3. **Given** a Tenant Admin is viewing the dashboard, **When** they select a specific source,
   **Then** they see its configuration (name, hazard type, endpoint, poll interval, active/
   inactive) and a short recent history of fetch attempts (success/failure, timestamp).

---

### User Story 2 - Register, Disable, and Remove Data Sources (Priority: P2)

As a Tenant Admin, I want to register a new data source, temporarily disable one, or remove one
entirely, so that I can adapt the system's inputs without requiring a code deployment.

**Why this priority**: Builds directly on the health dashboard (US1) — registration is what
populates the list of sources the dashboard monitors. It is P2 because the dashboard is useful
even against the current hard-coded source list, but the system cannot scale past the initial
5 sources without this capability.

**Independent Test**: Can be fully tested by adding a new source through the admin UI, verifying
it starts appearing in the health dashboard and its data (once fetched) flows through to the map
alongside existing sources, then disabling it and confirming no further fetch attempts occur for
that source.

**Acceptance Scenarios**:

1. **Given** a Tenant Admin has endpoint details for a new hazard data feed of a type the system
   already supports, **When** they submit the source registration form, **Then** the new source
   appears in the health dashboard as "healthy" (pending first fetch) and is included in the next
   scheduled polling cycle.
2. **Given** an existing data source is misbehaving or no longer needed, **When** a Tenant Admin
   disables it, **Then** the system stops polling that source immediately and its prior data
   remains visible but is clearly marked as coming from a disabled source going forward (no new
   events accepted from it).
3. **Given** a Tenant Admin attempts to remove a data source that has ingested events currently
   displayed on the map, **When** they confirm removal, **Then** the source configuration is
   deleted, no further polling occurs, and previously ingested events are retained for historical
   record (removal affects future ingestion only, not past data).

---

### User Story 3 - Reject and Audit Malformed Source Payloads (Priority: P3)

As an Auditor, I want every rejected or malformed data-source payload to be logged with the
reason for rejection, so that I can verify that broken or tampered data never silently entered
the system and can trace exactly what was rejected and when.

**Why this priority**: This is a data-integrity safety net. It matters less than knowing sources
are healthy (US1) or being able to configure them (US2), but it is required before this feature
can be considered complete, since malformed payloads are the most likely real-world failure mode
of any external feed.

**Independent Test**: Can be fully tested by feeding a deliberately malformed payload (missing
required field, wrong data type, out-of-range coordinate) into the ingestion pipeline for one
source and confirming: (a) no event is written to the database, (b) an audit entry recording the
rejection reason exists, and (c) the source's health status reflects the failed attempt without
crashing subsequent polling cycles.

**Acceptance Scenarios**:

1. **Given** a data source returns a payload missing a required field (e.g., no coordinates or no
   timestamp), **When** the ingestion pipeline processes it, **Then** the malformed record is
   rejected, not written to the database, and an audit log entry is created recording the source,
   timestamp, and the specific validation failure.
2. **Given** a data source returns a payload with an out-of-range value (e.g., latitude outside
   -90..90, negative magnitude for a scale that doesn't support it), **When** validated, **Then**
   that individual record is rejected while other valid records in the same payload are still
   processed normally (partial-batch tolerance).
3. **Given** an Auditor wants to review data quality history, **When** they query rejected-payload
   audit entries for a date range and/or source, **Then** they receive a list showing what was
   rejected, why, and when, sufficient to reconstruct the incident without needing raw system logs.

---

### Edge Cases

- What happens when a source that was "down" for an extended period comes back online — does it
  resume automatically, and is the recovery itself recorded (state transition back to healthy)?
- How does the system handle a data source whose endpoint returns a successful HTTP response but
  with an empty or unexpectedly small result set (e.g., zero events for a normally-active feed) —
  is this treated as healthy (correctly quiet) or flagged for review?
- What happens if two Tenant Admins edit the same source's configuration concurrently?
- How does source disablement interact with in-flight fetch requests already scheduled at the
  moment of disablement — are they allowed to complete or aborted?
- What happens when a completely new, previously unseen hazard type value appears in a payload
  from a source registered for a different type — is this rejected as malformed, or accepted and
  flagged for admin review? (Default: rejected, since new hazard types are explicitly out of
  scope for this feature.)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a Tenant Admin to register a new data source with, at minimum:
  a name, an associated hazard type (from the existing supported set), an endpoint reference,
  a polling interval, and an active/inactive flag.
- **FR-002**: System MUST allow a Tenant Admin to edit an existing data source's configuration and
  to disable or re-enable it without deleting its configuration or historical data.
- **FR-003**: System MUST allow a Tenant Admin to permanently remove a data source's configuration;
  removal MUST stop future polling but MUST NOT delete events already ingested from that source.
- **FR-004**: System MUST track, for every configured data source, a current health state of
  `healthy`, `degraded`, `down`, or `disabled`, computed from recent fetch outcomes and the
  source's configured staleness threshold.
- **FR-005**: System MUST transition a source from `healthy` to `degraded` when its most recent
  fetch attempt failed or its data has exceeded the staleness threshold, and from `degraded` to
  `down` after a configurable number of consecutive failed fetch attempts.
- **FR-006**: System MUST transition a source to `disabled` only via explicit Tenant Admin action,
  and MUST NOT poll a `disabled` source until it is re-enabled.
- **FR-007**: System MUST record every health-state transition as an audit event capturing the
  source, prior state, new state, timestamp, and triggering reason (e.g., "3 consecutive
  failures", "manually disabled by [admin]").
- **FR-008**: System MUST present a health dashboard showing, for every configured source: current
  state, last successful fetch time, hazard type, and active/inactive flag, refreshed at least as
  often as the fastest-polling source's interval.
- **FR-009**: System MUST show a visible warning indicator on the dashboard for any source in
  `degraded` or `down` state.
- **FR-010**: System MUST validate every incoming record from a data source against the expected
  shape for its hazard type (required fields present, coordinate values within valid geographic
  range, numeric fields are numeric) before it is normalized or stored.
- **FR-011**: System MUST reject individual records that fail validation without rejecting other
  valid records received in the same fetch batch.
- **FR-012**: System MUST NOT persist a rejected record to the events store under any circumstance.
- **FR-013**: System MUST record every rejected record as an audit event capturing the source,
  timestamp, the specific validation failure reason, and enough of the offending payload to
  investigate the failure (without necessarily storing the full raw payload indefinitely).
- **FR-014**: System MUST allow an Auditor to query rejected-payload audit history filtered by
  source and/or date range.
- **FR-015**: System MUST continue polling and processing other sources normally when one source
  is in a `down` or `degraded` state (failure isolation — one broken source must not block others).
- **FR-016**: System MUST NOT require a code change or redeployment to add a new source of an
  already-supported hazard type, disable a source, or adjust a source's polling interval.

### Key Entities

- **Data Source**: A configured feed the system polls for hazard events. Attributes: name,
  hazard type, endpoint reference, polling interval, active/inactive flag, current health state,
  last successful fetch timestamp, consecutive-failure count.
- **Source State Transition (Audit Event)**: A record of a data source moving from one health
  state to another. Attributes: source reference, previous state, new state, timestamp, reason.
- **Rejected Payload (Audit Event)**: A record of an individual data record that failed validation
  and was not ingested. Attributes: source reference, timestamp, validation failure reason,
  reference/excerpt of the offending record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Tenant Admin can determine, within 10 seconds of opening the health dashboard,
  whether any data source requires attention (is degraded, down, or disabled) without consulting
  logs or external tools.
- **SC-002**: A newly registered data source of an already-supported hazard type begins
  delivering events to the system within one polling cycle of registration, with zero code
  changes required.
- **SC-003**: 100% of malformed or invalid records from any source are excluded from the events
  store — no malformed record ever reaches the map/UI.
- **SC-004**: An Auditor can reconstruct, for any given day, exactly which records were rejected
  and why, using only the system's audit history (no need for raw server/application logs).
- **SC-005**: A single misbehaving data source (returning errors, malformed data, or going
  offline) does not delay or block ingestion from any other configured source.
- **SC-006**: Time between a source going silent (no successful fetch) and that source's status
  visibly changing to degraded/down on the dashboard does not exceed 2 polling intervals for that
  source.

## Assumptions

- "Hazard type" for a newly registered source must be one of the types the system already
  supports (earthquake, wildfire, flood, drought, food_security); adding an entirely new hazard
  type is out of scope for this feature (tracked separately under Hazard & Taxonomy Management).
- The staleness threshold and consecutive-failure-to-`down` count are configurable per source but
  have reasonable system-wide defaults (e.g., staleness = 3× the source's own polling interval;
  3 consecutive failures = down) when not explicitly set by the admin.
- Only Tenant Admins can create, edit, disable, or remove data sources; Operators have read-only
  visibility into the health dashboard; Auditors have read-only access to state-transition and
  rejected-payload audit history. Exact role/permission enforcement follows the RBAC/ABAC model
  established for the rest of the system (Constitution Principle V) rather than introducing a new
  permission scheme specific to this feature.
- "Endpoint reference" is treated as an opaque configuration value (e.g., an API URL and any
  auth/query parameters it needs); this spec does not define a new external protocol (OGC WMS/WFS
  support is explicitly out of scope, per the feature description).
- Rejected-payload audit entries retain enough of the offending record to diagnose the issue, but
  are not required to retain unlimited raw payloads forever — exact retention duration follows
  whatever audit/log retention policy governs the rest of the system's audit trail.
- Recovery from `down`/`degraded` back to `healthy` happens automatically once fetches succeed
  again consistently; no manual admin action is required to "clear" a transient outage.
- Concurrent edits to the same data source's configuration follow last-write-wins (whichever
  update commits last takes effect); no optimistic-locking/conflict-detection UI is required for
  this feature, since simultaneous admin edits to the same source are expected to be rare.
- A source whose endpoint responds successfully but returns zero records is treated as `healthy`
  (a quiet feed is not itself a failure); it is only flagged as `degraded`/`down` if it *also*
  breaches its staleness threshold or consecutive-failure count, same as any other source.
