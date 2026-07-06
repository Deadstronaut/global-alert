# Feature Specification: Dissemination & Contact Directory

**Feature Branch**: `009-dissemination-dispatch`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Build the Dissemination module (SRS Module M7, docs/21_structured_srs.md §3.7). CAP alert authoring (spec 006) is complete — a cap_drafts table, an approval workflow, and CapView.vue exist — but an approved alert is not sent anywhere today; the system authors alerts but never distributes them. Scope, adapted from SRS §3.7's CRITICAL/HIGH-priority items to the existing Vue+Supabase architecture: (1) a Contact Directory of people/institutions with email, WhatsApp number, language preference, country/region, and per-channel opt-in/opt-out fields, managed via the same admin RBAC hierarchy as user provisioning (super_admin any country, country_admin/org_admin scoped to their own country/org), plus bulk CSV import reusing the existing file-import infrastructure; (2) automatic dispatch when a CAP draft's status becomes 'approved' — email to contacts matching the alert's hazard type and geographic scope (country_code/bounding box), with WhatsApp as a mock adapter in this phase (interface/queue only, no live Meta Cloud API integration); (3) a dispatch state machine — DispatchJob (QUEUED→RUNNING→COMPLETED/FAILED) and DispatchReceipt (QUEUED→SENT→DELIVERED/FAILED/BOUNCED) — where one channel/contact failure does not abort the whole batch, and failures can be retried, consistent with the existing data-source health state machine pattern (spec 001); (4) an unauthenticated Public Alert Portal listing active, non-expired approved alerts, consistent with the existing public/anon RLS pattern. Explicitly OUT of scope: SMS/cell-broadcast/mobile push/siren (already excluded by the constitution); public self-registration or double opt-in self-subscription (this project deliberately removed self-registration entirely — contacts are admin-added only, never self-service); community hazard reporting, NLP/LLM-based feedback categorization, and shelter management dashboards (present in the SRS but MEDIUM/LOW priority, targeted at a later iteration); real Meta WhatsApp Cloud API integration (only a mock adapter and webhook schema are built now, no live API keys/deployment). Users: Operator/Approver (triggers dispatch on CAP approval, monitors dispatch status), Tenant Admin/country_admin (manages the contact directory), Auditor (reviews dispatch/receipt logs), Public (views the portal, unauthenticated). Architecture constraints: Vue 3 + Pinia + Supabase (PostgreSQL + Deno Edge Functions), must stay consistent with the existing country/region RBAC scoping (spec 002) and the audit_log hash-chain (spec 007). Email is sent through a real provider (e.g. SendGrid/Resend) via an Edge Function, configured through an environment variable so the provider can be swapped."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic email dispatch on CAP broadcast (Priority: P1)

An Approver reviews and approves a CAP alert draft, then publishes it, in the existing CapView.vue workflow (draft → pending_approval → approved → **broadcast**). The moment the draft's status reaches `broadcast` — the point at which it is already publicly visible per the existing CAP policy — the system automatically identifies every contact whose country/region and hazard-type subscription match the alert, and sends them an email describing the hazard, severity, affected area, and a link to the Public Alert Portal, without any extra manual dispatch step.

**Why this priority**: This is the entire point of the module. Without it, CAP authoring (spec 006) produces alerts that never reach anyone — the warning pipeline is not actually a warning pipeline. Every other story in this spec is secondary to closing this gap.

**Independent Test**: Can be fully tested by seeding a handful of contacts across two countries with different hazard-type opt-ins, moving a CAP draft scoped to one of those countries and hazard types through to `broadcast`, and confirming only the matching contacts receive an email (verified via provider send logs and `dispatch_receipts` rows), while non-matching contacts receive nothing.

**Acceptance Scenarios**:

