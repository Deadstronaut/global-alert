# Feature Specification: Public CAP Feed (Siren/Radio Consumers)

**Feature Branch**: `064-public-cap-feed`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Warning Dissemination pillar): no siren/radio automation integration exists. CAP export (spec 014) is only reachable via the authenticated admin UI. Expose a public, unauthenticated CAP feed built on the same alert set the Public Portal already shows anonymously, so a country's own siren controller or community radio automation system can pull active alerts — no external account needed, this is us publishing, not us calling anyone."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An external system polls for active alerts (Priority: P1)

A country's own siren control system, community radio automation, or any downstream consumer
wants to poll for currently active alerts without needing a login or API key from this platform.

**Independent Test**: `GET /public-cap-feed` with no auth header and confirm an Atom-format XML
feed listing currently active (non-expired, publicly-visible-status) alerts is returned.

**Acceptance Scenarios**:

1. **Given** one or more alerts are currently `broadcast` and unexpired, **When** a client GETs
   `/public-cap-feed`, **Then** the response is a 200 XML feed listing each one with a link to its
   full CAP document.
2. **Given** a specific alert's id, **When** a client GETs `/public-cap-feed?id=<uuid>`, **Then**
   the response is that alert's CAP 1.2 XML document (same shape as the authenticated CapView.vue
   export).
3. **Given** an id that doesn't exist or isn't in a publicly-visible status (draft, pending,
   rejected), **When** requested, **Then** the response is a 404 — never draft/internal content.
4. **Given** a `country` query parameter, **When** provided, **Then** the index feed is filtered to
   that country only.

### Edge Cases

- The feed and individual CAP document endpoints re-apply the exact same status allowlist as the
  existing `viewer_cap_read_public` RLS policy (`broadcast`, `false_alarm`, `all_clear`,
  `expired`) even though the service-role client bypasses RLS — a deliberate belt-and-suspenders
  check so a bug here can never leak non-public draft content.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `GET /public-cap-feed` MUST return an unauthenticated Atom-format XML index of
  currently active, publicly-visible alerts.
- **FR-002**: `GET /public-cap-feed?id=<uuid>` MUST return that alert's full CAP 1.2 XML document,
  or 404 if it doesn't exist or isn't publicly visible.
- **FR-003**: `GET /public-cap-feed?country=<code>` MUST filter the index to that country.
- **FR-004**: The endpoint MUST require no bearer token/API key from its caller.
- **FR-005**: This feature MUST NOT change `cap_drafts`' RLS policies, `capExport.js`, or any
  existing authenticated CAP export path — a new, independent read surface only.

### Key Entities

- No new tables — reads existing `cap_drafts` rows already visible to anon via
  `viewer_cap_read_public`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An external consumer can integrate against this feed using only its public URL — no
  onboarding, account, or credential exchange with this platform.
- **SC-002**: 100% of feed/document responses for non-public-status alerts return 404, never the
  alert's content.

## Assumptions

- This spec ships the feed itself, not a specific siren/radio integration — whether/how a given
  country's physical siren network actually consumes this feed is that country's own
  infrastructure decision, out of scope here (matches the "we publish, they subscribe" framing from
  the original gap analysis).
- No CAP inbound (receiving alerts FROM an external CAP hub) is included here — that is spec 065's
  separate scope.
