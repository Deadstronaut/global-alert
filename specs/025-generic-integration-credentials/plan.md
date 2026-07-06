# Implementation Plan: Generic Integration Credentials Management

**Branch**: `025-generic-integration-credentials` | **Date**: 2026-07-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/025-generic-integration-credentials/spec.md`

## Summary

Replace spec 022's WhatsApp-only credential system with a general, registry-driven integration
credential system: a global `integration_types` registry (super_admin-managed, WhatsApp seeded as
the first entry) defines each integration's known fields; a generic `save_integration_credentials()`
RPC accepts an arbitrary field map (predefined + admin-added custom fields) and writes it to
Supabase Vault, exactly generalizing spec 022's authorization/case-normalization/Vault-write
pattern. This is a hard cutover — the old WhatsApp-specific table/function/UI are removed entirely,
safe because no production consumer has ever read the old credentials (dispatch-alert's WhatsApp
adapter is still a mock).

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), PL/pgSQL (Postgres migrations)

**Primary Dependencies**: Vue 3, Pinia, vue-i18n, Supabase JS client, Supabase Postgres + Vault
(existing `vault.create_secret`/`vault.update_secret`/`vault.secrets` pattern from spec 019/022)

**Storage**: PostgreSQL via Supabase — two new tables (`integration_types`, `integration_settings`),
one new SECURITY DEFINER function; drops one old table + one old function.

**Testing**: Vitest (`tests/unit/`) — pure-function tests for status formatting and
template/custom-field merging, mock-free.

**Target Platform**: Web (Vite-built SPA), same deployment as the rest of the app.

**Project Type**: Single Vue 3 + Supabase web application (existing repo structure).

**Performance Goals**: No new performance requirements — same request volume/shape as spec 022's
WhatsApp panel, generalized to N integration types instead of 1.

**Constraints**: Zero change to `dispatch-alert`'s WhatsApp mock adapter or its TODO comment; same
Vault secret-write pattern (`create_secret`/`update_secret` existence check) as spec 019/022; hard
cutover with no data migration (justified — no real credentials exist in production yet).

**Scale/Scope**: 1 seeded integration type (WhatsApp) at launch; registry designed to hold more
without further migrations, per FR-001/SC-004.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (model-driven, minimal code change per new type)**: PASS — this spec's entire
  purpose is fixing a Principle I-style violation risk (a hardcoded, single-integration form) by
  moving to a registry + field-template model, mirroring `hazard_types` (spec 010).
- **Security**: PASS — credential values are still write-only (never read back to any client),
  still routed through a single SECURITY DEFINER function, still stored only in Supabase Vault, and
  authorization rules (super_admin any country; country/org admin own country only) are preserved
  unchanged from spec 022. No new attack surface beyond spec 022's already-reviewed pattern.
- **Simplicity/YAGNI**: PASS — no UI for admins to define brand-new integration types (out of
  scope per spec, store function exists but unused by UI); no schema-based per-field validation
  beyond non-blank; hard cutover instead of maintaining two parallel systems.
- **Testing**: PASS — pure functions for status formatting and field-merging logic are unit
  tested, matching this project's established pattern.

No violations. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/025-generic-integration-credentials/
├── plan.md
├── research.md
├── data-model.md
├── contracts/
│   └── integration-credentials.md
├── quickstart.md
└── tasks.md              # /speckit-tasks output (not yet created)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260708010000_generic_integration_credentials.sql   # new: integration_types,
                                                            # integration_settings,
                                                            # save_integration_credentials(),
                                                            # DROP old whatsapp-specific objects

src/stores/
├── integrationTypes.js       # NEW — registry store (mirrors hazardTypes.js)
├── integrationSettings.js    # NEW — replaces whatsappIntegration.js
└── whatsappIntegration.js    # DELETED

src/components/admin/
├── IntegrationsPanel.vue     # NEW — replaces WhatsAppIntegrationPanel.vue
└── WhatsAppIntegrationPanel.vue  # DELETED

src/views/
└── AdminView.vue             # tab renamed "💬 WhatsApp Entegrasyonu" → "🔌 Entegrasyonlar",
                                 # mounts IntegrationsPanel.vue instead

src/i18n/locales/*.json       # 7 files: whatsappIntegration.* keys replaced by integrations.* keys

tests/unit/
├── integrationSettings.test.js   # NEW — replaces whatsappIntegrationStatus.test.js
└── whatsappIntegrationStatus.test.js  # DELETED
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repo layout). This is a
replace-in-place of spec 022's files, not an additive extension — old WhatsApp-specific files are
deleted, matching the spec's explicit "hard cutover" requirement (FR-010).

## Complexity Tracking

*No entries — no Constitution Check violations.*
