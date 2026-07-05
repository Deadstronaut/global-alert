# Feature Specification: CAP Alert Authoring

**Feature Branch**: `006-cap-alert-authoring`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Add Alert Authoring / CAP (Common Alerting Protocol) drafting workflow to the platform. Context: this is a GEWS/MHEWS disaster early-warning platform (Vue 3 + Supabase) that already ingests hazard events from external sources (GDACS, USGS, NASA FIRMS, etc. — spec 001/002/003) and displays them on a map. There is currently no way for an authorized human (country_admin/org_admin/super_admin role, per spec 004's RBAC) to author, review, and issue an official CAP-formatted alert message in response to a detected or emerging hazard. Scope: (1) a `cap_drafts` Supabase table storing CAP 1.2-aligned fields (identifier, sender, sent, status, msgType, scope, info blocks with category/event/urgency/severity/certainty/headline/description/instruction/area), (2) a state machine for draft lifecycle: draft → review → approved → issued (and archived/cancelled variants — reuse the state-machine pattern already established for data_sources in spec 001), (3) a Vue form UI for composing a CAP alert, allowing selection of an existing detected hazard event as the basis for a new draft (pre-filling area/severity/category from the source event) or starting a blank draft, (4) role-gated approval step consistent with spec 004's RBAC (e.g. org_admin drafts, country_admin or super_admin approves/issues — exact hierarchy to be clarified), (5) audit trail via the existing audit_log table/log_table_change() trigger (spec 004 pattern), (6) i18n from the start for all new UI text across the existing 7 locales (tr/en/es/fr/ru/ar/zh), per constitution Principle VI. Explicitly OUT of scope for this spec: actual dissemination/transmission of the issued CAP alert to external channels (email/WhatsApp/web push) — that is a separate 'Dissemination' module already tracked separately in the roadmap; this spec only covers authoring, review, approval, and marking a draft as 'issued' (i.e., producing the final CAP XML/JSON payload and audit record), not sending it anywhere."

## Clarifications

### Session 2026-07-06

- Q: Should a country_admin (or super_admin) be allowed to approve a CAP draft they authored themselves, or must a different reviewer approve it? → A: Four-eyes principle — a user MUST NOT approve/reject their own draft; a different country_admin or super_admin must act on it.
- Q: Should the viewer role see drafts in every lifecycle status (draft/pending_approval/approved), or only finalized/broadcast alerts? → A: Viewer sees only `broadcast` (issued) alerts; draft/pending_approval/approved statuses are visible only to org_admin/country_admin/super_admin per their existing scope. (Note: chain-of-command notification/dispatch of personnel to respond to a hazard — raised during clarification — is out of scope here and belongs to the separate, not-yet-started "Incident Tracking" roadmap module.)
- Q: A `cap_drafts` table, RLS, audit trigger, and a working `CapView.vue` UI were discovered to already exist in the codebase (predating this spec, at `/alerts/cap`), with different status names than initially assumed (`draft`/`pending_approval`/`approved`/`broadcast`/`rejected`/`cancelled`/`expired`/`false_alarm`/`all_clear` — no `review`/`issued`/`archived`). It is not known whether this feature currently holds real production data. → A: Treat this as a hardening/completion effort on the existing feature, not a greenfield build. Keep all existing status names and the existing `cap_drafts` schema as-is (no renaming/dropping columns or values, to avoid risk to any data that may already exist); add new capability only additively (new columns, new RLS scoping, new transitions, i18n, four-eyes enforcement, source-event pre-fill). This spec's requirements below have been rewritten against the real schema.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Draft a CAP alert from a detected hazard (Priority: P1)

An org_admin sees a newly detected earthquake on the map and needs to issue an official warning. They open the alert authoring tool, select the detected event as the basis for a new draft, and the form pre-fills area, hazard type, and a suggested severity from the source event. They edit the title, description, and instructions in their own words, save the draft, and submit it for approval.

**Why this priority**: This is the core value of the feature. The ability to create a draft already exists (blank-form only); the new value here is linking a draft to a real detected hazard so drafters don't retype what the system already knows.

**Independent Test**: Can be fully tested by logging in as org_admin, selecting a detected hazard event, confirming pre-filled fields, and saving a draft with status `draft` — delivers the ability to start an official alert from real data without touching approval or issuance.

**Acceptance Scenarios**:

1. **Given** a detected hazard event exists on the map, **When** an org_admin chooses "Create alert from this event," **Then** a new CAP draft is created with area, hazard type, and severity pre-filled from the source event, and status `draft`.
2. **Given** an org_admin is composing a draft, **When** they leave a required CAP field (title, severity, certainty, urgency) empty and attempt to submit for approval, **Then** the system blocks submission and identifies the missing field(s).
3. **Given** an org_admin wants to author an alert with no detected event as a basis, **When** they choose "Start blank draft," **Then** they can manually enter all CAP fields from scratch (existing behavior, unchanged).

---

### User Story 2 - Review and approve a draft (Priority: P1)

A country_admin (or super_admin) reviews drafts submitted by org_admins in their scope, checks the CAP fields for accuracy, and either approves the draft (advancing it toward broadcast) or rejects it with a reason, allowing the org_admin to revise and resubmit.

**Why this priority**: The existing implementation lets any org_admin/country_admin/super_admin move a draft through every state — including approving their own draft — with no separation of duties. Closing that gap is the most safety-critical change in this spec, equally foundational to Story 1.

**Independent Test**: Can be fully tested by submitting a draft for approval as org_admin (User A), then logging in as a different country_admin (User B) and approving or rejecting it — delivers the core safety control of the feature independent of broadcast mechanics.

**Acceptance Scenarios**:

1. **Given** a draft has status `pending_approval` and is within a country_admin's country scope, **When** a *different* country_admin/super_admin approves it, **Then** the draft's status changes to `approved` and the action is recorded in the audit trail.
2. **Given** a draft has status `pending_approval`, **When** a different reviewer rejects it with a reason, **Then** the draft's status changes to `rejected`, the reason is visible to the original author, and the original author can revise and resubmit it (transition `rejected` → `draft`), and the action is recorded in the audit trail.
3. **Given** an org_admin authored a draft, **When** they view their own draft, **Then** they can see its current status and, if rejected, the reviewer's reason.
4. **Given** a country_admin is scoped to Country A, **When** they attempt to review a draft belonging to Country B, **Then** the system denies access consistent with spec 004's country-scoped RLS (existing behavior, unchanged).
5. **Given** a user authored or last edited a draft themselves, **When** they attempt to approve or reject that same draft, **Then** the system denies the action per the four-eyes rule, even though their role would otherwise permit approval.

---

### User Story 3 - Broadcast an approved alert (Priority: P2)

A country_admin or super_admin takes an `approved` draft and marks it `broadcast`, which finalizes the CAP payload (locking its content) and produces the official CAP-formatted record for downstream use by the (separate, out-of-scope) dissemination module.

**Why this priority**: Broadcasting is the natural conclusion of the workflow, but the platform delivers safety value the moment review/approval exists (P1); finalizing the record for downstream consumption is the next increment, not a blocker to the MVP. The existing implementation already allows this transition but does not lock the record afterward.

**Independent Test**: Can be fully tested by approving a draft (per Story 2) and then marking it `broadcast` — delivers a finalized, immutable CAP record independent of any actual transmission integration.

**Acceptance Scenarios**:

1. **Given** a draft has status `approved`, **When** an authorized user marks it `broadcast`, **Then** its CAP content fields become read-only (new behavior — currently editable indefinitely).
2. **Given** a draft has status `broadcast`, **When** any user attempts to edit its CAP fields, **Then** the system blocks the edit.
3. **Given** a `broadcast` alert needs to be retracted, **When** an authorized user cancels it, **Then** its status changes to `cancelled` (existing transition, unchanged) and the cancellation is recorded in the audit trail with a reason.

---

### User Story 4 - Discard a draft (Priority: P3)

An org_admin or reviewer can cancel a draft that is no longer relevant (e.g., the underlying hazard resolved before an alert was needed), removing it from active workflows while preserving it for audit history.

**Why this priority**: Useful for keeping the workflow queue clean, but the platform is fully functional for its primary purpose without it. The `cancelled` transition from `draft`/`pending_approval` already exists; this story only adds a visible reason field for it.

**Independent Test**: Can be fully tested by creating a draft and cancelling it with a reason — delivers workflow-queue hygiene independent of the approval/broadcast path.

**Acceptance Scenarios**:

1. **Given** a draft has status `draft` or `pending_approval`, **When** its author or an authorized reviewer cancels it, **Then** its status changes to `cancelled` with a recorded reason, and it no longer appears in active queues but remains visible in history/audit views (existing transition, now with a mandatory reason).

---

### Edge Cases

- What happens when the source hazard event used to pre-fill a draft is later updated or removed from the map? The draft is a snapshot at creation time and is NOT automatically updated — the drafter must manually revise fields if they want to reflect new information.
- How does the system handle two reviewers attempting to approve/reject the same draft simultaneously? The second action to arrive is rejected with a "draft is no longer pending approval" error (optimistic concurrency via status check), preventing double-processing.
- What happens if an org_admin tries to submit a draft for approval outside their own country/org scope? Denied, consistent with spec 004's scoped RLS — org_admins may only author drafts within their own org/country scope.
- What happens to a rejected draft's revision history? Each rejection reason is preserved in the audit trail; the draft itself is edited in place (not versioned) once returned to `draft` status.
- What happens to existing rows already in the `cap_drafts` table (e.g., prior `approved`/`broadcast` drafts authored and approved by the same user, before four-eyes was enforced)? They are left as-is — the four-eyes rule only gates *new* status transitions going forward, it does not retroactively invalidate historical records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users with org_admin, country_admin, or super_admin roles to create a new CAP draft, either pre-filled from an existing detected hazard event or started blank (blank-form path already exists and is unchanged).
- **FR-002**: System MUST continue to store each draft in the existing `cap_drafts` schema (hazard_type, severity, certainty, urgency, title, description, instructions, area_desc/area_polygon/lat/lng/radius_km, effective_at/expires_at, lang/translations, status, supersedes_id, dedup_hash, created_by/approved_by, country_code/org_id). New capability MUST be added via additive columns, not by renaming or removing existing ones.
- **FR-003**: System MUST continue to enforce the existing draft lifecycle state machine with states `draft` → `pending_approval` → `approved` → `broadcast`, plus `rejected`, `cancelled`, `expired`, `false_alarm`, `all_clear` as further states, and MUST add one new transition: `rejected` → `draft` (allowing the original author to revise and resubmit a rejected draft). Direct transitions that skip required states (e.g., `draft` straight to `broadcast`) MUST continue to be rejected.
- **FR-004**: System MUST require all CAP-mandatory fields (title, description, instructions, area_desc, severity, certainty, urgency, hazard_type) to be populated before a draft can move from `draft` to `pending_approval`.
- **FR-005**: System MUST restrict drafting to org_admin, country_admin, and super_admin roles (existing behavior, unchanged); viewer role MUST NOT be able to create or edit drafts, and MUST NOT see drafts in `draft`, `pending_approval`, or `approved` status — viewer visibility is narrowed to `broadcast` (and its terminal follow-on states `false_alarm`/`all_clear`/`expired`) only. This narrows the existing RLS policy, which currently also exposes `approved` drafts to viewers.
- **FR-006**: System MUST restrict approval/rejection of a draft (transition from `pending_approval`) to country_admin or super_admin roles, and MUST add a four-eyes rule: the user who authored (created or last edited) the draft MUST NOT be the same user who approves or rejects it, even if that user holds country_admin or super_admin role. This is a new restriction — the existing implementation currently allows self-approval.
- **FR-007**: System MUST restrict the `approved` → `broadcast` transition to country_admin or super_admin roles (existing behavior, unchanged).
- **FR-008**: System MUST continue to scope org_admin visibility/authorship to their own org_id and country_admin visibility to their own country_code (already implemented via the existing `org_admin_cap_own`/`country_admin_cap_own` RLS policies, spec 004); this spec makes no changes to that scoping, only to the four-eyes approval rule layered on top of it.
- **FR-009**: System MUST continue to record every state transition (create, submit, approve, reject, broadcast, cancel) in the existing `audit_log` table via the existing `log_table_change()` trigger (already wired to `cap_drafts` — no new trigger needed), including which user performed the action.
- **FR-010**: System MUST make a `broadcast` draft's CAP content fields read-only at the database level (new: currently editable indefinitely after broadcast); further changes require a new draft rather than mutating the broadcast record.
- **FR-011**: System MUST require a reason when cancelling a draft (new: `cancelled` transition currently has no reason field) and MUST make that reason visible in the draft's history/audit view.
- **FR-012**: System MUST present all CAP authoring UI text (currently hardcoded Turkish in `CapView.vue`) through the existing i18n system, with translations provided for all 7 supported locales (tr/en/es/fr/ru/ar/zh).
- **FR-013**: System MUST NOT transmit or disseminate a `broadcast` alert to any external channel (email, WhatsApp, web push, SMS) as part of this feature — marking a draft `broadcast` finalizes a record only; actual delivery is a separate, out-of-scope module (existing behavior, unchanged — no dissemination integration exists today either).
- **FR-014**: System MUST reject a status-changing action (approve/reject/broadcast/cancel) on a draft whose current status no longer matches the expected pre-transition status (e.g., two reviewers acting on the same `pending_approval` draft simultaneously), returning a clear conflict error rather than silently succeeding twice. This is a new guard — the existing implementation performs an unconditional `UPDATE ... WHERE id = draft.id` with no status precondition.

### Key Entities

- **CAP Draft (`cap_drafts`, existing table)**: Represents one alert message through its lifecycle. Key attributes: hazard_type, severity, certainty, urgency, title, description, instructions, area (desc/polygon/lat/lng/radius), effective/expires window, lang/translations, status (draft/pending_approval/approved/broadcast/rejected/cancelled/expired/false_alarm/all_clear), supersedes_id (chain of updates), dedup_hash, created_by/approved_by, country_code, org_id (already present but not yet used for RLS scoping — this spec adds that usage).
- **Source Hazard Event**: An existing detected-event record (from spec 001/002/003's ingestion pipeline) that may be referenced by a CAP draft as the basis for pre-filled fields. Read-only from this feature's perspective — no new fields added to it. Not currently linked to `cap_drafts` — this spec adds a reference column.
- **Audit Log Entry**: An existing entity (spec 004) recording each CAP draft state transition — who performed it, when, and the before/after status. Already wired to `cap_drafts` via the `audit_cap_drafts` trigger.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can go from selecting a detected hazard event to saving a fully-populated CAP draft in under 5 minutes.
- **SC-002**: 100% of draft state transitions (submit, approve, reject, broadcast, cancel) are recorded in the audit trail with the acting user and timestamp.
- **SC-003**: Zero `broadcast` alerts can have their CAP content fields modified afterward — verified by attempting an edit and confirming rejection in every tested case.
- **SC-004**: Reviewers can distinguish, without needing to ask the author, why a draft was rejected or cancelled — 100% of rejections/cancellations carry a visible reason.
- **SC-005**: All CAP authoring UI text renders correctly (no missing-translation fallback text, no hardcoded Turkish) in all 7 supported locales.
- **SC-006**: Two simultaneous review actions on the same draft never both succeed — the second always receives a conflict response.
- **SC-007**: Zero drafts can be approved or broadcast by the same user who authored/last-edited them — verified by attempting self-approval and confirming rejection in every tested case.

## Assumptions

- A "detected hazard event" refers to records already ingested via the existing pipeline (spec 001/002/003 — GDACS, USGS, NASA FIRMS, etc.); this feature only reads from that data, it does not change how events are ingested.
- It is unknown whether the existing `cap_drafts` table currently holds real production data; this feature therefore treats it as potentially live and makes only additive schema changes (new columns, new RLS policies/constraints), never renaming or dropping existing columns, values, or rows.
- CAP 1.2 alignment is achieved by treating the existing schema's fields (hazard_type≈category/event, severity, certainty, urgency, title≈headline, description, instructions≈instruction, area_desc/polygon≈area) as the CAP-mapped fields; a formal "sender"/"identifier"/"msgType"/"scope" CAP-envelope mapping is an implementation detail for the export/payload-generation task, not a new table redesign.
- Cancelled/rejected/expired/false_alarm/all_clear drafts are retained indefinitely for audit purposes, consistent with the existing `audit_log` table's append-only retention approach; no automatic deletion is introduced by this feature.
- Dissemination (actually sending a `broadcast` CAP alert via email/WhatsApp/web push) is fully out of scope, tracked as a separate roadmap module — this feature's `broadcast` action only finalizes the record.
- The CAP XML/JSON payload export itself (transforming a `cap_drafts` row into a spec-compliant CAP document) is an output concern introduced by this feature's `broadcast` action, but the specific export format's mechanics are an implementation detail to be resolved during planning, not a user-facing scope question.
