# Feature Specification: CAP v1.2 Envelope & Export

**Feature Branch**: `014-cap-v12-envelope-export`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Alert Authoring / CAP modülünün kalan kalemi (constitution Principle III 'CAP v1.2 Compliance', PRD/SRS). Mevcut durum: cap_drafts + CapView.vue + four-eyes onay + state machine + broadcast sonrası içerik kilidi zaten var (spec 006). Kod taramasıyla doğrulanan gerçek eksik: sistemde HİÇBİR YERDE CAP XML/JSON üretimi veya OASIS CAP v1.2 şema alanları (identifier/sender/msgType/scope) yok — bu, anayasanın Principle III'ünü ('her CAP mesajı OASIS CAP v1.2 şemasına uymalı, validasyon publish'i engellemeli') doğrudan ihlal ediyor, çünkü şu an publish (broadcast) olan hiçbir uyarı gerçek bir CAP mesajı üretmiyor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CAP alerts carry a complete, valid envelope before they can broadcast (Priority: P1)

An operator moving a CAP alert toward broadcast is blocked if the alert is missing information the CAP standard requires to identify who issued it and when — the system fills in what it safely can automatically and only blocks on what truly needs a human decision.

**Why this priority**: This is the constitution's core compliance guarantee (validation must block publish, not just warn) — without it, nothing else in this spec matters, since alerts could still broadcast without ever being expressible as a valid CAP message.

**Independent Test**: Attempt to move a CAP draft to broadcast and confirm the system either auto-populates the required envelope information or blocks the transition with a clear reason if something essential is missing.

**Acceptance Scenarios**:

1. **Given** a new CAP draft, **When** it is created, **Then** it is automatically assigned a unique identifier and an issuing-authority sender value, with no manual step required from the operator.
2. **Given** a CAP draft ready to broadcast, **When** it is transitioned to broadcast, **Then** the transition succeeds only if its envelope information (identifier, sender) is present — which, per Scenario 1, is guaranteed for every draft created going forward.
3. **Given** a CAP draft that supersedes an earlier alert, **When** it is authored, **Then** its relationship to the superseded alert is preserved and available for export (building on the existing `supersedes_id` link).

---

### User Story 2 - Export a broadcast alert as valid CAP v1.2 XML (Priority: P1)

An operator or reviewer viewing a broadcast (or later-status) CAP alert can export it as a CAP v1.2-compliant XML document, suitable for archival, downstream CAP feed consumers, or regulatory evidence packages.

**Why this priority**: This is the other half of the constitution's compliance requirement — authoring a compliant envelope (Story 1) is meaningless if the system can never actually produce the CAP message itself. Equal priority to Story 1 since together they are the whole compliance guarantee.

