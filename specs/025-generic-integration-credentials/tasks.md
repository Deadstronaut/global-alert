---
description: "Task list for Generic Integration Credentials Management (spec 025)"
---

# Tasks: Generic Integration Credentials Management

**Input**: Design documents from `/specs/025-generic-integration-credentials/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/integration-credentials.md, quickstart.md

**Tests**: Included — status formatting and template/custom-field merging are exactly the class of
easy-to-get-subtly-wrong logic this project test-firsts (matches `formatIntegrationStatus` from
spec 022, now extended).

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260708010000_generic_integration_credentials.sql`: add
  `integration_types` table (`code` PK, `display_name`, `field_template` JSONB DEFAULT `'[]'`,
  `is_active` DEFAULT true, `created_at`/`updated_at` with the existing `set_updated_at()`
  trigger) per data-model.md; RLS mirrors `hazard_types` exactly (super_admin full access,
  everyone-authenticated read of active rows); audit trigger via existing `log_table_change()`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `integration_settings` table and the generic write RPC are required before either
user story's read/write path can be exercised; the hard cutover of the old WhatsApp-specific
objects must also happen before the new UI can be the only code path.

**⚠️ CRITICAL**: Complete this phase before starting the user stories.

- [X] T002 In the same migration file, add `integration_settings` table (`country_code`,
  `integration_type_code` REFERENCES `integration_types(code)`, composite PRIMARY KEY,
  `is_configured` DEFAULT false, `configured_field_keys` JSONB DEFAULT `'[]'`, `updated_at`,
  `updated_by` REFERENCES `auth.users(id)` ON DELETE SET NULL) per data-model.md; RLS: super_admin
  full SELECT, country-scoped SELECT (own country only) — no INSERT/UPDATE policy for any role
- [X] T003 In the same migration file, add `save_integration_credentials(p_country_code TEXT,
  p_integration_type_code TEXT, p_fields JSONB) RETURNS void` SECURITY DEFINER function per
  data-model.md: lowercase `p_country_code` first; authorization check (super_admin OR
  country_admin/org_admin of own country) identical to `save_whatsapp_credentials()`; reject if
  `p_fields` has zero keys or any blank/whitespace-only value; Vault write to secret name
  `'integration_creds_' || p_country_code || '_' || p_integration_type_code` using the existing
  lookup-then-`update_secret`-else-`create_secret` pattern; upsert `integration_settings` with
  `is_configured = true`, `configured_field_keys` = the JSON keys of `p_fields`, `updated_at =
  NOW()`, `updated_by = auth.uid()`
- [X] T004 In the same migration file: `INSERT INTO integration_types (code, display_name,
  field_template) VALUES ('whatsapp', 'WhatsApp', '[{"key":"access_token","label":"Access
  Token"},{"key":"phone_number_id","label":"Phone Number ID"},{"key":"webhook_verify_token","label":"Webhook
  Verify Token"}]'::jsonb) ON CONFLICT (code) DO NOTHING` (research.md Decision 1)
- [X] T005 In the same migration file (hard cutover, research.md Decision 4): `DROP FUNCTION IF
  EXISTS save_whatsapp_credentials(TEXT, TEXT, TEXT, TEXT)` and `DROP TABLE IF EXISTS
  whatsapp_integration_settings` — must run AFTER T001-T004 so the new objects exist before the
  old ones are removed (defense against a partially-applied migration ever leaving neither system
  functional)