1. **Given** a CAP draft scoped to country X and hazard type "earthquake" reaches `broadcast`, **When** dispatch runs, **Then** every contact in country X who is opted into "earthquake" (or has no hazard-type filter) and has `email_opt_in = true` receives an email within a few minutes.
2. **Given** a contact has `email_opt_in = false`, **When** dispatch runs for a matching alert, **Then** that contact receives no email.
3. **Given** a CAP draft reaches `broadcast` with no matching contacts in scope, **When** dispatch runs, **Then** a `DispatchJob` is still created and marked `COMPLETED` with zero receipts, and this is visible to an Operator (not silently dropped).
4. **Given** the email provider rejects or times out for one contact, **When** dispatch continues, **Then** the remaining contacts in the batch still receive their email — one failure does not abort the batch.

---

### User Story 2 - Manage the contact directory (Priority: P1)

A Tenant Admin (country_admin/org_admin) opens a new "Contacts" admin screen and adds, edits, or deactivates contacts for their own country/organization: name, email, WhatsApp number, preferred language, country/region, and per-channel (email/WhatsApp) opt-in status. A super_admin can do the same for any country. Bulk onboarding is possible via CSV upload.

**Why this priority**: Dispatch (User Story 1) has nothing to send to without a populated, correctly-scoped contact directory. This is the data-entry prerequisite for the dispatch pipeline, and reuses RBAC/CSV patterns the project already has, so it is low-risk and high-value alongside Story 1.

**Independent Test**: Can be fully tested by logging in as a country_admin, adding a contact manually, then bulk-importing a CSV of contacts, and confirming both paths produce correctly-scoped, correctly-validated rows, while a country_admin from a different country cannot see or edit them.

**Acceptance Scenarios**:

1. **Given** a country_admin for country X, **When** they create a contact, **Then** the contact is saved with `country_code = X` regardless of what the form allows them to pick (server-enforced, same pattern as user provisioning).
2. **Given** a super_admin, **When** they create a contact, **Then** they may choose any country.
3. **Given** a CSV of contacts with valid and invalid rows (e.g., malformed email, missing required field), **When** it is imported, **Then** valid rows are inserted and invalid rows are reported individually with the reason, without blocking the valid rows.
4. **Given** a contact is deactivated (not hard-deleted), **When** a future dispatch runs, **Then** that contact is excluded, but their historical dispatch receipts remain intact.
5. **Given** a country_admin for country X, **When** they attempt to view or edit a contact belonging to country Y, **Then** access is denied.

---

### User Story 3 - Monitor dispatch status and retry failures (Priority: P2)

An Operator/Approver opens a "Dispatch" panel showing recent `DispatchJob`s (one per broadcast CAP alert) with their status, how many receipts were sent/delivered/failed/bounced, and can retry a job that has failed receipts, scoped the same way as everywhere else in this system: a super_admin sees every job, a country_admin/org_admin sees only jobs for their own country/organization.

**Why this priority**: Once dispatch exists (Story 1), operators need visibility that it actually worked — a warning system nobody can verify delivered is not trustworthy. This is important but strictly depends on Story 1 existing first.

**Independent Test**: Can be fully tested by triggering a dispatch with a mix of a valid and an intentionally-invalid contact (e.g., malformed email causing the provider to reject it), then confirming the panel shows the correct per-receipt outcome and that clicking "retry" re-attempts only the failed receipts.

**Acceptance Scenarios**:

1. **Given** a completed `DispatchJob`, **When** an Operator opens the Dispatch panel, **Then** they see the job's overall status and a per-channel breakdown of QUEUED/SENT/DELIVERED/FAILED/BOUNCED counts.
2. **Given** a `DispatchJob` has one or more `FAILED` receipts, **When** an Operator clicks retry, **Then** only the failed receipts are re-attempted (successful ones are not re-sent).
3. **Given** a `viewer` role (no dispatch-management access, consistent with every other admin surface in this system), **When** they attempt to open the Dispatch panel, **Then** access is denied — read access to dispatch history is not a separate "auditor" permission, it is the same super_admin/country_admin/org_admin scoping used everywhere else.

