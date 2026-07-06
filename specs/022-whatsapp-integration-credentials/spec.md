# Feature Specification: Per-Country WhatsApp Integration Credentials

**Feature Branch**: `022-whatsapp-integration-credentials`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Integration & API Gateway modülünün kalan kısmı — backlog'un 'API endpoint config admin UI' tanımı yanıltıcı çıktı (bu aslında zaten tamamlanmış data_sources panelini kastediyor). PRD'nin gerçek gereksinimleri (API Key Issuance, Schema Enforcement, WhatsApp webhook handling) kodda hiç yok. Proje sahibi bunu yeniden çerçeveledi: sistem farklı ülkelere/müşterilere teslim edilecek 'hazır bir sistem' olduğu için, biz kendi WhatsApp Business API kimlik bilgilerimizi önceden yapılandırmamalıyız — her ülke KENDİ kimlik bilgilerini (access token, phone number id, webhook verify token) admin panelinden kendisi girip yönetmeli, güvenli şekilde (Supabase Vault) saklanmalı. Gerçek Meta Cloud API çağrısı ve inbound webhook receiver ayrı, daha büyük bir iterasyona bırakılıyor (kimlik bilgisi olmadan test edilemez); API Key Issuance ve Schema Enforcement bu proje için hiç anlamlı değil (dış API tüketici senaryosu yok) ve kapsam dışı bırakılıyor."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A country configures its own WhatsApp integration credentials (Priority: P1)

Each country/customer that this system is delivered to has (or will obtain) its own WhatsApp
Business API account. A Country Admin (or Org Admin, or Super Admin on any country's behalf)
enters that country's own access token, phone number ID, and webhook verification token into the
system, so that when real WhatsApp dispatch is later enabled, the system uses that country's own
credentials rather than a shared or hardcoded one.

**Why this priority**: This is the entire value of the feature — without a place for each country
to register its own credentials, there is no way for this system to be handed to multiple
customers without either sharing one account (unacceptable) or hardcoding integration secrets per
deployment (unmaintainable, insecure).

**Independent Test**: As a Country Admin, enter WhatsApp integration credentials for one's own
country; confirm the system shows the integration as "configured" without ever redisplaying the
entered values.

**Acceptance Scenarios**:

1. **Given** a Country Admin is signed in, **When** they enter their country's WhatsApp access
   token, phone number ID, and webhook verification token and save, **Then** the system confirms
   the integration is now configured for that country.
2. **Given** credentials have been saved for a country, **When** anyone (including the admin who
   entered them) later views that country's integration settings, **Then** the actual credential
   values are never shown again — only a "configured" status and the last-updated time.
3. **Given** no credentials have been entered for a country, **When** an admin views that
   country's integration settings, **Then** the system clearly shows "not configured."

---

### User Story 2 - A country updates or replaces its credentials (Priority: P2)

WhatsApp Business API tokens expire or need to be rotated (e.g., after a security incident, or
because the customer switched to a new WhatsApp Business account). A Country Admin needs to
replace previously entered credentials with new ones.

**Why this priority**: Builds on User Story 1 — credential rotation is a normal operational need,
but the feature already delivers its core value (each country can configure its own integration)
without it; not being able to update is a maintenance gap, not a blocker to first-time setup.

**Independent Test**: Replace a previously configured country's credentials with new values;
confirm the "configured" status and last-updated time reflect the change.

**Acceptance Scenarios**:

1. **Given** a country already has configured credentials, **When** its admin enters new values
   and saves, **Then** the stored credentials are replaced (not duplicated) and the last-updated
   time changes.

---

### Edge Cases

- What happens when someone tries to configure or view credentials for a country other than
  their own (unless they are Super Admin)? The action MUST be rejected, even if attempted through
  a means other than the visible admin interface.
- What happens when a required field (access token, phone number ID, or webhook verification
  token) is left blank? The system MUST reject an incomplete submission rather than partially
  saving it.
- What happens when credentials are saved but the underlying real WhatsApp dispatch capability
  (a separate, later iteration) is not yet built? The system MUST continue to use its existing
  mock/simulated WhatsApp delivery behavior unchanged — saving credentials MUST NOT itself change
  any current dispatch behavior (zero regression).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authorized administrator to enter WhatsApp integration
  credentials (access token, phone number ID, webhook verification token) for their own country.
- **FR-002**: System MUST never redisplay a previously entered credential value to any user,
  through any interface — only whether the country's integration is configured, and when it was
  last updated.
- **FR-003**: System MUST reject an incomplete credential submission (any of the three fields
  missing).
- **FR-004**: A Country Admin or Org Admin MUST be able to configure credentials only for their
  own country; Super Admin MUST be able to do so for any country.
- **FR-005**: System MUST reject an attempt to configure or view another country's integration
  status, other than Super Admin, even if attempted through a means other than the visible admin
  interface.
- **FR-006**: An administrator MUST be able to replace previously saved credentials with new
  ones; the system MUST NOT retain the old values after a successful replacement.
- **FR-007**: Saving, updating, or the absence of WhatsApp integration credentials MUST NOT alter
  the system's current (simulated) WhatsApp dispatch behavior in this iteration.

### Key Entities

- **WhatsApp Integration Setting**: Represents one country's WhatsApp Business API configuration
  status. Attributes: country, whether it is currently configured, when it was last updated, who
  last updated it. Does not itself hold the credential values.
- **WhatsApp Credentials** (sensitive, not a queryable entity): access token, phone number ID, and
  webhook verification token for one country's WhatsApp Business API account — write-only from
  the system's own perspective once saved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can configure their country's WhatsApp integration credentials in
  under 2 minutes.
- **SC-002**: 100% of attempts to view a previously saved credential value are met with only a
  configured/not-configured status, never the value itself.
- **SC-003**: Zero instances of one country's administrator configuring or viewing another
  country's integration status, unless that administrator is Super Admin.
- **SC-004**: Existing WhatsApp dispatch behavior is unchanged for every country, regardless of
  whether that country has configured credentials (zero regression).

## Assumptions

- This feature covers only the secure storage and country-scoped management of WhatsApp
  integration credentials. It does NOT include: making a real WhatsApp Business API call using
  these credentials (the current simulated/mock dispatch behavior continues unchanged), or
  receiving/processing inbound delivery-receipt callbacks from WhatsApp. Both are separate, larger
  follow-up work, since neither can be meaningfully built or tested without an actual WhatsApp
  Business account and credentials to validate against.
- Issuing API keys to external consumers of this system's own data, and validating incoming
  request payloads against a JSON schema, are explicitly out of scope and not planned as a
  follow-up in this project — this system currently has no external API-consumer scenario that
  would need either capability.
- Only Super Admin, and Country Admin/Org Admin for their own country, may configure or view
  integration status — Viewer accounts have no access to this feature, consistent with other
  admin-only capabilities in this system.
- "Never redisplay a credential value" means the system's own user interface and API responses;
  it does not cover how the underlying secure-storage mechanism protects data at rest, which is an
  implementation concern for the planning phase.
