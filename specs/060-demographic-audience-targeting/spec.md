# Feature Specification: Demographic Audience Targeting

**Feature Branch**: `060-demographic-audience-targeting`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "MHEWS gap analysis (Preparedness & Response pillar): the system has no demographic/special-group targeting (gender, age, disability, poverty) as called for by the IFRC pillar's own language ('different gender, youth, older persons, people with disability, poor, marginalized and displaced people'). Add contact tagging + optional alert targeting, pure schema/UI/matching-logic change."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tag a contact's demographic group (Priority: P1)

An admin adding or editing a contact wants to record which demographic group(s) that
contact/audience represents (e.g. elderly, disability, displaced), so alerts can later be targeted
to reach them specifically when needed.

**Independent Test**: Open the contact form, check one or more demographic tags, save, and confirm
the tags persist on reload.

**Acceptance Scenarios**:

1. **Given** an admin is creating or editing a contact, **When** they select one or more
   demographic tags and save, **Then** `contacts.demographic_tags` stores exactly those tags.
2. **Given** a contact has no tags selected, **When** saved, **Then** `demographic_tags` is an
   empty array (never NULL, matching the column's `NOT NULL DEFAULT '{}'`).

### User Story 2 - Target an alert at specific demographic groups (Priority: P1)

An alert author preparing a CAP draft for, say, a heat wave wants the alert prioritized toward
elderly and disabled residents specifically, without excluding the rest of the standard country
dispatch — or, for a general flood warning, wants to reach everyone as before.

**Independent Test**: Create a CAP draft with target tags set to `["elderly"]`, dispatch it (or
simulate matching), and confirm only contacts tagged `elderly` are matched; create another draft
with no target tags and confirm all otherwise-matching contacts are matched, unchanged from prior
behavior.

**Acceptance Scenarios**:

1. **Given** a CAP draft has `target_demographic_tags` set to a non-empty list, **When** dispatch
   matching runs, **Then** only contacts whose `demographic_tags` overlaps that list (in addition
   to existing country/hazard/region rules) are matched.
2. **Given** a CAP draft has `target_demographic_tags` NULL or empty, **When** dispatch matching
   runs, **Then** demographic targeting imposes no restriction — identical to pre-060 behavior.
3. **Given** a targeted draft and a contact with zero demographic tags of its own, **When**
   matching runs, **Then** that contact does NOT match the targeted draft (but still matches any
   untargeted draft).

### Edge Cases

- Demographic tags use a fixed vocabulary (`elderly, youth, women, disability, low_income,
  displaced, minority`) shared between the contact form and the CAP form, so overlap matching is
  meaningful rather than comparing free-text that could drift.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `contacts` MUST have a `demographic_tags TEXT[] NOT NULL DEFAULT '{}'` column.
- **FR-002**: `cap_drafts` MUST have a nullable `target_demographic_tags TEXT[]` column.
- **FR-003**: `matchesContact()` MUST treat an empty/null `target_demographic_tags` as "no
  restriction" and a non-empty one as "at least one tag must overlap".
- **FR-004**: The contact form and CAP authoring form MUST expose the same fixed tag vocabulary.
- **FR-005**: This feature MUST NOT change matching behavior for any existing draft that doesn't
  set target tags (backward compatible default).

### Key Entities

- **contacts** (extended): `demographic_tags TEXT[]`.
- **cap_drafts** (extended): `target_demographic_tags TEXT[]`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can tag a contact's demographic group(s) in under 30 seconds from the
  existing contact form.
- **SC-002**: 100% of untargeted (pre-existing-shape) CAP drafts continue to match exactly the same
  contacts as before this change.

## Assumptions

- A fixed tag vocabulary (rather than free text) is used so overlap matching stays meaningful; a
  future spec could let a Super Admin extend the vocabulary if needed (YAGNI for now).
- This is a pure schema + matching-logic + UI change — no external data source or credential,
  matching the "fully completable now" classification from the MHEWS gap review.