---

### User Story 4 - Public Alert Portal (Priority: P3)

Any visitor, without logging in, opens the Public Alert Portal and sees a list of currently active, non-expired, broadcast alerts with their headline, severity, affected area, and issue time.

**Why this priority**: This extends reach beyond the contact directory (Story 1-2) to anyone checking the portal directly, but it is not blocking — dispatch already reaches registered contacts without it. Lowest priority, natural to build last.

**Independent Test**: Can be fully tested by approving one alert with a future expiry and one with a past expiry, then confirming an unauthenticated visitor sees only the non-expired one.

**Acceptance Scenarios**:

1. **Given** a broadcast CAP alert with an expiry time in the future, **When** an unauthenticated visitor opens the portal, **Then** the alert is listed.
2. **Given** a broadcast CAP alert whose expiry time has passed, **When** the portal loads, **Then** the alert is not listed.
3. **Given** a CAP draft that has not yet reached `broadcast` (still draft/pending_approval/approved), **When** the portal loads, **Then** it is not listed regardless of expiry.

### Edge Cases

- What happens when a CAP alert reaches `broadcast` but has no geographic scope at all (e.g., malformed draft)? Dispatch MUST NOT default to "all contacts globally" — it should create a `DispatchJob` with zero matched contacts and flag this for operator attention, the same way as an empty-match scenario in Story 1.
- What happens if the email provider is unreachable/misconfigured entirely (not just one contact)? The `DispatchJob` MUST be marked `FAILED` (not silently stuck `RUNNING`), and this must be visible to Operators/Approvers in the Dispatch panel.
- What happens when the same CAP alert is broadcast, then later revoked/expired early? A previously-sent dispatch is not un-sent; this spec does not require a "recall" notification (out of scope — no existing mechanism for this in the SRS's CRITICAL/HIGH tier either).
- What happens when a contact has both channels opted out? They are simply excluded from every dispatch; this is not an error state.
- What happens when a CSV import contains a duplicate contact (same email, same country)? The import MUST reject the duplicate row with a clear reason rather than silently creating a second contact or silently overwriting the first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST maintain a contact directory with fields: full name, email, WhatsApp number (E.164 format), preferred language, country_code, region_code (optional), per-channel opt-in flags (email, WhatsApp), an optional hazard-type filter, and an active/inactive status.
- **FR-002**: System MUST enforce the same country/org-scoped RBAC on contact management as the existing user-provisioning hierarchy: super_admin manages contacts in any country; country_admin/org_admin only within their own country/organization, with country_code/org_id server-enforced regardless of client input.
- **FR-003**: System MUST support bulk contact import via CSV, validating each row independently (valid rows import; invalid rows are rejected individually with a reason, matching the existing file-import pattern), rejecting exact duplicate contacts (same email + country_code).
- **FR-004**: System MUST NOT hard-delete contacts on deactivation — deactivated contacts are excluded from future dispatch but historical dispatch receipts referencing them remain intact.
- **FR-005**: System MUST automatically create a `DispatchJob` whenever a CAP draft's status transitions to `broadcast`.
- **FR-006**: System MUST select dispatch recipients by matching the CAP alert's geographic scope (country_code and/or bounding box) and hazard type against each active, opted-in contact's country/region and hazard-type filter (a contact with no hazard-type filter matches all hazard types).
- **FR-007**: System MUST send email dispatches through a configurable, swappable email provider (selected via environment/configuration, not hardcoded to one vendor).
- **FR-008**: System MUST implement WhatsApp dispatch as a mock adapter in this phase — messages are queued and a `DispatchReceipt` is created and progressed through mock states, but no live third-party API call is made.
- **FR-009**: System MUST track dispatch progress via a `DispatchJob` state machine (QUEUED→RUNNING→COMPLETED/FAILED) and a per-recipient `DispatchReceipt` state machine (QUEUED→SENT→DELIVERED/FAILED/BOUNCED).
- **FR-010**: System MUST continue processing the remaining recipients in a batch when an individual recipient's send fails — a single failure MUST NOT abort the whole `DispatchJob`.
- **FR-011**: System MUST allow an Operator to retry only the `FAILED` receipts of a `DispatchJob`, without re-sending to recipients who already succeeded.
- **FR-012**: System MUST record every dispatch job and receipt, visible to Operators/Approvers scoped the same way as everywhere else in this system (super_admin: all; country_admin/org_admin: their own country/org only), consistent with the existing RBAC and audit logging pattern. This system has no separate "Auditor" role distinct from `super_admin`/`country_admin`/`org_admin` (see spec 007 precedent) — cross-tenant compliance review is a `super_admin` capability, not a fourth role.
- **FR-013**: System MUST provide an unauthenticated Public Alert Portal listing only CAP alerts that have reached `broadcast` and are not yet expired.
- **FR-014**: System MUST exclude alerts that have not reached `broadcast`, and expired alerts, from the Public Alert Portal.
- **FR-015**: System MUST NOT provide any public self-registration or self-subscription mechanism — contacts can only be created by an authorized admin (super_admin/country_admin/org_admin).
- **FR-016**: System MUST validate WhatsApp numbers in E.164 format before accepting them into the contact directory.

### Key Entities

- **Contact**: A person or institution that can receive dispatched alerts. Attributes: name, email, WhatsApp number, preferred language, country_code, region_code, per-channel opt-in flags, optional hazard-type filter, active/inactive status, owning org (for org_admin scoping).
- **DispatchJob**: One dispatch run triggered by a single CAP alert approval. Attributes: linked CAP alert, status (QUEUED/RUNNING/COMPLETED/FAILED), created/started/completed timestamps, total matched recipient count.
- **DispatchReceipt**: One per (DispatchJob, contact, channel) combination. Attributes: status (QUEUED/SENT/DELIVERED/FAILED/BOUNCED), channel (email/whatsapp), failure reason (if any), timestamps, retry count.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A broadcast CAP alert results in matching contacts receiving an email notification without any manual dispatch step by the approver.
- **SC-002**: A country_admin can onboard 100 contacts via a single CSV upload in under a minute, with per-row validation feedback.
- **SC-003**: A single contact's or channel's delivery failure never prevents the other 99%+ of a batch from being delivered.
- **SC-004**: An Operator can determine, within a few seconds of opening the Dispatch panel, whether a given alert's dispatch fully succeeded, partially failed, or is still in progress.
- **SC-005**: An unauthenticated visitor can see all currently active alerts on the Public Alert Portal without creating an account.
- **SC-006**: Zero contacts can be created, viewed, or edited outside of their owning country/organization scope by a non-super_admin.

## Assumptions

- The transactional email provider account and API key (Resend or SendGrid) are **customer-owned, not platform-provisioned** — each country runs its own email sending (its own NMHS/ministry mail infrastructure or commercial account), the same way each country's data sources are its own, not shared. Provisioning that key is a `country_admin`/customer onboarding step, out of scope for this implementation; until it's configured, dispatch fails visibly (`dispatch_jobs.status = 'failed'`) rather than silently.
- "Real" WhatsApp delivery is explicitly deferred; the mock adapter's job is to prove out the state machine, receipt tracking, and UI so a live Meta Cloud API integration can be swapped in later without redesigning the dispatch pipeline.
- Existing CAP draft records (spec 006) already carry enough geographic scope (country_code and/or bounding box) and hazard type to drive recipient matching; no changes to the CAP authoring form are required by this spec.
- Dispatch runs asynchronously relative to the approval action (the Approver is not blocked waiting for every email to send before the UI responds).
- A "few minutes" dispatch latency (Story 1) is acceptable for this phase; this is not modeled as a hard real-time SLA the way M3 ingestion polling is.
