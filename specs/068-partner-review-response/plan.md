# Implementation Plan: Partner Review Response Bundle

**Branch**: `068-partner-review-response` | **Date**: 2026-08-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/068-partner-review-response/spec.md`

## Summary

Ship the safe subset of the MHEWS partner-review feedback that doesn't depend on unresolved architecture decisions (deployment model, full role taxonomy, 2D/3D parity, data ingestion limits, map control placement): (1) 2D layer panel consolidation with active-only legend/controls, (2) SOP document file upload reusing the existing AI-summary flow, (3) CAP warning radius UI exposure for an already-existing DB column, (4) district-level (ADM2) impact analysis by wiring an already-supported `loadRegionBoundaries(code, 'district')` parameter, (5) Contact Directory copy clarification, and (6) relocating Scenario Modeling under Impact Analyzer as a navigation-only change with access level frozen as-is (role-based restriction explicitly deferred to a follow-up spec once the partner confirms the role taxonomy).

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`), TypeScript for Deno Edge Functions

**Primary Dependencies**: Vue 3, Pinia, Vite, Leaflet, vue-i18n, shadcn-vue (`ui/collapsible` already installed), Supabase JS client

**Storage**: Supabase Postgres (existing `sop_documents`, `cap_drafts`, `country_boundaries` tables) + Supabase Storage (new private bucket for SOP file uploads, following the existing bucket-per-purpose convention)

**Testing**: No existing automated test runner detected in this codebase for Vue components; per Constitution Development Workflow, automated tests are only mandatory for deduplication rules, severity mapping, CAP XML validation, and proximity calculations — none of which this feature touches directly except CAP form validation (radius), which gets a lightweight inline check consistent with existing patterns (no new test framework introduced)

**Target Platform**: Web (existing Capacitor-wrapped Vue SPA), 2D Map View only for the layer-panel work (3D/Globe View explicitly untouched)

**Project Type**: Single Vue 3 SPA frontend + Supabase backend (existing structure, no new project/service)

**Performance Goals**: No new performance targets beyond existing app behavior; collapsed-by-default panel must not introduce a rendering regression on layer toggle (reuse existing `v-if`/`Transition` patterns already in MapView.vue)

**Constraints**: SOP upload MUST enforce a max file size and MIME-type allowlist (PDF, DOCX) at both client and storage-policy level; radius input MUST reject non-positive values before save; district-level impact analysis MUST degrade gracefully (clear "not available" state) for countries without bundled/DB district boundary data rather than silently mis-scoping results

**Scale/Scope**: 6 independently-shippable user stories (7b explicitly out of scope/deferred) touching ~6 existing Vue components, 1 new Supabase Storage bucket + RLS policy, 1 new nullable column on `sop_documents`, no new tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. No hazard-type-specific logic is introduced; layer panel consolidation is purely structural/UI, and radius/district features apply uniformly across hazard types.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. No new dissemination channel, no external identity federation, no inbound CAP hub ingestion. SOP file upload uses Supabase Storage (already in-stack), not a new external service.
- **III. CAP v1.2 Compliance** — PASS / reinforced. Exposing `radius_km` in the CAP authoring UI does not change CAP v1.2 export structure (the field is already an optional `<info>` extension in the existing export path); validation before publish already blocks malformed drafts and will be extended with a simple positive-number check on radius.
- **IV. Data Quality & Normalization** — N/A. No new external disaster/hazard data source is introduced.
- **V. Access Control & Auditability** — PASS with a deliberate scope cut, recorded below. Story 7 (relocation) explicitly preserves current access as-is; Story 7b (role-based restriction + RLS) is deferred out of this plan/spec entirely rather than half-built, per user direction, to avoid building RLS against a role taxonomy likely to change. SOP upload reuses the *existing* `sop_documents` RLS policy (super_admin/country_admin/org_admin write access per `20260707140100_sop_documents.sql:33-36`) for the new storage bucket, so auditability of who can write SOP content is unchanged, just extended to cover file uploads.
- **VI. Accessibility & Internationalization** — PASS, must-carry requirement. All new/changed UI strings (layer panel section labels, SOP upload control, radius field label, district-level selector option, Contact Directory copy) MUST go through the existing i18n system (`vue-i18n`, same pattern as `contacts.tabLabel`) across all 7 supported locales, not hard-coded.
- **VII. Performance & Resilience by Design** — PASS. Collapsed-by-default accordion reduces initial render work versus today's always-visible floating panels; no change to polling intervals or offline-cache behavior.
- **VIII. Simplicity & YAGNI** — PASS. SOP file upload uses direct client-to-Supabase-Storage upload (`supabase.storage.from(...).upload(...)`) gated by a storage RLS policy — no new Edge Function, no new service, reusing the Supabase-native pattern already established for other buckets (even though existing buckets happen to be written server-side, direct client upload with RLS is the standard, simplest Supabase pattern and avoids introducing an Edge Function purely to move bytes). District-level impact analysis reuses an already-existing, already-parameterized function (`loadRegionBoundaries(code, 'district')`) — zero new backend surface. Layer panel consolidation reuses the already-installed shadcn-vue `ui/collapsible` primitive instead of hand-rolling another accordion (there are already two competing hand-rolled patterns in the codebase — this avoids a third).

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/068-partner-review-response/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not yet created)
```

### Source Code (repository root)

```text
src/
├── components/
│   ├── SidebarPanel.vue                 # MODIFY: legend gated per-layer-active; adopt shared collapsible sections
│   ├── MapView.vue                      # MODIFY: extract shelters/exposure/WMS-WFS inline panels into the unified 2D layer panel structure
│   ├── FlowControlPanel.vue             # MODIFY: Wind & Current group folded into the unified panel (2D only)
│   ├── ui/collapsible/                  # REUSE (existing shadcn-vue primitive, no changes)
│   ├── admin/
│   │   ├── SopDocumentFormModal.vue     # MODIFY: add file upload control + validation
│   │   ├── ContactsPanel.vue            # MODIFY: header copy only (i18n key content)
│   ├── impact/
│   │   └── ImpactPanel.vue              # MODIFY: add district (ADM2) option to admin-level selector; add Advanced/Scenario Modeling sub-mode entry point
│   ├── risk/
│   │   └── ScenarioBuilder.vue          # MODIFY: rendered from within ImpactPanel's advanced mode instead of AdminView top level
├── views/
│   ├── CapView.vue                      # MODIFY: add Warning Radius (km) field + validation
│   └── AdminView.vue                    # MODIFY: remove top-level ScenarioBuilder mount (moved into ImpactPanel)
├── data/boundaries/index.js             # REUSE (already supports 'district' level, no change needed)
├── i18n/                                # MODIFY: add/update keys for all new or changed UI strings, all 7 locales
└── locales/... (or wherever the 7 locale files live)

supabase/
├── migrations/
│   ├── <new>_sop_documents_attachment.sql   # NEW: nullable attachment_path/attachment_name/attachment_type columns on sop_documents
│   └── <new>_sop_documents_storage_bucket.sql # NEW: sop-documents private bucket + RLS policy mirroring existing sop_documents write policy
```

**Structure Decision**: Single existing Vue 3 SPA + Supabase backend, no new services/projects. All changes are modifications to existing components/views plus two additive (non-breaking) Supabase migrations. No contracts/ directory generated — this feature has no new external API surface; the Supabase schema changes are documented in data-model.md instead, which serves as the contract for this internal-only feature.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
