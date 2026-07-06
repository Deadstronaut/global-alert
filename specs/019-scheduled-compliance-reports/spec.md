# Feature Specification: Scheduled Compliance Reports

**Feature Branch**: `019-scheduled-compliance-reports`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Audit & Compliance modülünde kalan 'zamanlanmış raporlar' (scheduled compliance reports) boşluğunu kapatma — spec 007'nin audit_log görünürlüğü/export/hash-zinciri bütünlük doğrulamasını ekledikten sonra bilinçli olarak sonraya bıraktığı bir takip işi."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Super Admin reviews an automatically generated compliance report (Priority: P1)

Every week, without anyone needing to remember to run an export, a summary of the system's audit
activity for that period is automatically produced and made available to the Super Admin. The
Super Admin opens the Audit tab, sees a list of past reports, and reviews the most recent one to
confirm activity levels look normal and that the audit trail's integrity is intact for that period.

**Why this priority**: This is the entire point of the feature — today, compliance review only
happens if someone remembers to manually export and check, which is not a dependable compliance
practice. Automatic generation is the core value; without it, this feature has no reason to exist.

**Independent Test**: Wait for (or trigger) one scheduled report generation; log in as Super Admin,
open the Audit tab, and confirm a new report appears in the report list with a period and summary,
without any manual export action having been taken.

**Acceptance Scenarios**:

1. **Given** a week has elapsed since the last report, **When** the scheduled generation runs,
   **Then** a new report appears covering that period, with counts of audit activity broken down
   by action type and affected area, and a clear statement of whether the audit trail's integrity
   check passed or found a problem for that period.
2. **Given** the audit trail's integrity check finds a broken link during a report's period,
   **When** the Super Admin views that report, **Then** the report clearly flags the integrity
   problem rather than silently reporting only activity counts.
3. **Given** a period had zero audit activity, **When** the report for that period is generated,
   **Then** the report still appears (showing zero activity), rather than being silently skipped.

---

### User Story 2 - Super Admin downloads a past report for external record-keeping (Priority: P2)

A Super Admin needs to hand a specific week's compliance summary to an external auditor or keep it
in an offline archive. They find that report in the list and download it as a file.

**Why this priority**: Builds on User Story 1's value by making a report portable outside the
application, matching the existing manual audit-log export capability Super Admin already has
today — but the feature is still useful without this (Super Admin can still review reports on
screen), so it is P2, not P1.

**Independent Test**: From the report list, download a specific past report and confirm the
downloaded file's contents match what was shown on screen for that report.

**Acceptance Scenarios**:

1. **Given** a previously generated report is visible in the list, **When** the Super Admin
   chooses to download it, **Then** a file containing that report's period and summary data is
   produced, in a format consistent with the audit log's existing export options.

---

### Edge Cases

- What happens if audit activity is unusually high (e.g., a bulk import) during a report's period?
  The report simply reflects the true counts — no threshold-based alerting or anomaly detection is
  introduced by this feature.
- What happens if two report-generation runs somehow overlap or a run is retried? Generating a
  report for a period that already has one MUST NOT create a duplicate — the existing report for
  that period is left as-is.
- What happens if the automatic generation fails to run for a period (e.g. an outage)? The gap is
  simply visible as a missing report for that period in the list; no automatic backfill/catch-up
  generation is required by this feature.
- Who besides Super Admin can see these reports? No one — same restriction as today's manual audit
  log access.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically generate a compliance report on a regular, recurring
  schedule without requiring a person to initiate it.
- **FR-002**: Each report MUST cover a distinct, non-overlapping period and MUST be clearly
  labeled with the period it covers.
- **FR-003**: Each report MUST include a count of audit activity broken down by the type of action
  and the area of the system affected, for that report's period.
- **FR-004**: Each report MUST include the result of the existing audit trail integrity check,
  clearly stating whether the trail was intact or a problem was found, for that period.
- **FR-005**: System MUST NOT generate more than one report for the same period (idempotent
  generation).
- **FR-006**: System MUST generate a report for a period even if that period had zero audit
  activity (a report showing "no activity" is still a valid, complete report).
- **FR-007**: Only Super Admin MUST be able to view the list of generated reports or their
  contents — this MUST use the same access restriction already applied to manual audit log access.
- **FR-008**: Super Admin MUST be able to view a list of previously generated reports from within
  the existing Audit area of the admin panel.
- **FR-009**: Super Admin MUST be able to download any previously generated report as a file, in a
  format consistent with the existing manual audit log export options (structured data, not a
  fixed-layout document).

### Key Entities

- **Compliance Report**: Represents one automatically generated compliance summary for a single
  period. Attributes: period covered (start/end), a summary of audit activity for that period
  (counts by action type and affected area), the audit trail integrity result for that period, and
  when it was generated.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new compliance report becomes available on schedule every reporting period without
  any manual action, for 100% of elapsed periods during normal system operation.
- **SC-002**: Super Admin can locate and open the most recent report from the Audit area in under
  10 seconds.
- **SC-003**: Zero duplicate reports are ever produced for the same period, across any number of
  generation attempts.
- **SC-004**: 100% of downloaded reports contain data matching exactly what was displayed on screen
  for that report.

## Assumptions

- The reporting period is weekly and fixed for this feature; making the period configurable from
  the admin panel is explicitly out of scope for this iteration (a reasonable future enhancement,
  not required now).
- Reports are surfaced for on-screen review and manual download only; automatic delivery (e.g. via
  email) is out of scope — Super Admin already has to actively visit the Audit area to review
  audit activity today, and this feature does not change that expectation.
- Reports are structured data (consistent with the existing CSV/JSON export already available for
  the audit log), not a fixed-layout document (e.g. PDF) — matching a prior, already-documented
  decision in this module to keep PDF/formatted-document generation out of scope.
- This feature does not add any anomaly detection, thresholds, or alerting on top of the raw
  activity counts — it surfaces the same kind of information a manual export already would, just
  automatically and on a schedule.
- This feature depends on the system's existing scheduled-task mechanism (already used elsewhere in
  the project for other recurring background work) being available and configurable by whoever
  operates the deployed system.
