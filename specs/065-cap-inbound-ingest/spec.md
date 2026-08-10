# Feature Specification: CAP Inbound Ingest

**Feature Branch**: `065-cap-inbound-ingest`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Warning Dissemination pillar): docs/mhewsprd.md explicitly scopes out inbound CAP hub ingest — CAP handling is outbound-only. Add a receiving endpoint so a country's own official CAP source can push alerts in for human review, without ever bypassing the existing four-eyes broadcast approval workflow. No external account is needed FROM us since we are the receiver."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Country admin generates an ingest token for an external source (Priority: P1)

A country_admin wants to let their country's official meteorological service (or a national CAP
hub) push alerts into this platform, without giving that external system any login credentials to
the platform itself.

**Independent Test**: Create an inbound source, confirm a token is generated and shown exactly
once, and confirm the source appears in the list afterward (without the token visible again).

**Acceptance Scenarios**:

1. **Given** a country_admin creates a named inbound source, **When** saved, **Then** a random
   `ingest_token` is generated and shown once in the UI.
2. **Given** a source is deactivated, **When** an external system pushes using its token,
   **Then** the request is rejected (401), even though the token value still exists in the table.

### User Story 2 - External system pushes a CAP alert for review (Priority: P1)

An external CAP source POSTs a CAP 1.2 XML document with its ingest token, and the alert appears
in the admin's review queue — never directly broadcast.

**Independent Test**: POST a CAP XML body to `cap-inbound-ingest` with a valid `X-Ingest-Token`
header, and confirm a new `cap_inbound_alerts` row appears with parsed fields and status
`received`.

**Acceptance Scenarios**:

1. **Given** a valid, active ingest token and a CAP XML body, **When** POSTed, **Then** the raw
   payload and a best-effort parse (identifier, event, headline, description, severity, areaDesc,
   effective, expires) are stored as a new `cap_inbound_alerts` row.
2. **Given** an invalid or inactive token, **When** POSTed, **Then** the request is rejected (401)
   and nothing is stored.
3. **Given** an admin reviews a received alert and clicks "Promote to draft", **When**
   `promote_cap_inbound_alert()` runs, **Then** a new `cap_drafts` row is created in `draft` status
   — never `approved` or `broadcast` — still subject to the existing four-eyes approval workflow.
4. **Given** an inbound alert has already been promoted, **When** promotion is attempted again,
   **Then** it is rejected (no duplicate draft).

### Edge Cases

- Parsing is deliberately simple regex extraction of CAP's well-known `<info>` elements, not a full
  XML schema validator — acceptable because a human always reviews `raw_payload` (kept verbatim)
  before promotion; imperfect parsing degrades to blank fields the admin can fill in, never silent
  corruption.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `cap_inbound_sources` (per-country, admin-managed, generates a
  random `ingest_token`) and `cap_inbound_alerts` (raw payload + parsed fields + review status).
- **FR-002**: `cap-inbound-ingest` MUST be reachable without any platform bearer token, authenticated
  only by a valid, active source's `ingest_token`.
- **FR-003**: A received inbound alert MUST NOT become a live `cap_drafts` row automatically —
  only an authenticated admin's explicit "promote" action creates one, and only in `draft` status.
- **FR-004**: `promote_cap_inbound_alert()` MUST enforce the same country-scoping authorization as
  every other cascade/risk RPC (super_admin any country; country_admin own country only).
- **FR-005**: This feature MUST NOT alter `cap_drafts`' existing approval/broadcast state machine
  (`guard_cap_draft_transition`) in any way — a promoted row enters at `draft` like any
  admin-authored one.

### Key Entities

- **cap_inbound_sources**: `country_code`, `name`, `ingest_token`, `is_active`.
- **cap_inbound_alerts**: `source_id`, `country_code`, `raw_payload`, parsed fields, `status`
  (received/reviewed/promoted/rejected), `promoted_cap_draft_id`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A country_admin can onboard an external CAP source in under 1 minute (create source,
  copy token).
- **SC-002**: 100% of inbound alerts require an explicit human "promote" action before any
  corresponding `cap_drafts` row exists — zero automatic drafts, zero automatic broadcasts.

## Assumptions

- This spec is the receiving half of "outbound-only CAP" the MHEWS gap review flagged; spec 064
  (public CAP feed) is the sending half to external siren/radio consumers — the two are
  independent and don't share code paths.
- No signature/certificate verification of the external source is included in this iteration (the
  shared-secret `ingest_token` is the trust boundary) — acceptable for a first iteration since
  every inbound alert requires human review before it can affect anything real.
