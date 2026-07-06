# Implementation Plan: Per-Country WhatsApp Integration Credentials

**Branch**: `022-whatsapp-integration-credentials` | **Date**: 2026-07-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-whatsapp-integration-credentials/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add a country-scoped, write-only credential management feature so each country/customer this
system is delivered to can enter its own WhatsApp Business API integration credentials (access
token, phone number ID, webhook verification token) rather than the system carrying a single
shared/hardcoded credential. Credential values are stored exclusively in Supabase Vault, written
and read only through a single `SECURITY DEFINER` SQL function that enforces the same
role/country authorization as every other admin-scoped entity in this project; a lightweight
metadata table tracks only configured/not-configured status and last-updated time, never the
values themselves. The existing simulated WhatsApp dispatch behavior in `dispatch-alert` is
explicitly unchanged — this spec only prepares the credential storage, not the real API call or
inbound webhook receiver, both deferred to a later iteration that requires an actual WhatsApp
Business account to build against.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), PostgreSQL/PLpgSQL (Supabase)

**Primary Dependencies**: Vue 3, Pinia, vue-i18n, Supabase JS client; PostgreSQL RLS, Supabase
Vault (`vault.create_secret`/`vault.update_secret`/`vault.secrets`), `current_profile_role()`/
`current_profile_country_code()` helper functions (spec 004/010)

**Storage**: PostgreSQL via Supabase — a new `whatsapp_integration_settings` metadata table (no
secret values) plus Supabase Vault for the actual credential JSON, one secret per country

**Testing**: Vitest (`tests/unit/`) for the pure status-formatting function, matching the
project's existing pure-function-extraction test convention

**Target Platform**: Web (admin panel, existing `AdminView.vue` tab system — admin-only, no
viewer-facing surface, unlike spec 021's shelters)

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project type)

**Performance Goals**: N/A — a low-frequency admin configuration action, not a hot path

**Constraints**: Credential values MUST NEVER be returned to any client, in any response, at any
time after being saved — enforced at the database function level, not just by UI omission. Only
one `SECURITY DEFINER` function may write to Vault for this feature (mirrors spec 019's read-only
Vault access pattern, extended here to a controlled write path). `dispatch-alert`'s existing
simulated WhatsApp behavior must not change in this iteration (zero regression, FR-007).

**Scale/Scope**: One new table, one new SQL function, one new Pinia store, one new admin UI
section, one pure function + its test, i18n keys across 7 locales, one comment-only edit to
`dispatch-alert/index.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: N/A — no hazard taxonomy touched. PASS.
- **II. Scope Discipline**: WhatsApp is an explicitly in-scope dissemination channel (Principle
  II). This feature only stores credentials for that already-approved channel; it does not add a
  new channel, new identity system, or CAP inbound ingestion. PASS.
- **III. CAP v1.2 Compliance**: N/A — untouched. PASS.
- **IV. Data Quality & Normalization**: N/A — not a disaster-event data source. PASS.
- **V. Access Control & Auditability**: Country-scoped write access reuses
  `current_profile_role()`/`current_profile_country_code()`; every credential save is auditable
  via the existing `updated_by`/`updated_at` metadata columns (a full `audit_log` trigger on the
  metadata table is also reused, matching every other admin-managed table). Credential values
  themselves are deliberately excluded from any audit trail or query surface — this is a
  stronger-than-usual confidentiality guarantee, not a gap. PASS.
- **VI. Accessibility & Internationalization**: New UI text goes through the existing i18n system
  across all 7 locales. PASS.
- **VII. Performance & Resilience by Design**: N/A — admin-entered configuration data, not a
  polled source or offline-cache concern. PASS.
- **VIII. Simplicity & YAGNI**: Reuses the existing Supabase Vault mechanism (no new secret store
  or KMS integration); explicitly defers the real WhatsApp API call and inbound webhook receiver,
  and drops API Key Issuance/Schema Enforcement entirely as not applicable to this project's
  actual usage (no external API-consumer scenario exists) — smallest change that satisfies this
  iteration's acceptance criteria. PASS.

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/022-whatsapp-integration-credentials/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260707240000_whatsapp_integration_settings.sql   # new: metadata table, RLS,
                                                        # save_whatsapp_credentials() SECURITY
                                                        # DEFINER function (Vault read/write)

src/stores/
└── whatsappIntegration.js            # new: fetchSettings(), saveCredentials(),
                                       # formatIntegrationStatus() pure function

src/components/admin/
└── WhatsAppIntegrationPanel.vue      # new: country-scoped credential entry form + status display

src/views/
└── AdminView.vue                     # modified: new "WhatsApp Entegrasyonu" tab (admin-only)

src/i18n/locales/
└── {tr,en,es,fr,ru,ar,zh}.json       # modified: new whatsappIntegration.* keys

supabase/functions/dispatch-alert/
└── index.ts                          # modified: comment-only TODO note, no behavior change

tests/unit/
└── whatsappIntegrationStatus.test.js # new: formatIntegrationStatus() tests
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repository layout, no new
project/package). Unlike spec 021 (shelters), this feature is entirely admin-only — no
viewer-accessible route is needed, so it fits inside `AdminView.vue`'s existing tab system without
the routing complication spec 021 required.

## Complexity Tracking

*No Constitution violations — table not applicable.*
