# Feature Specification: Regional Hazard Threshold Overrides

**Feature Branch**: `020-regional-threshold-overrides`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Hazard Taxonomy Admin modülünde kalan 'bölgesel eşik override'ları' boşluğunu kapatma — spec 010'un tamamladığı küresel hazard_thresholds registry'sine ek, ülke bazlı override katmanı ekleme (frontend only, backend ingestion runtimes deferred as a separate follow-up, mirroring the spec 010→016 precedent)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Country Admin defines a country-specific severity threshold (Priority: P1)

A hazard behaves differently in different countries — a flood level considered "high" in one
country may be routine in another with different infrastructure and terrain. An administrator
holding the Hazard Taxonomy capability (Country Admin or Org Admin, per spec 018's capability
grant) sets a country-specific override for how a hazard's severity is classified in their own
country, without affecting how that same hazard type is classified anywhere else.

**Why this priority**: This is the entire value of the feature — without country-specific
overrides, every country is stuck with one global classification that may not reflect local
reality, which is the exact gap this feature exists to close.

**Independent Test**: As a Country Admin, define an override for one hazard type in one's own
country; enter a manual event in that country at a value that would classify differently under
the global thresholds than the new override, and confirm the override's classification is used.

**Acceptance Scenarios**:

1. **Given** no country override exists for a hazard type in a country, **When** an event of that
   hazard type occurs in that country, **Then** the existing global classification (registry or
   built-in default) applies exactly as it does today.
2. **Given** a Country Admin defines an override for a hazard type in their own country, **When**
   a new event of that hazard type occurs in that country, **Then** the override's classification
   is used instead of the global one.
3. **Given** a country has an override for one hazard type, **When** an event of a *different*
   hazard type occurs in that same country, **Then** the global classification still applies to
   that other hazard type (an override for one hazard type does not affect others).
4. **Given** a country has an override for a hazard type, **When** an event of that same hazard
   type occurs in a *different* country, **Then** that other country's classification is
   unaffected (an override is scoped to exactly one country).

---

### User Story 2 - Country Admin manages (edits/removes) their country's overrides (Priority: P2)

Conditions change — a Country Admin needs to adjust a previously set override, or remove it
entirely so the country reverts to the global classification.

**Why this priority**: Builds on User Story 1's value; the feature is still useful with only
create-and-use (P1), but not maintainable long-term without edit/remove, hence P2.

**Independent Test**: Edit an existing override's values and confirm new events reflect the
updated classification; remove an override and confirm the country reverts to the global
classification for that hazard type.

**Acceptance Scenarios**:

1. **Given** an existing override, **When** a Country Admin edits its values, **Then** subsequent
   events in that country use the updated values.
2. **Given** an existing override, **When** a Country Admin removes it, **Then** subsequent events
   in that country for that hazard type use the global classification again, exactly as before the
   override ever existed.

---

### User Story 3 - Super Admin manages overrides for any country (Priority: P3)

A Super Admin, who already has full access to the global hazard taxonomy, can also set up or
correct a country-specific override on behalf of any country, without needing that country's own
administrator to do it.

**Why this priority**: A convenience/oversight capability rather than the feature's core value —
Country Admins can already do this for their own country under User Stories 1–2; Super Admin
access to *every* country's overrides is an administrative nicety, hence P3.

**Independent Test**: As Super Admin, create an override for a country other than one's own and
confirm it takes effect for that country exactly as if that country's own admin had created it.

**Acceptance Scenarios**:

1. **Given** Super Admin is signed in, **When** they create, edit, or remove an override for any
   country, **Then** the action succeeds regardless of which country is targeted.

---

### Edge Cases

- What happens when someone without administrative access to a country's hazard taxonomy tries to
  create an override for a country other than their own? The action MUST be rejected, even if
  attempted through a means other than the visible admin interface.
- What happens when a hazard type has no override in any country? Every country uses the existing
  global classification, unchanged from today's behavior (zero regression).
- What happens when a country has overrides for some hazard types but not others? Only the
  overridden hazard types use the country-specific classification in that country; the rest use
  the global classification.
- Who can create an override for a country that has no assigned Country/Org Admin yet? Only Super
  Admin, since there is no country-scoped administrator to do so.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a country-specific override of a hazard type's severity
  classification, scoped to exactly one country and one hazard type.
- **FR-002**: When no override exists for a given country/hazard-type combination, the system MUST
  use the existing global classification, unchanged (zero regression for every combination that
  has no override).
- **FR-003**: When an override exists for a country/hazard-type combination, the system MUST use
  the override's classification for events of that hazard type in that country, instead of the
  global one.
- **FR-004**: An override for one hazard type in a country MUST NOT affect the classification of
  any other hazard type in that same country.
- **FR-005**: An override for a hazard type in one country MUST NOT affect the classification of
  that same hazard type in any other country.
- **FR-006**: An administrator holding the Hazard Taxonomy administrative capability (Country
  Admin or Org Admin, per spec 018's capability grant) MUST be able to create, edit, and remove
  overrides only for their own country. Holding the base Country Admin or Org Admin role alone,
  without the capability grant, MUST NOT be sufficient — this matches the existing access rule for
  the rest of the Hazard Taxonomy admin area (spec 018), where the capability grant, not the base
  role, is what gates access.
- **FR-007**: Super Admin MUST be able to create, edit, and remove an override for any country.
- **FR-008**: System MUST reject an attempt to create, edit, or remove an override for a country
  other than the acting administrator's own country (unless that administrator is Super Admin),
  even if attempted through a means other than the visible admin interface.
- **FR-009**: Removing an override MUST restore the global classification for that country/hazard
  type combination, indistinguishable from a combination that never had an override.

### Key Entities

- **Hazard Threshold Override**: Represents a country-specific replacement of a hazard type's
  global severity classification. Attributes: which hazard type, which country, the
  classification rule itself (equivalent in shape to the global classification it can override).
  Exactly one override may exist per hazard-type/country combination.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of hazard-type/country combinations with no override behave identically to
  before this feature existed (zero regression).
- **SC-002**: A newly created or edited override takes effect for the next event of that hazard
  type in that country without any additional action beyond saving the override.
- **SC-003**: A Country Admin can create a working override for their own country in under 2
  minutes from the relevant admin screen.
- **SC-004**: Zero instances of an override created for one country affecting classification in
  any other country, across any number of overrides defined.

## Assumptions

- This feature covers the classification path used by manually-entered and file-imported events
  in the admin panel (the same path spec 010 already made registry-driven). Extending the
  automatic, real-time ingestion pipelines (the backend normalizers that process data pulled
  automatically from external sources) to also honor country-specific overrides is explicitly
  deferred as a separate, larger follow-up — mirroring the same split this project already made
  between spec 010 (frontend classification, done) and spec 016 (backend ingestion pipelines,
  done separately) for the global registry itself.
- Only Super Admin, and Country Admin/Org Admin holding the existing Hazard Taxonomy
  administrative capability grant (spec 018), are eligible to manage overrides — a Country
  Admin/Org Admin without that capability grant has no access, exactly as they already have no
  access to the rest of the Hazard Taxonomy admin area. Viewer accounts have no access at all,
  consistent with every other admin-only capability in this system.
- An override fully replaces the global classification for its hazard-type/country combination —
  there is no partial/blended classification between the global rule and the override.