**Independent Test**: Export a broadcast CAP alert and confirm the resulting XML document contains every OASIS CAP v1.2-mandated field (identifier, sender, sent, status, msgType, scope, and the `<info>` block's category, event, urgency, severity, certainty, effective, expires, headline, description, area).

**Acceptance Scenarios**:

1. **Given** a broadcast CAP alert, **When** an authorized user exports it, **Then** a downloadable CAP v1.2 XML document is produced containing all mandatory fields.
2. **Given** a CAP alert that has not yet reached broadcast status, **When** a user attempts to export it, **Then** the export option is unavailable (exporting a draft alert as if it were an authoritative CAP message would misrepresent its status).
3. **Given** a CAP alert that supersedes an earlier one, **When** it is exported, **Then** the resulting XML correctly references the superseded alert.

---

### User Story 3 - Export the same alert as CAP-structured JSON (Priority: P2)

An operator or reviewer can export the same broadcast alert as a structured JSON document carrying the same CAP fields, for consumers or tooling that prefer JSON over XML.

**Why this priority**: Directly named in this module's backlog alongside XML export, but secondary — XML is the actual OASIS-standard interchange format (Story 2); JSON is a convenience format for internal/tooling consumption, not itself a compliance requirement.

**Independent Test**: Export a broadcast CAP alert as JSON and confirm it contains the same envelope and info fields as the XML export, in a structured (non-XML) format.

**Acceptance Scenarios**:

1. **Given** a broadcast CAP alert, **When** an authorized user exports it as JSON, **Then** a downloadable JSON document is produced containing the same CAP fields as the XML export.

---

### User Story 4 - Update/Cancel messages correctly reference the alert they supersede (Priority: P2)

When an alert that supersedes an earlier one (or cancels one) is exported, the resulting CAP message's type and references correctly reflect that relationship, so downstream consumers can correctly chain related alerts together.

**Why this priority**: A correctness refinement on top of Story 2's export capability — most exported alerts are standalone (`msgType=Alert`), so this only matters for the subset that supersede/cancel another, making it lower priority than the base export capability itself.

**Independent Test**: Export an alert that supersedes an earlier broadcast alert and confirm the export's message type and reference correctly identify the original.

**Acceptance Scenarios**:

1. **Given** a CAP alert with no superseded predecessor, **When** exported, **Then** its message type indicates a new, standalone alert.
2. **Given** a CAP alert that supersedes an earlier broadcast alert, **When** exported, **Then** its message type indicates an update and it correctly references the superseded alert's identity.
3. **Given** a CAP alert that has reached a cancelled/stood-down status, **When** exported, **Then** its message type indicates a cancellation.

---

### Edge Cases

- What happens when exporting an alert whose superseded predecessor cannot be found (e.g. data inconsistency)? The export still succeeds for the alert's own fields; the reference to the missing predecessor is simply omitted rather than blocking the entire export.
- What happens to alerts already broadcast before this feature existed (no envelope information)? Per Story 1 Scenario 1, exports work only for envelope information available; going forward every new draft has it. Retroactively backfilling identifiers/senders for historical broadcast alerts is out of scope for this iteration — this spec does not require rewriting history.
- What happens for restricted or private-scope distribution? Out of scope — this project's constitution limits distribution to Email/Web Portal/WhatsApp with no restricted-audience channel, so every exported alert is CAP scope "Public."
- What happens when exporting an alert authored during an active drill (spec 013, `is_exercise = true`)? The export MUST clearly indicate the alert is a drill/exercise message, consistent with CAP's own convention for non-actionable test messages, so no consumer of the exported file mistakes it for a real alert.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST assign every CAP alert a unique identifier and an issuing-authority sender value automatically at creation time, requiring no manual operator input.
- **FR-002**: The system MUST block a CAP alert from reaching broadcast status if its identifier or sender information is missing (defense-in-depth alongside FR-001's automatic assignment).
- **FR-003**: The system MUST allow an authorized user to export any CAP alert at broadcast status or later as a CAP v1.2-compliant XML document containing all OASIS-mandated envelope and `<info>` fields.
- **FR-004**: The system MUST NOT offer CAP export for an alert that has not yet reached broadcast status.
- **FR-005**: The system MUST allow an authorized user to export the same alert as a structured JSON document carrying equivalent CAP fields.
- **FR-006**: The system MUST set the exported message's type to reflect whether it is a new alert, an update to a superseded alert, or a cancellation, based on the alert's existing supersession link and status.
- **FR-007**: The system MUST include a correct reference to the superseded alert in the export whenever the alert being exported supersedes another.
- **FR-008**: The system MUST mark an exercise-flagged alert's export (per spec 013's `is_exercise`) so that it is unambiguously identifiable as a drill/test message, not a real alert.
- **FR-009**: Every exported alert's scope MUST be recorded as "Public," consistent with this project's constitution constraint that no restricted-distribution channel exists.

### Key Entities

- **CAP Alert (`cap_drafts`)** *(existing entity, extended)*: gains the envelope information (identifier, sender) needed to produce a valid CAP v1.2 message; its existing `supersedes_id`, `status`, and hazard/info fields are read (not modified) to build the exported document.
- **CAP Export (XML/JSON)** *(new, generated on demand — not stored)*: a point-in-time rendering of a broadcast-or-later alert's full CAP v1.2 envelope and info content; not persisted as its own database record, produced fresh each time it is requested.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of CAP alerts created going forward have complete envelope information (identifier, sender) with zero manual operator steps.
- **SC-002**: 100% of attempts to broadcast an alert missing required envelope information are blocked before broadcast, never after.
- **SC-003**: An authorized user can produce a valid CAP v1.2 XML export of any broadcast alert in a single action, containing every OASIS-mandated field.
- **SC-004**: Exported update/cancel messages correctly identify their superseded predecessor 100% of the time when one exists and is still present in the system.

## Assumptions

- "Sender" (the issuing-authority identifier CAP requires) is derived automatically from the alert's own country/organization context at creation time — no per-alert manual sender entry is required in this iteration, consistent with FR-001's "no manual operator input" guarantee.
- The alert's own existing `id` (already a globally unique UUID) serves as its CAP `identifier` — no separate identifier-generation scheme is introduced.
- CAP `scope` is always "Public" for every alert exported by this system (see Edge Cases) — no per-alert scope selection UI is introduced.
- This spec produces exports on demand (computed fresh each time, not stored/cached) — no new table is introduced to persist generated CAP documents.
- Inbound CAP ingestion, CAP hub federation, and retroactive backfilling of envelope data for alerts broadcast before this spec remain explicitly out of scope, consistent with constitution Principle II (CAP: authoring, validation, and export ONLY).
