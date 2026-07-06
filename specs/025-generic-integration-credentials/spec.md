# Feature Specification: Generic Integration Credentials Management

**Feature Branch**: `025-generic-integration-credentials`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Spec 022'de (WhatsApp Business API kimlik bilgileri) sadece WhatsApp'a özel, sabit 3 alanlı bir entegrasyon paneli yapılmıştı. Proje sahibi bunun yetersiz olduğunu belirtti: sistem farklı ülkelere/müşterilere teslim edildiği için, gelecekte WhatsApp dışında da entegrasyonlar eklenebilmesi gerekiyor — GENEL bir entegrasyon kimlik bilgisi yönetim sistemi olmalı."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin configures a known integration (e.g. WhatsApp) for their country (Priority: P1)

A Super Admin, Country Admin, or Org Admin wants to enter their own country's credentials for a
known integration type (e.g. WhatsApp Business API) using a form that already shows the right
fields for that integration, without needing a developer to build a new form for it.

**Why this priority**: This preserves and generalizes the exact value spec 022 already delivered
(each country brings its own WhatsApp credentials) — it is the immediate, must-not-regress
baseline this spec builds on.

**Independent Test**: Select "WhatsApp" from the integration type list, see the three expected
fields (Access Token, Phone Number ID, Webhook Verify Token) already labeled and ready to fill,
submit, and confirm the status shows as configured.

**Acceptance Scenarios**:

1. **Given** an admin viewing the integrations page for their country, **When** they select the
   "WhatsApp" integration type, **Then** the form shows exactly the fields known to belong to that
   integration type, correctly labeled.
2. **Given** all of a known integration type's fields are filled in and submitted, **When** the
   save completes, **Then** the page shows that integration as configured for that country, along
   with when it was last updated.
3. **Given** one or more required fields are left blank, **When** the admin attempts to save,
   **Then** the system rejects the save with a clear message and does not silently accept partial
   credentials.
4. **Given** an integration was previously configured for a country, **When** an admin re-submits
   the form with new values, **Then** the stored credentials are replaced (not duplicated), and the
   "last updated" timestamp reflects the new save.

---

### User Story 2 - Admin adds a field beyond an integration's known template (Priority: P2)

An admin configuring an integration realizes they need to record an additional piece of
information beyond the integration's predefined fields (e.g. a region code, an account ID, or any
other detail that particular provider requires), so they add a custom field on the spot rather
than being blocked by a rigid form.

**Why this priority**: Directly addresses the project owner's core concern — a form that can only
ever handle the fields a developer anticipated in advance isn't "generic" enough for a
multi-tenant template product where each country's provider requirements may differ slightly.

**Independent Test**: While filling in a known integration type's form, add one extra custom
field with its own name and value, save, and confirm the saved status reflects that the extra
field was included.

**Acceptance Scenarios**:

1. **Given** an admin is filling in an integration's form, **When** they choose to add a custom
   field, **Then** they can specify both a field name and a value freely, independent of the
   integration type's predefined template.
2. **Given** a custom field with an empty name or empty value, **When** the admin attempts to
   save, **Then** the system rejects the save with a clear message (a custom field must be
   complete to be meaningful).
3. **Given** an integration was saved with both template fields and custom fields, **When** the
   admin views that integration's status afterward, **Then** they can see which field names were
   configured (not their secret values).

---

### Edge Cases

- What happens when an admin selects an integration type that has never been configured for their
  country before? The form starts empty/unconfigured, exactly as it did for WhatsApp under the
  old system.
- What happens when the same field name is entered twice (once via the template, once as a
  "custom" field with the same name)? The later value for that name is what gets saved (no
  duplicate-key confusion) — this is a defensive edge case, not an expected normal flow.
- What happens to a country's already-configured WhatsApp status from the prior system? Since no
  production consumer has ever read these credentials yet (the dispatch pathway still uses a mock
  adapter), no data migration is required — this is a clean cutover, not an upgrade path.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a registry of integration types (e.g. "WhatsApp") each with its
  own predefined set of expected field names, so a new form does not need to be built for every
  known integration.
- **FR-002**: System MUST allow an authorized admin to select an integration type and be shown
  exactly that type's predefined fields, correctly labeled, ready to fill in.
- **FR-003**: System MUST allow an authorized admin to add one or more additional fields beyond an
  integration type's predefined template, each with a freely chosen name and value.
- **FR-004**: System MUST reject a save attempt where any field (predefined or custom) is blank or
  whitespace-only, or where a custom field's name is blank.
- **FR-005**: System MUST reject a save attempt where zero fields are provided at all.
- **FR-006**: System MUST never display or return previously-saved credential values back to any
  admin — only whether an integration is configured, which field names were set, and when it was
  last updated.
- **FR-007**: System MUST replace (not duplicate) a country's existing saved credentials for a
  given integration type when an admin re-submits the form.
- **FR-008**: Authorization for configuring a country's integration credentials MUST remain
  identical to the existing rule: a Super Admin may configure any country; a Country Admin or Org
  Admin may configure only their own country.
- **FR-009**: Only a Super Admin MUST be able to define or modify the registry of available
  integration types (the predefined field templates themselves).
- **FR-010**: The existing WhatsApp-specific credential system MUST be replaced entirely by this
  general system — WhatsApp becomes the first predefined integration type in the new registry,
  with no separate, parallel WhatsApp-only code path remaining.
- **FR-011**: This feature MUST NOT change how any alert-dispatch pathway actually sends messages
  through any integration — it governs credential storage and management only.

### Key Entities

- **Integration Type**: Represents a kind of external integration (e.g. WhatsApp). Has a display
  name and a predefined list of expected field names/labels. Managed only by a Super Admin.
- **Integration Setting**: Represents one country's configuration status for one integration type
  — whether it's configured, which field names were set, and when it was last updated. Never
  stores the actual credential values.
- **Integration Credentials** (not directly visible to any user): The actual secret field
  values for one country's one integration type, write-only from every admin's perspective.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can configure a known integration type (e.g. WhatsApp) for their country in
  under 2 minutes, seeing the correct fields without needing external documentation.
- **SC-002**: An admin can add a custom field not anticipated by the integration's predefined
  template without contacting a developer or waiting for a new release.
- **SC-003**: 100% of incomplete submissions (any blank field, or zero fields) are rejected before
  being saved.
- **SC-004**: Adding a brand-new kind of integration to the system in the future requires only a
  registry entry, not new UI code, for the common case where its fields are known in advance.

## Assumptions

- No production consumer currently reads any previously-saved WhatsApp credential (the dispatch
  pathway still uses a mock adapter with a TODO), so replacing the WhatsApp-specific system
  entirely — rather than maintaining it alongside a new general one — is safe and introduces no
  data-migration burden.
- A Super Admin, Country Admin, or Org Admin remains the correct set of roles permitted to
  configure integration credentials — this spec does not change who may configure them, only how
  the form adapts to different integration types.
- Building a UI for a Super Admin to define brand-new integration types (beyond the predefined
  WhatsApp entry) is out of scope for this iteration — the registry mechanism exists and a future
  iteration can add that UI if/when a second real integration type is actually needed (YAGNI).
- Schema-based enforcement of which fields are "required" per integration type is out of scope —
  the simpler rule (every field present, predefined or custom, must be non-blank) is sufficient
  for this iteration.
