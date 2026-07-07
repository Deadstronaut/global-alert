# Feature Specification: Incident Timeline Playback & Annual Incident Reports

**Feature Branch**: `026-incident-timeline-reports`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Incident Tracking modülünün kalan kalemlerinden ikisi: (1) timeline playback, (2) otomatik/yıllık rapor üretimi (false-alarm-rate metriği dahil)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anyone who can view an incident can see its full history (Priority: P1)

An admin or viewer looking at an incident wants to understand how it evolved over time — when it
was opened, when it moved between states, what notes were added — without needing to ask a Super
Admin to pull raw audit records for them.

**Why this priority**: This is the direct, immediately usable value the project owner asked for
("timeline playback") — it turns an incident's existing hidden history (already recorded, just
inaccessible to the roles who most need it) into something anyone with legitimate access to that
incident can actually see.

**Independent Test**: Open any incident that has changed state at least once, request its
timeline, and confirm every state change appears in chronological order with a timestamp and who
made it. Can be tested independently of User Story 2 — it needs no report to exist.

**Acceptance Scenarios**:

1. **Given** an incident that has moved through multiple states (e.g. open → in_progress →
   monitoring → closed), **When** an authorized user requests its timeline, **Then** they see each
   transition in chronological order with a timestamp and who made the change.
2. **Given** a brand-new incident that has never changed state, **When** its timeline is
   requested, **Then** only its creation event is shown (not an empty or broken view).
3. **Given** a user who has no legitimate access to a given incident (e.g. a different country),
   **When** they attempt to request that incident's timeline, **Then** the request is rejected —
   timeline access must never be broader than the user's existing access to the incident itself.
4. **Given** a Viewer-role user who can already see a given incident on the incident list, **When**
   they request that incident's timeline, **Then** they can see it too (timeline visibility must
   not be more restrictive than incident visibility).

---

### User Story 2 - Super Admin reviews yearly incident statistics automatically (Priority: P2)

A Super Admin wants a yearly summary of incident activity — how many incidents occurred, their
severity/hazard-type breakdown, how long they typically stayed open, and what fraction turned out
to be false alarms — generated automatically rather than compiled by hand.

**Why this priority**: Delivers the "otomatik/yıllık rapor üretimi" (automated annual report)
value and the false-alarm-rate metric together, but depends on a full year of incident data to be
meaningful, making it naturally a slower-cadence, secondary priority compared to the always-useful
timeline feature.

**Independent Test**: Confirm a yearly report is generated automatically at year-end (or trigger
one for a completed period) and that it lists total incidents, their breakdowns, average
time-to-close, and a false-alarm rate — verifiable independently of User Story 1.

**Acceptance Scenarios**:

1. **Given** a full calendar year of incident activity has passed, **When** the automatic yearly
   report runs, **Then** a report is produced summarizing that year's incident count, severity/
   hazard-type breakdown, and average time-to-close for closed incidents.
2. **Given** some incidents in the reporting period were linked to an alert that was ultimately
   marked as a false alarm, **When** the yearly report is generated, **Then** it includes the
   percentage of incidents that were false alarms.
3. **Given** a reporting period for which a report has already been generated, **When** report
   generation is attempted again for that same period, **Then** no duplicate report is created.
4. **Given** a non-Super-Admin user, **When** they attempt to view yearly incident reports,
   **Then** access is denied — this report is Super-Admin-only, matching the existing compliance
   report's visibility rule.

---

### Edge Cases

- What happens when an incident has no closed/archived instances in the reporting period (only
  still-open ones)? Average time-to-close is computed only from incidents that actually closed
  within (or before) the period — an all-still-open period yields "no data" for that metric rather
  than a misleading zero.
- What happens when an incident isn't linked to any CAP alert at all? It's simply excluded from the
  false-alarm-rate calculation's denominator in a way that doesn't misrepresent the rate (only
  incidents with a determinable outcome — linked and resolved one way or another — count toward
  the rate).
- What happens when a user requests a timeline for an incident ID that doesn't exist at all?
  Treated the same as "no access" (an empty/rejected result), not a system error — this avoids
  leaking information about which incident IDs exist.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST let any user who can already view a given incident also view that
  incident's chronological history of changes.
- **FR-002**: System MUST NOT let any user view the timeline of an incident they cannot otherwise
  view — timeline access rules must exactly mirror incident-viewing access rules, no broader and
  no narrower.
- **FR-003**: Each timeline entry MUST show what changed, when it changed, and who made the
  change.
- **FR-004**: System MUST automatically produce one incident summary report per completed calendar
  year, without requiring a Super Admin to manually trigger it.
- **FR-005**: Each yearly report MUST include: total incident count, breakdown by severity and by
  hazard type, average time-to-close for incidents that closed within the period, and the
  false-alarm rate for the period.
- **FR-006**: System MUST NOT produce more than one report for the same reporting period.
- **FR-007**: Only a Super Admin MUST be able to view yearly incident reports — matching this
  project's existing rule for the compliance-report equivalent.
- **FR-008**: This feature MUST NOT alter how incidents are created, transitioned, or otherwise
  managed today — it only adds visibility into history and periodic reporting on top of existing
  data.

### Key Entities

- **Incident Timeline Entry** (derived, not newly stored): One historical change to a specific
  incident — what changed, when, and by whom. Reconstructed from data already recorded elsewhere;
  not a new persistent record type.
- **Incident Report**: A yearly summary of incident activity for a specific calendar-year period —
  totals, breakdowns, average time-to-close, and false-alarm rate. One per completed year, visible
  only to Super Admins.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Any user who can already see an incident can retrieve its full history within a
  single request, with no need to contact a Super Admin or export raw logs.
- **SC-002**: 100% of timeline-access attempts for incidents the requester cannot otherwise view
  are rejected.
- **SC-003**: A Super Admin can see the prior calendar year's total incidents, severity/hazard
  breakdown, average time-to-close, and false-alarm rate without performing any manual
  calculation.
- **SC-004**: No calendar year ever has more than one generated report, even if generation is
  attempted more than once for that year.

## Assumptions

- "Timeline" means a chronological reconstruction of an incident's recorded state/field changes —
  not a live map-based replay or animation (out of scope, YAGNI); a simple ordered list is
  sufficient to deliver the requested value.
- The false-alarm rate is defined as: among incidents linked to a CAP alert that reached a final
  outcome, the percentage where that alert was ultimately marked a false alarm. Incidents with no
  linked CAP alert are not part of this specific rate's calculation (there's no alert outcome to
  judge them against).
- The reporting period is a fixed calendar year (January 1 to December 31), consistent with this
  project's existing precedent of a fixed, non-configurable period for its other automated report
  (the weekly compliance report) — configurable periods are out of scope.
- Yearly incident reports are Super-Admin-only, matching the exact visibility rule already
  established for the existing compliance report — this is not a new access-control decision, just
  reuse of an existing one.
- No changes are made to how incidents themselves are created, transitioned, or displayed in their
  primary list view beyond adding a way to view their history — this spec adds visibility, not new
  incident-management behavior.