- [X] T006 [P] Create `src/stores/integrationTypes.js`: `fetchIntegrationTypes()` (SELECT * FROM
  `integration_types`, cache in state), `activeIntegrationTypes` computed (filter `is_active`),
  `createIntegrationType(payload)` (super_admin-only per RLS, store function exists but no UI
  calls it per spec's YAGNI scope decision) — mirrors `src/stores/hazardTypes.js`'s registry
  pattern
- [X] T007 [P] Create `src/stores/integrationSettings.js`: pure function
  `formatIntegrationStatus(setting)` (ported from `whatsappIntegration.js` unchanged: returns
  `{configured:false,updatedAt:null,configuredFieldKeys:[]}` for null/`is_configured:false`, else
  `{configured:true,updatedAt:setting.updated_at,configuredFieldKeys:setting.configured_field_keys ??
  []}`), plus `fetchSettings(countryCode)` (SELECT * FROM `integration_settings` WHERE
  `country_code`, keyed by `integration_type_code` in state) and `saveCredentials(countryCode,
  integrationTypeCode, fieldsObject)` (calls the `save_integration_credentials` RPC, then
  refetches)
- [X] T008 [P] Create `tests/unit/integrationSettings.test.js` covering `formatIntegrationStatus()`
  (null/undefined setting, `is_configured: false`, fully configured with
  `configured_field_keys`) — ports and extends the assertions from the now-deleted
  `whatsappIntegrationStatus.test.js`

**Checkpoint**: New tables/function exist, old WhatsApp-specific DB objects are gone, and the two
new stores (with tested pure status-formatting logic) exist — nothing in the UI uses them yet.

---

## Phase 3: User Story 1 - Admin configures a known integration for their country (Priority: P1) 🎯 MVP

**Goal**: An admin can select a registered integration type (WhatsApp), see its predefined fields,
fill them in, and see a configured status afterward — reproducing spec 022's exact value on top of
the new general system.

**Independent Test**: Select "WhatsApp", see the 3 correct labeled fields, submit, see configured
status with a timestamp; submit again with new values and confirm no duplicate entry is created;
leave a field blank and confirm rejection (quickstart.md Scenarios 1-3).

### Implementation for User Story 1

- [X] T009 [US1] Create `src/components/admin/IntegrationsPanel.vue`: country selector (Super
  Admin free-text lowercased on input via the existing `onCountryInput`-style handler; other roles
  fixed to their own `auth.countryCode`) + "Entegrasyon Türü" `<select>` populated from
  `integrationTypesStore.activeIntegrationTypes` + on selection, render one password `<input>` per
  `field_template` entry (correctly labeled) + status display (configured/not, `updated_at`,
  `configured_field_keys` list) using `formatIntegrationStatus()`
- [X] T010 [US1] In `IntegrationsPanel.vue`'s save handler: collect the template fields' values
  into a plain object keyed by `field.key`, reject client-side (mirroring the existing
  `whatsappIntegration.allFieldsRequired`-style check) if any template field is blank before even
  calling the store, then call `integrationSettingsStore.saveCredentials()`; on success, clear all
  input values (matching spec 022's write-only precedent — never leave a filled value on screen
  after save) and refresh the status display
- [X] T011 [US1] In `src/views/AdminView.vue`, rename the "💬 WhatsApp Entegrasyonu" tab to "🔌
  Entegrasyonlar" and mount `IntegrationsPanel.vue` instead of `WhatsAppIntegrationPanel.vue`,
  keeping the exact same `canCreateUsers` admin-only tab gate
- [X] T012 [US1] Delete `src/components/admin/WhatsAppIntegrationPanel.vue`,
  `src/stores/whatsappIntegration.js`, and `tests/unit/whatsappIntegrationStatus.test.js` (hard
  cutover — superseded by T006/T007/T009/T008)

**Checkpoint**: User Story 1 fully functional — the WhatsApp configuration flow works identically
to spec 022's from an admin's perspective, now backed by the general registry/RPC.

---

## Phase 4: User Story 2 - Admin adds a field beyond an integration's known template (Priority: P2)

**Goal**: An admin can append one or more custom `{name, value}` fields beyond an integration
type's predefined template, and see those custom field names reflected in the configured status.

**Independent Test**: Fill WhatsApp's 3 template fields, add one custom field with a name and
value, save, and confirm the status's field list includes the custom field name alongside the 3
template ones; attempt with a blank custom name or value and confirm rejection (quickstart.md
Scenarios 4-5).

### Implementation for User Story 2

- [X] T013 [US2] In `IntegrationsPanel.vue`, add an "Özel alan ekle" button that appends a new
  `{ name: '', value: '' }` row to a local `customFields` array, each rendered as a pair of text
  inputs (name, value) with a remove ("×") button per row
- [X] T014 [US2] In `IntegrationsPanel.vue`'s save handler, merge `customFields` (filtering out
  fully-empty trailing rows the admin didn't fill in) into the same fields object built in T010
  before calling `saveCredentials()`; reject client-side if any non-empty-intent custom row has a
  blank name or blank value (a row is "non-empty-intent" if either its name or value has any
  content — a row where both are still untouched is simply dropped, not an error)
- [X] T015 [US2] In `tests/unit/integrationSettings.test.js`, add a pure function
  `mergeTemplateAndCustomFields(templateValues, customFields)` (extracted from T014's merge logic
  into `src/stores/integrationSettings.js` so it's directly testable) covering: no custom fields
  (passthrough), one valid custom field (merged in), an all-empty custom row (dropped, not an
  error), a partially-filled custom row (name only or value only — flagged as invalid via a
  returned `errors` array rather than silently dropped or silently accepted)

**Checkpoint**: User Story 2 fully functional and independently testable — custom fields can be
added, are validated correctly, and show up in the configured-fields status.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T016 [P] Replace the `whatsappIntegration.*` i18n keys with `integrations.*` keys (tab
  label, country/type selectors, "Add custom field" button, field name/value placeholders, status
  labels, validation error messages) across all 7 `src/i18n/locales/*.json` files
  (tr/en/es/fr/ru/ar/zh) — remove the now-unused `whatsappIntegration.*` keys entirely (hard
  cutover, no dead keys left behind)
- [X] T017 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T018 Run `npm run build` and confirm a clean build
- [X] T019 Validate quickstart.md Scenarios 1-6 against the live Supabase instance after the user
  applied `20260708010000_generic_integration_credentials.sql` (confirmed via `supabase migration
  list --linked`). DB-level objects confirmed present via read-only queries: `integration_types`
  seeded with the `whatsapp` row and its correct 3-field `field_template`, `integration_settings`
  table present, `save_integration_credentials()` function present, `save_whatsapp_credentials()`
  and `whatsapp_integration_settings` both confirmed absent (hard cutover succeeded cleanly). The
  RPC's actual authorization/validation behavior (Scenarios 1-6) requires a real authenticated
  user session (`auth.uid()`/role context) which the CLI's `postgres`-role connection does not
  have — **user should exercise the live admin UI** with a Super Admin and a Country Admin account
  to confirm the end-to-end save/reject/custom-field flows
- [X] T020 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: note that the
  Integration & API Gateway module's WhatsApp credential management (spec 022) has been
  generalized into a registry-driven system (spec 025) — completion percentage for this module
  remains 100% (this is a quality/architecture improvement, not new scope), but the description
  should reflect the new general design

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS both user stories (T005's hard cutover in
  particular must not run before T001-T004 create the replacement objects)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on User Story 1 (T009/T010 create the panel and its base
  save flow that T013/T014 extend — unlike spec 024's two independent stories, these two are
  sequential because they modify the same save handler)
- **Polish (Phase 5)**: Depends on both user stories being complete

### Parallel Opportunities

- T006/T007/T008 (two stores + their tests) can be scaffolded together, though T008 asserts
  against T007's actual output
- T015 must run strictly after T014 (its pure function is extracted from T014's merge logic), not
  in parallel with anything in this phase
- T016 (i18n) can run in parallel with T017/T018

---

## Implementation Strategy

### MVP First

1. Complete Phase 1: Setup (`integration_types` table)
2. Complete Phase 2: Foundational (`integration_settings` + RPC + WhatsApp seed + old-system
   cutover + stores + tests)
3. Complete Phase 3: User Story 1 (WhatsApp configuration panel — reproduces spec 022's value on
   the new system)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1-3

### Incremental Delivery

5. Complete Phase 4: User Story 2 (custom fields) — delivers the actual "generic" value the
   project owner asked for
6. **STOP and VALIDATE**: quickstart.md Scenarios 4-6
7. Complete Phase 5: Polish (i18n/docs/test/build verification)

---

## Notes

- This is a hard cutover, not an additive extension — T005 and T012 explicitly remove spec 022's
  WhatsApp-specific DB objects and frontend files. Confirmed safe because no production code path
  reads the old credentials yet (`dispatch-alert`'s WhatsApp adapter remains a mock, unchanged by
  this spec).
- `dispatch-alert`'s WhatsApp mock adapter and its TODO comment are NOT touched by any task in this
  list (FR-011) — this spec governs credential storage/management only.
- Commit only when explicitly requested by the user.
