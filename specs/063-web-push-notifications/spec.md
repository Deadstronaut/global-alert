# Feature Specification: Web Push Notifications Channel

**Feature Branch**: `063-web-push-notifications`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Warning Dissemination pillar): only Email/WhatsApp dispatch channels exist (docs/mhewsprd.md's explicit scope exclusion of SMS/cell broadcast/push/siren). Mobile push is the one excluded channel that needs no third-party account — browsers' own push services require only a self-generated VAPID key pair, not an API key from any provider. Add it as a new, independent channel."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visitor opts into push notifications on the Public Portal (Priority: P1)

A visitor to the Public Alert Portal wants to be notified immediately when a new alert is
broadcast for their country, without creating an account.

**Independent Test**: Open `/portal` in a push-capable browser, select a country, click Subscribe,
grant the browser permission prompt, and confirm the UI shows "Push notifications enabled".

**Acceptance Scenarios**:

1. **Given** a visitor selects a country and clicks Subscribe, **When** the browser grants push
   permission, **Then** a `push_subscriptions` row is created for that country via `subscribe-push`.
2. **Given** an already-subscribed visitor returns to the portal, **When** the page loads,
   **Then** the UI reflects their existing subscription state (no duplicate prompt).
3. **Given** a subscribed visitor clicks Unsubscribe, **When** the action completes, **Then** the
   browser subscription is cancelled and the `push_subscriptions` row is deactivated.

### User Story 2 - Broadcast CAP alert reaches subscribed browsers (Priority: P1)

When a CAP draft transitions to `broadcast`, every active push subscription matching its country
(and region/hazard type, if the subscriber set those) receives a push notification.

**Independent Test**: Subscribe a test browser to a country, broadcast a CAP draft for that
country, and confirm a system notification appears with the alert's title.

**Acceptance Scenarios**:

1. **Given** a CAP draft broadcasts, **When** `trg_notify_web_push_on_broadcast` fires, **Then**
   `send-web-push` sends to every matching active subscription.
2. **Given** a subscription's push service returns 404/410 (gone), **When** `send-web-push`
   processes it, **Then** that subscription is deactivated so future broadcasts skip it.
3. **Given** VAPID keys are not yet configured for a deployment, **When** a broadcast fires,
   **Then** `send-web-push` no-ops (`meta.status: 'skipped'`) rather than failing the broadcast
   transition — identical treatment to `dispatch-alert`'s missing-email-provider case.
4. **Given** a CAP draft is an exercise/drill alert, **When** it broadcasts, **Then** no push is
   sent (same `is_exercise` exclusion as the existing email/WhatsApp dispatch trigger).

### Edge Cases

- Push subscriptions are anonymous browser subscriptions, not tied to any `contacts` row or user
  account — deliberately decoupled from `dispatch_jobs`/`dispatch_receipts` (spec 009), which are
  built around named, identity-bearing contacts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a `push_subscriptions` table (country_code, region_code,
  hazard_type_filter, endpoint, p256dh, auth_key, is_active).
- **FR-002**: `subscribe-push` (public, unauthenticated) MUST accept a browser's PushSubscription
  and upsert it, and MUST also handle unsubscribe (deactivate).
- **FR-003**: A DB trigger on `cap_drafts` MUST invoke `send-web-push` on every broadcast
  transition, excluding exercise/drill alerts, mirroring `notify_dispatch_on_broadcast`'s existing
  pattern exactly.
- **FR-004**: `send-web-push` MUST require no third-party push-provider account — only a
  self-generated VAPID key pair (documented in `send-web-push/README.md`).
- **FR-005**: A push service's 404/410 response for a given subscription MUST deactivate that
  subscription (dead-subscription cleanup).
- **FR-006**: This feature MUST NOT alter the existing Email/WhatsApp dispatch path
  (`dispatch_jobs`/`dispatch_receipts`/`dispatch-alert`) in any way — fully additive, parallel
  channel.

### Key Entities

- **push_subscriptions**: `country_code`, `region_code`, `hazard_type_filter`, `endpoint`,
  `p256dh`, `auth_key`, `is_active`, `last_notified_at`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A visitor can subscribe to push notifications in under 30 seconds, no account
  required.
- **SC-002**: 100% of broadcast (non-exercise) CAP drafts trigger a `send-web-push` invocation for
  their country's active subscribers.
- **SC-003**: A deployment with no VAPID keys configured never fails a CAP broadcast because of
  this feature.

## Assumptions

- Web Push's browser-vendor-operated push services (Google/Mozilla/Apple) require no API key or
  account from this application — only the VAPID key pair the deployment generates itself once, per
  `send-web-push/README.md`. This is what makes push (unlike SMS/WhatsApp) classifiable as "fully
  completable now" in the MHEWS gap review, rather than a "just needs a credential" item.
- Push subscribers are anonymous and browser-scoped; there is no cross-device sync or account
  recovery in this iteration (a new browser/device requires a fresh subscribe) — acceptable for a
  best-effort supplementary channel alongside Email/WhatsApp, not a replacement for them.
