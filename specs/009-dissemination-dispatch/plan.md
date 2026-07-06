# Implementation Plan: Dissemination & Contact Directory

**Branch**: `009-dissemination-dispatch` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-dissemination-dispatch/spec.md`

## Summary

CAP alerts (spec 006) currently reach `broadcast` status and stop — nothing sends them anywhere. This plan adds: (1) a country/org-scoped `contacts` directory (admin CRUD + CSV bulk import, reusing the existing user-provisioning RBAC and file-import patterns); (2) an automatic dispatch pipeline, triggered by a Postgres trigger the moment a CAP draft reaches `broadcast` (not `approved` — see research.md §1 for why), that emails matching contacts through a swappable provider (Resend by default) and queues a WhatsApp mock send; (3) `dispatch_jobs`/`dispatch_receipts` state machines modeled on the existing `data_sources` health-state pattern, with partial-failure tolerance and an Operator-triggered retry; (4) an unauthenticated Public Alert Portal listing only `broadcast`, non-expired alerts.

## Technical Context

**Language/Version**: JavaScript/Vue 3 (Composition API) frontend; TypeScript (Deno) Edge Functions backend — same as the rest of this repo, no new language introduced.

**Primary Dependencies**: Existing stack only (Vue 3, Pinia, Vite, Supabase JS client) plus one new Postgres extension: `pg_net` (for the DB trigger → Edge Function call, research.md §1) and one new external service dependency: an email provider API (Resend, swappable to SendGrid — research.md §2). No new npm packages required.

**Storage**: PostgreSQL via Supabase — 3 new tables (`contacts`, `dispatch_jobs`, `dispatch_receipts`), no new database technology.

**Testing**: Vitest, extending the existing `supabase/functions/shared/*.test.ts` convention (research.md §6) plus the existing `src/utils/fileParsers` test coverage for CSV import.

**Target Platform**: Same as existing app — browser (Vue SPA) + Supabase-hosted Postgres/Edge Functions (Deno runtime).

**Project Type**: Web application (existing single Vue frontend + Supabase backend — no new project/service is introduced).

**Performance Goals**: Dispatch to a modest recipient list (tens to low hundreds of contacts per country in this phase) completes within a few minutes (spec SC-001); no hard real-time SLA (assumption in spec.md).

**Constraints**: One recipient/channel failure MUST NOT abort the batch (FR-010); public portal must not require authentication (FR-013); no contact data may cross country/org RBAC boundaries (FR-002, SC-006).

**Scale/Scope**: 3 new tables, 1 Edge Function (`dispatch-alert`, two invocation modes), 1 new admin tab (Contacts), 1 new admin panel (Dispatch monitor), 1 new public route (Portal). No changes to existing CAP authoring UI beyond leaving its `broadcast` transition as-is (the trigger observes it, does not require the client to change).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. `contacts.hazard_type_filter` is a plain data column (nullable = "all hazards"); adding a new hazard type requires no change to dispatch logic.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. Dissemination is limited to Email + WhatsApp (mock) + Web Portal, exactly the constitution's allowed channel list; no SMS/push/siren is introduced. No public self-registration is added (FR-015) — contacts remain strictly admin-provisioned, consistent with this project's already-completed removal of self-registration. CAP inbound-hub scope is untouched.
- **III. CAP v1.2 Compliance** — PASS / not applicable to this feature. This spec consumes already-validated, already-`broadcast` CAP drafts; it does not add a new CAP authoring or export code path, so no new compliance surface is introduced.
- **IV. Data Quality & Normalization** — PASS. Not a disaster-data ingestion feature; no `DisasterEvent` normalization applies. Contact data has its own validation (E.164 check, required-channel check, CSV per-row validation) per FR-003/FR-016.
- **V. Access Control & Auditability** — PASS. Contacts, dispatch_jobs, and dispatch_receipts all get the standard RBAC tiers (super_admin / country_admin / org_admin scoping) and the standard `log_table_change()` audit trigger, matching spec 002/004/007's already-established pattern. There is no separate "Auditor" role (`profiles.role` only contains `super_admin`/`country_admin`/`org_admin`/`viewer`) — cross-tenant compliance visibility is a `super_admin` capability, exactly as spec 007's Audit & Compliance viewer already established; Story 3/contract Mode B use only real roles.
- **VI. Accessibility & Internationalization** — PASS, with an explicit task requirement: the Contacts tab, Dispatch panel, and Public Portal MUST use the i18n system (no hardcoded strings) and remain usable in dark/light/high-contrast modes, same as every other admin screen. Email templates should support `preferred_language`, reusing the multi-lingual template idea already present in `cap_drafts.translations` (best-effort; a single-language template per send is an acceptable v1 simplification, not a violation, since the constitution's requirement targets the *application UI*, not third-party email body content).
- **VII. Performance & Resilience by Design** — PASS. Batch dispatch explicitly tolerates partial failure (FR-010) and offers retry (FR-011); this is the same resilience posture as the existing data-source polling health-state machine, applied to a new domain.
- **VIII. Simplicity & YAGNI** — PASS, with one flagged new dependency: `pg_net` (a Postgres extension, not a new service) and one new external API dependency (email provider). Both are recorded and justified in Complexity Tracking below, since they are additions beyond "pure Supabase Postgres + Edge Functions with zero third-party calls."

## Project Structure

### Documentation (this feature)

```text
specs/009-dissemination-dispatch/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── dispatch-alert.md
│   └── contacts-crud.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This feature extends the existing single Vue+Supabase project — no new project/service directory is created.

```text
supabase/
├── migrations/
│   ├── <ts>_contacts.sql                       # table + RLS + audit trigger
│   ├── <ts>_dispatch_jobs_and_receipts.sql     # both tables + RLS + audit + state-machine guard trigger
│   └── <ts>_cap_broadcast_dispatch_trigger.sql # pg_net extension + AFTER UPDATE trigger on cap_drafts
└── functions/
    ├── dispatch-alert/
    │   └── index.ts                            # both invocation modes (research.md §5)
    └── shared/
        ├── emailProviders/
        │   ├── resend.ts
        │   └── sendgrid.ts                     # only if/when swapped in
        ├── dispatchMatching.ts / .test.ts       # recipient-matching predicate
        └── dispatchStateMachine.ts / .test.ts   # DispatchJob/DispatchReceipt transition guards

src/
├── views/
│   └── PublicPortalView.vue                    # new, unauthenticated route
├── components/admin/
│   ├── ContactsPanel.vue                       # new tab content in AdminView.vue
│   ├── ContactFormModal.vue
│   └── DispatchPanel.vue                       # job/receipt monitor + retry button
├── stores/
│   └── contacts.js                             # new Pinia store (list/filter/CRUD), mirrors sources store shape
├── utils/
│   └── fileParsers.js                          # extended: contacts field map for CSV import (no new file)
└── router/
    └── index.js                                # + one new `meta: { public: true }` route for the portal
```

**Structure Decision**: Single existing Vue+Supabase project, extended in place — no new frontend/backend split, no new service. New admin UI is added as an additional tab inside the existing `AdminView.vue` (same pattern as the Contacts/Sources/Boundary tabs already there), and one new top-level public route for the portal.

## Complexity Tracking

> Two additions go beyond "pure Supabase Postgres + Edge Functions, zero third-party calls" and are recorded here per Principle VIII.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `pg_net` Postgres extension (DB trigger calling an Edge Function over HTTP) | Dispatch must fire reliably the instant a CAP draft reaches `broadcast`, regardless of which code path performs that update (research.md §1) | Relying on the client to call an Edge Function right after its own status update was rejected — it makes dispatch skippable/bypassable by any other future caller of the same UPDATE, which is exactly the kind of implicit trust this project's RBAC/audit work has been removing elsewhere |
| Outbound call to a third-party email provider (Resend) | Actually delivering an email requires an SMTP/API relay; Supabase does not provide one natively | Rejected building/self-hosting an SMTP relay — far more infrastructure than a single authenticated `fetch()` call from an Edge Function, for no additional benefit at this scale |
