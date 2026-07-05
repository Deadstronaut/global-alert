# Feature Specification: Audit & Compliance Viewer

**Feature Branch**: `007-audit-compliance`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Build the Audit & Compliance module (SRS Module M9). The platform already has an append-only `audit_log` table (spec 004) with a `log_table_change()` trigger wired to `profiles`, `organizations`, `cap_drafts`, and `mfa_recovery_codes`, but no user-facing way to browse, filter, export, or verify the integrity of these records — there is no dedicated Audit & Compliance admin screen today (only a narrow per-data-source audit panel in AdminView.vue, spec 001, which is a different table). Scope, informed by SRS Module M9 requirements FR-0046 (immutable log of config/threshold changes — already satisfied by the existing trigger), FR-0047 (export audit logs in structured formats), FR-0048 (verify audit log integrity using cryptographic checksums, ideally a hash chain), FR-0151 (periodic review access for auditors/reviewers), and FR-0318/FR-0328 (log privileged access/role changes — already satisfied by the existing trigger covering profiles): (1) a super_admin-only Audit & Compliance admin screen to browse/filter audit_log entries by table, acting user, action type, and date range, with pagination; (2) CSV/JSON export of the currently filtered result set; (3) upgrade the existing per-row `checksum` (a self-contained hash of that row's own fields) to a genuine hash chain (each new row's hash also depends on the previous row's hash), plus an integrity-verification function/action that recomputes the chain and reports the first row where it breaks, if any; (4) a per-record audit-history view (which country_admin/org_admin/records already touch, but generalized beyond the CAP-specific and per-source-specific views that exist today) showing the full history of a single row (e.g., a specific profile or cap_draft) across its lifetime. Explicitly OUT of scope: PDF evidence-package generation, integration with external object storage (MinIO/S3 — not part of this project's stack per constitution Principle VIII), scheduled/automated periodic compliance report generation, and any AI/LLM-output-specific audit fields (SRS's MHEWS-SD-LLM-04 etc. — this platform has no AI/ML pipeline yet, that is a separate not-yet-built 'Forecasting/AI' roadmap module)."

## Clarifications

### Session 2026-07-06

- Q: What bounded maximum row count should cap an unfiltered/large export (FR-005)? → A: 5,000 rows — balances covering realistic compliance-review windows (e.g., a 90-day filtered export) against staying responsive on lower-end client machines generating the CSV/JSON in-browser.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and filter the audit trail (Priority: P1)

A super_admin needs to investigate a recent configuration change or user complaint. They open the new Audit & Compliance screen, filter by table name, acting user, action type, and/or a date range, and see a paginated, chronological list of matching audit entries with before/after values.

**Why this priority**: Without any way to browse `audit_log`, the table's entire value (compliance, incident investigation, accountability) is inert — data is recorded but functionally invisible. This is the foundational capability every other story builds on.

**Independent Test**: Can be fully tested by logging in as super_admin, applying each filter individually and in combination, and confirming the result set matches what raw SQL against `audit_log` would return.

**Acceptance Scenarios**:

1. **Given** audit entries exist across multiple tables, **When** a super_admin filters by table name, **Then** only entries for that table are shown.
2. **Given** audit entries exist from multiple users, **When** a super_admin filters by acting user, **Then** only that user's entries are shown.
3. **Given** a super_admin sets a date range, **When** the filter is applied, **Then** only entries within that range are shown.
4. **Given** more entries exist than fit on one page, **When** a super_admin scrolls/pages through results, **Then** all matching entries are eventually reachable without duplicates or gaps.
5. **Given** a non-super_admin user (country_admin/org_admin/viewer), **When** they attempt to access the Audit & Compliance screen, **Then** access is denied, consistent with the existing `super_admin_read_audit` RLS policy.

---

### User Story 2 - Export filtered audit results (Priority: P2)

A super_admin preparing a compliance report applies filters (e.g., all role changes in the last 90 days) and exports the current result set as a CSV or JSON file for external review.

**Why this priority**: Valuable for compliance workflows but not required for the core investigative use case (Story 1) to deliver value — export is a convenience layered on top of browsing.

**Independent Test**: Can be fully tested by applying a filter, triggering export, and confirming the downloaded file's contents exactly match the filtered on-screen result set.

**Acceptance Scenarios**:

1. **Given** a filtered result set, **When** a super_admin exports as CSV, **Then** a CSV file downloads containing exactly the filtered rows with all audit fields as columns.
2. **Given** a filtered result set, **When** a super_admin exports as JSON, **Then** a JSON file downloads containing exactly the filtered rows.
3. **Given** no filters are applied, **When** export is triggered, **Then** the export is capped at a bounded maximum (to prevent an accidental full-table dump) and the user is informed the export was capped.

---

### User Story 3 - Verify audit log integrity (Priority: P2)

A super_admin (or an external auditor working with them) wants assurance that no audit entry has been tampered with or deleted out of band (e.g., via direct database access bypassing the RLS-enforced application layer). They run an integrity check, which recomputes the hash chain across all entries and reports either "intact" or the exact point where the chain breaks.

**Why this priority**: This is the compliance/trust-establishing capability (SRS FR-0048), but it is a periodic verification action, not something needed for day-to-day browsing (Story 1) to be useful.

**Independent Test**: Can be fully tested by running the integrity check against a known-good chain (reports intact), then directly modifying one row's stored data via a test-only path and re-running the check (reports the break at that row).

**Acceptance Scenarios**:

1. **Given** an unmodified audit log, **When** a super_admin runs the integrity check, **Then** the result reports the chain is intact.
2. **Given** an audit log where one row's data was altered after insertion (bypassing normal application writes), **When** a super_admin runs the integrity check, **Then** the result identifies the first row where the recomputed hash no longer matches the stored chain hash.
3. **Given** the audit log is large, **When** the integrity check runs, **Then** it completes within a reasonable time for a compliance workflow (not required to be instant, but must not time out on realistic data volumes for this platform's scale).

---

### User Story 4 - View a single record's full audit history (Priority: P3)

A super_admin investigating a specific profile, CAP draft, organization, or other audited row wants to see every change ever made to that exact record, in order, in one place.

**Why this priority**: Useful for deep investigation of a specific entity, but Story 1's general browse/filter (which already supports filtering by table + can be combined with searching) covers most needs; a dedicated single-record view is a refinement, not foundational.

**Independent Test**: Can be fully tested by making several changes to one record (e.g., a profile's role, then its suspension status) and confirming the single-record view shows all of them in chronological order with correct before/after values.

**Acceptance Scenarios**:

1. **Given** a specific table name and record ID, **When** a super_admin requests that record's history, **Then** every audit_log entry for that exact table+record_id combination is shown in chronological order.

---

### Edge Cases

- What happens when a filter combination matches zero entries? The screen shows a clear "no matching entries" state rather than an empty-looking blank area.
- What happens if the audit log is empty (fresh deployment)? The screen shows an empty state, not an error.
- What happens when the integrity check encounters a row inserted before the hash-chain column existed (i.e., historical rows from before this feature)? Those rows are treated as the chain's starting point (genesis) rather than flagged as broken — the chain only needs to be provably intact from the point this feature was deployed onward; retroactively chaining pre-existing rows is not required since their original chain-free checksums remain valid evidence of their own content.
- What happens if two rows are inserted at the exact same instant (concurrent writes)? The chain is ordered by insertion sequence (a monotonic identifier), not wall-clock time, so ordering remains deterministic even under concurrent writes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a super_admin-only screen for browsing `audit_log` entries, restricted by the existing `super_admin_read_audit` RLS policy (no new role logic needed for read access).
- **FR-002**: System MUST allow filtering the browse view by table name, acting user, action type, and a date range, individually or in any combination.
- **FR-003**: System MUST paginate results rather than loading the entire table at once.
- **FR-004**: System MUST allow exporting the currently filtered result set as CSV or JSON.
- **FR-005**: System MUST cap any export at 5,000 rows maximum and inform the user when a cap was applied (i.e., more matching rows existed than were exported), rather than allowing an unbounded full-table export.
- **FR-006**: System MUST extend `audit_log` with a hash-chain mechanism: each newly inserted row's chain hash MUST be computed from (at minimum) its own content and the immediately preceding row's chain hash, using SHA-256.
- **FR-007**: System MUST provide an integrity-verification action that recomputes the hash chain from a given starting point and reports either "intact" or the specific row at which the recomputed hash first diverges from the stored value.
- **FR-008**: System MUST treat audit rows inserted before the hash-chain feature existed as valid without retroactively computing a chain for them (Edge Cases).
- **FR-009**: System MUST provide a way to view all `audit_log` entries for one specific table+record_id combination, in chronological order.
- **FR-010**: System MUST NOT alter the existing append-only guarantee — the `no_update_audit`/`no_delete_audit` RLS policies remain unchanged, and the new hash-chain column is populated only at insert time, never updated afterward.
- **FR-011**: System MUST present all new UI text through the existing i18n system, with translations for all 7 supported locales (tr/en/es/fr/ru/ar/zh).

### Key Entities

- **Audit Log Entry (`audit_log`, existing table)**: One immutable record of a significant system action. Existing attributes: action, table_name, record_id, old_data, new_data, changed_by, ip_address, user_agent, checksum (self-contained, unchanged), created_at. New attribute: chain_hash (SHA-256 of this row's content plus the previous row's chain_hash), populated at insert time only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A super_admin can locate a specific known audit event (by table, user, and approximate date) in under 1 minute using the filter screen.
- **SC-002**: 100% of exported rows in a CSV/JSON export exactly match the on-screen filtered result set, with no omissions or extras.
- **SC-003**: An integrity check against an untampered log always reports "intact"; an integrity check against a log with one altered row always identifies that exact row.
- **SC-004**: Non-super_admin roles cannot access the Audit & Compliance screen or its data, verified by attempting access as each other role.
- **SC-005**: All Audit & Compliance UI text renders correctly in all 7 supported locales.

## Assumptions

- "Reasonable time" for the integrity check (User Story 3) is scoped to this platform's realistic audit-log volume (a single/few-country deployment, not a multi-million-row global log); no specific SLA number is set in this spec, following this project's existing pattern of not inventing precise performance numbers without a stated target.
- Evidence-package generation (ZIP/PDF with CAP XML + receipts + audit entries, SRS FR-0045/MHEWS-SD-STORE-04) and any object-storage integration are explicitly out of scope, per Constitution Principle VIII (no new services/storage systems without a documented amendment) — CSV/JSON export (FR-004) is the in-scope substitute for "structured export" per FR-0047.
- Automated/scheduled periodic compliance report generation (SRS FR-0070) is out of scope for this spec — this feature provides on-demand browsing/export/verification only; scheduling could be a future spec if a real operator need arises.
- AI/LLM-output-specific audit fields (model_id, prompt_hash, etc.) are out of scope since this platform has no AI/ML pipeline yet (tracked separately as the not-yet-started "Forecasting / AI" roadmap module).
- The hash-chain mechanism (FR-006) is additive to the existing per-row `checksum` column — that column is unchanged; `chain_hash` is a new, separate column, avoiding any risk to existing rows or existing consumers of `checksum`.
