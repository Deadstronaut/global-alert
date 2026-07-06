---

description: "Task list for Per-Country WhatsApp Integration Credentials (spec 022)"
---

# Tasks: Per-Country WhatsApp Integration Credentials

**Input**: Design documents from `/specs/022-whatsapp-integration-credentials/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/whatsapp-integration.md, quickstart.md

**Tests**: Included — `formatIntegrationStatus()`'s "no row vs. explicitly false vs. true"
branching is exactly the class of easy-to-get-subtly-wrong logic the constitution flags for
test-first treatment, matching the project's established pattern (`occupancyPercentage()` in
spec 021).

**Organization**: Tasks are grouped by user story (US1–US2) matching spec.md priorities.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `supabase/migrations/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Create `supabase/migrations/20260707240000_whatsapp_integration_settings.sql` with a header comment describing scope (per-country WhatsApp Business API credential storage, spec 022, purely additive — `dispatch-alert`'s existing WhatsApp mock adapter is untouched)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `whatsapp_integration_settings` table, its RLS, the `save_whatsapp_credentials()`
function, and the pure status-formatting function are shared by both user stories — nothing else
can be built until these exist.

**⚠️ CRITICAL**: Complete this phase before starting any user story.

- [X] T002 In the new migration, create `whatsapp_integration_settings` table per data-model.md: `country_code VARCHAR(2) PRIMARY KEY`, `is_configured BOOLEAN NOT NULL DEFAULT false`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL` — idempotent (`CREATE TABLE IF NOT EXISTS`); no credential columns exist on this table
- [X] T003 In the same migration, attach the existing `set_updated_at()` trigger function (reuse, do not duplicate) via `BEFORE UPDATE`, and the existing `log_table_change()` audit trigger function via `AFTER INSERT OR UPDATE OR DELETE`
- [X] T004 In the same migration, enable RLS and add two SELECT-only policies per data-model.md: `super_admin_whatsapp_settings_all` (`current_profile_role() = 'super_admin'`, any country), `country_scoped_whatsapp_settings_select` (`current_profile_role() IN ('country_admin','org_admin') AND country_code = current_profile_country_code()`) — deliberately NO INSERT/UPDATE policy for any role, since all writes go exclusively through `save_whatsapp_credentials()` (T005) — `DROP POLICY IF EXISTS` + `CREATE POLICY`
- [X] T005 In the same migration, create `save_whatsapp_credentials(p_country_code TEXT, p_access_token TEXT, p_phone_number_id TEXT, p_webhook_verify_token TEXT) RETURNS void SECURITY DEFINER` per data-model.md: (a) **first line**: `p_country_code := lower(p_country_code);` — normalize case before any check/comparison/write, since `current_profile_country_code()` and every other country_code column in this project (contacts, shelters, profiles) are always stored lowercase (analysis finding I1) — without this, a Super Admin submitting an uppercase code would create a duplicate row for the same country and could cause a legitimate country_admin's own save to be wrongly rejected; (b) raise an exception unless caller is `super_admin` or (`country_admin`/`org_admin` AND `p_country_code = current_profile_country_code()`) (FR-004/FR-005); (c) raise an exception if any of the three credential arguments is null or empty-string (FR-003); (d) build a JSON payload of the three fields; (e) look up `vault.secrets` for a row named `'whatsapp_creds_' || p_country_code` — call `vault.update_secret(id, payload::text)` if found, else `vault.create_secret(payload::text, 'whatsapp_creds_' || p_country_code)` (research.md Decision 2, avoids the unique-constraint failure this project already hit once in spec 019); (f) `INSERT INTO whatsapp_integration_settings (country_code, is_configured, updated_at, updated_by) VALUES (p_country_code, true, now(), auth.uid()) ON CONFLICT (country_code) DO UPDATE SET is_configured = true, updated_at = now(), updated_by = auth.uid()`; never returns the payload or any decrypted secret
- [X] T006 [P] Create `src/stores/whatsappIntegration.js` with the pure `formatIntegrationStatus(setting)` function per data-model.md (returns `{ configured: false, updatedAt: null }` for a null/undefined setting or `is_configured: false`; `{ configured: true, updatedAt: setting.updated_at }` otherwise)
- [X] T007 [P] Create `tests/unit/whatsappIntegrationStatus.test.js` covering `formatIntegrationStatus()`: no row (`null`/`undefined`) → not configured, row with `is_configured: false` → not configured, row with `is_configured: true` → configured with the row's `updated_at` passed through

**Checkpoint**: The table, its RLS, the write function, and the tested status-formatting function
exist — nothing calls the store's CRUD methods or renders any UI yet.

---

## Phase 3: User Story 1 - A country configures its own WhatsApp integration credentials (Priority: P1) 🎯 MVP

**Goal**: A Country Admin (or Org Admin/Super Admin) can enter their country's WhatsApp Business
API credentials once, and see a "configured" status afterward without the values ever being
shown again.

**Independent Test**: As a Country Admin, enter credentials and save; confirm status shows
"configured"; reload and confirm the form is empty and no value is redisplayed (quickstart.md
Scenarios 1–3).

### Implementation for User Story 1

- [X] T008 [US1] In `src/stores/whatsappIntegration.js`, add `settings` state (`ref({})`, keyed by `country_code`), `loading`/`error` refs, and `fetchSettings(countryCode)` (`supabase.from('whatsapp_integration_settings').select('*').eq('country_code', countryCode).maybeSingle()`, RLS is the sole scoping authority)
- [X] T009 [US1] In `src/stores/whatsappIntegration.js`, add `saveCredentials(countryCode, { accessToken, phoneNumberId, webhookVerifyToken })` (`supabase.rpc('save_whatsapp_credentials', { p_country_code: countryCode, p_access_token: accessToken, p_phone_number_id: phoneNumberId, p_webhook_verify_token: webhookVerifyToken })`), on success re-fetches that country's status via `fetchSettings()` (never assumes the returned shape since the RPC returns void)
- [X] T010 [US1] Create `src/components/admin/WhatsAppIntegrationPanel.vue`: a country selector (Super Admin: free-text 2-letter code, lowercased via `.toLowerCase()` before use — matching `ContactFormModal.vue`/`ShelterFormModal.vue`'s existing convention and closing analysis finding I1's other half; country_admin/org_admin: locked to `auth.countryCode`, already lowercase), a form with 3 password-type inputs (access token, phone number ID, webhook verify token) that always starts empty regardless of existing status, a save button calling `saveCredentials()`, and a status display using `formatIntegrationStatus()` ("Yapılandırılmış (son güncelleme: ...)" / "Yapılandırılmamış"); client-side hint that all 3 fields are required (not the sole guard — the RPC's own rejection, T005, is the actual guarantee)
- [X] T011 [US1] In `src/views/AdminView.vue`, add a new "WhatsApp Entegrasyonu" tab importing `WhatsAppIntegrationPanel.vue`, visible to `super_admin`/`country_admin`/`org_admin` only (plain role check via `canCreateUsers` or equivalent existing computed, matching this project's non-capability-gated admin tabs — no viewer access at all, per research.md Decision 4, no new route needed unlike spec 021)

**Checkpoint**: User Story 1 fully functional and independently testable — a Country Admin can
configure their country's credentials and see status without ever seeing the raw values again.

---

## Phase 4: User Story 2 - A country updates or replaces its credentials (Priority: P2)

**Goal**: An admin can overwrite previously saved credentials with new ones.

**Independent Test**: Save new credential values over existing ones; confirm the status's
last-updated timestamp changes and no "already exists" error occurs (quickstart.md Scenario 5).

### Implementation for User Story 2

- [X] T012 [US2] Confirm (by inspection, no code change expected) that `saveCredentials()` (T009) and `save_whatsapp_credentials()` (T005) already handle replacement as the same idempotent upsert path as first-time creation — the `vault.secrets` existence check (T005 step d) and the `ON CONFLICT (country_code) DO UPDATE` (T005 step e) mean no separate "update" code path is needed (research.md Decision 2)
- [X] T013 [US2] In `src/components/admin/WhatsAppIntegrationPanel.vue`, confirm the save button's label/behavior is identical whether the country is already configured or not (no separate "create" vs. "edit" mode in the UI — matches FR-006's "replace" being the same action as FR-001's "create")

**Checkpoint**: Both User Stories 1–2 fully functional — first-time configuration and replacement
both work through the same single save action.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T014 [P] Add i18n keys for the WhatsApp Entegrasyonu admin tab (tab label, field labels: access token/phone number id/webhook verify token, country selector label, configured/not-configured status text, save/cancel actions, validation messages) to all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh)
- [X] T015 In `supabase/functions/dispatch-alert/index.ts`, add a comment-only note near the existing WhatsApp mock-adapter branch: a future iteration would check `vault.decrypted_secrets` for `whatsapp_creds_<country_code>` and call the real WhatsApp Business API if present, falling back to the current mock behavior otherwise — no behavior change in this spec (FR-007)
- [X] T016 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T017 Run `npm run build` and confirm a clean build
- [ ] T018 Manually validate quickstart.md Scenarios 1–6 against a local/staging Supabase instance with the migration applied (first-time configuration, no-redisplay guarantee, incomplete-submission rejection, cross-country rejection, replacement, zero-regression on dispatch) — **pending**: migration `20260707240000_whatsapp_integration_settings.sql` has not yet been applied to the live project; per standing project policy, migrations are never applied by the assistant — the user runs `npx supabase db query -f "supabase/migrations/20260707240000_whatsapp_integration_settings.sql" --linked` themselves, then this scenario validation can proceed
- [X] T019 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Integration & API Gateway module's remaining item is now closed with a corrected scope description — note that the backlog's original "API endpoint config admin UI" wording was stale/misleading (it referred to the already-complete `data_sources` panel), that the PRD's literal API-Key-Issuance and Schema-Enforcement stories were dropped as not applicable to this project (no external API-consumer scenario exists), and that only the WhatsApp credential-storage piece was built — the real API call and inbound webhook receiver remain explicitly deferred

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (table/RLS/RPC function/
  pure function underpin everything)
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **User Story 2 (Phase 4)**: Depends on Foundational and User Story 1's store/panel existing
  (T009/T010) — it verifies/confirms behavior on the same components rather than introducing new
  ones
- **Polish (Phase 5)**: Depends on all user stories being complete

### Parallel Opportunities

- T006/T007 (pure function + its tests) can be scaffolded in parallel, though T007 asserts
  against T006's actual output
- T014 (i18n) can run in parallel with T015/T016/T017

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (table + RLS + `save_whatsapp_credentials()` + status function)
3. Complete Phase 3: User Story 1 (a country configures its own credentials)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–4 — configuration works, values are never
   redisplayed, incomplete submissions and cross-country attempts are rejected

### Incremental Delivery

1. Setup + Foundational → table/RLS/RPC/status logic exist, nothing observable yet
2. Add User Story 1 → validate → a country can configure its own WhatsApp credentials
3. Add User Story 2 → validate → replacing existing credentials works via the same action
4. Polish (i18n, dispatch-alert comment, docs, test/build verification, quickstart validation)

---

## Notes

- No changes to `dispatch-alert`'s actual WhatsApp dispatch behavior — verified by design (T015
  is comment-only) and by the constitution's zero-regression requirement (FR-007)
- Reuses `set_updated_at()`, `log_table_change()`, `current_profile_role()`,
  `current_profile_country_code()`, and the existing Supabase Vault mechanism — zero new secret
  storage mechanism introduced
- No new route/view needed (unlike spec 021's shelters) — this feature is entirely admin-only,
  fitting inside `AdminView.vue`'s existing tab system (research.md Decision 4)
- Migrations are provided as exact CLI commands to the user for manual application once
  implementation is complete
- Commit only when explicitly requested by the user
