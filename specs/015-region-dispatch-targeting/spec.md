# Feature Specification: Region-Scoped Dissemination Targeting

**Feature Branch**: `015-region-dispatch-targeting`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Dissemination modülünün bölge (region_code) bazlı hedefleme boşluğunu kapatma — CAP uyarısı yayınlandığında, uyarının etkilediği bölgeden bağımsız olarak o ülkedeki TÜM kişilere gidiyor; contacts.region_code zaten var ama dispatch matching'de hiç kullanılmıyor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator scopes an alert to the affected region (Priority: P1)

An operator drafting a CAP alert for a hazard that only affects one region of the country (e.g. a localized earthquake or flood) can optionally specify which region the alert applies to. When the alert is broadcast, only contacts registered in that region (plus contacts with no region set, who are assumed to need country-wide alerts) receive the notification — contacts explicitly registered in other regions of the same country are not disturbed with an alert that doesn't affect them.

**Why this priority**: This is the core problem the feature exists to solve — country-wide over-notification for localized hazards. Without this, every alert reaches every contact in the country regardless of relevance, which degrades trust in the system and increases alert fatigue.

**Independent Test**: Create two contacts in the same country with different region codes; broadcast a CAP alert with a region code matching only one of them; confirm only the matching contact's dispatch job/receipt is created.

**Acceptance Scenarios**:

1. **Given** a broadcast CAP alert with a region code set, **When** dispatch runs, **Then** only contacts whose region code matches the alert's region code (or whose region code is unset) receive the dispatch.
2. **Given** a broadcast CAP alert with no region code set, **When** dispatch runs, **Then** all active, opted-in contacts in the alert's country receive the dispatch, exactly as today (no behavior change).
3. **Given** a broadcast CAP alert with a region code set, **When** a contact in that same country has no region code recorded, **Then** that contact still receives the dispatch (an unset region on a contact is never treated as a mismatch).

---

### User Story 2 - Operator records which region an alert affects (Priority: P2)

While authoring a CAP alert draft, an operator can type in the region the alert affects, using the same free-text convention already used when registering a contact's region. Leaving it blank preserves today's country-wide targeting.

**Why this priority**: This is the input mechanism that makes User Story 1 possible from the operator's side — without a way to record the region, there's nothing for dispatch to match against. It's P2 because the matching logic (US1) and this authoring input are co-dependent, but the underlying data field can exist and be tested at the API/data layer before the UI catches up.

**Independent Test**: Open the alert drafting form, enter a region value, save the draft, and confirm the value persists and is visible on re-opening the draft.

**Acceptance Scenarios**:

1. **Given** an alert draft being authored, **When** the operator enters a region value and saves, **Then** the value is stored on the draft.
2. **Given** an alert draft being authored, **When** the operator leaves the region field blank, **Then** the draft saves successfully with no region recorded (unchanged from current behavior).
3. **Given** an existing draft with a region value, **When** the operator reopens it, **Then** the previously entered region value is displayed.

### Edge Cases

- What happens when an alert has a region code but zero contacts in that country have any region code recorded? → All active, opted-in contacts in the country receive the dispatch (identical to the no-region-code case), since an unset contact region is never a mismatch — this preserves today's behavior for every existing contact until region codes are actively adopted.
- What happens when an alert's region code and a contact's region code are both set but spelled/cased differently (e.g. "Istanbul" vs "ISTANBUL")? → Matching is case-insensitive and trims surrounding whitespace, consistent with how other free-text codes (e.g. country_code) are compared elsewhere in the system.
- What happens to a previously-broadcast alert (no region field existed at the time) — does re-processing change its dispatch history? → No; the region field is additive and only affects new dispatch decisions going forward, not historical records.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an operator to optionally record a region for a CAP alert draft, as free text, at any point before or at broadcast time.
- **FR-002**: The system MUST NOT require a region value on any alert draft — omitting it MUST behave identically to the system's current country-wide targeting.
- **FR-003**: When dispatching a broadcast alert, the system MUST only notify a contact if: the alert has no region recorded, OR the contact has no region recorded, OR the alert's region matches the contact's region (case-insensitive, whitespace-trimmed).
- **FR-004**: The system MUST continue to apply all existing targeting rules unchanged (country match, hazard-type filter, active status, channel opt-in) in addition to the region check — the region check is an additional narrowing filter, never a replacement for existing rules.
- **FR-005**: The system MUST NOT exclude a contact solely because it lacks a recorded region, regardless of whether the alert has a region recorded.
- **FR-006**: The region value recorded on a draft MUST be visible to an operator reopening that draft for editing or review.
- **FR-007**: The system MUST preserve all dispatch behavior for every alert or contact that has no region recorded, with zero migration or backfill required for existing data.

### Key Entities

- **CAP Alert Draft**: Gains an optional region attribute describing which sub-national area the alert concerns, entered as free text by the operator (mirrors the existing free-text region already recorded on contacts). Absence means "applies to the whole country," matching today's behavior.
- **Contact**: Already has an optional region attribute (existing data, no change). This feature is the first consumer of that attribute in the dispatch decision.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An alert scoped to a single region reaches only the contacts registered in that region (plus region-unset contacts), reducing unnecessary notifications for localized hazards to zero avoidable out-of-region sends where region data is available on both sides.
- **SC-002**: 100% of alerts and contacts that omit a region continue to behave exactly as before this feature — no existing dispatch behavior regresses.
- **SC-003**: An operator can record an alert's affected region in the same drafting flow they already use, without needing a separate screen or lookup step, in under 10 seconds of additional effort.

## Assumptions

- Region values remain free text, consistent with the existing `contacts` region field — no controlled vocabulary/registry is introduced in this feature.
- A contact or alert with no region recorded is always treated as "applies everywhere" for matching purposes, never as a non-match — this guarantees the feature can only ever narrow targeting for records that have opted into using it, and never silently drops an existing contact from receiving alerts it would have received before.
- Full polygon/geofence-based geographic targeting (precise coordinates, radius, or shape matching) is out of scope; this feature only adds an equality-style region match, consistent with the system's existing country-code matching approach.
- This feature does not introduce a region taxonomy, hierarchy, or admin-boundary registry — that would be a larger, separate effort.
