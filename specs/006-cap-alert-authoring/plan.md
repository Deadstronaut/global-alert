# Implementation Plan: CAP Alert Authoring

**Branch**: `006-cap-alert-authoring` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-cap-alert-authoring/spec.md`

## Summary

This is a **hardening/completion** effort on an existing feature, not a greenfield build: `cap_drafts`
(schema, state machine, RLS, audit trigger) and `CapView.vue` (list + create-draft UI) already exist
in the codebase, predating this spec. The gaps closed here: (1) a four-eyes rule preventing
self-approval — the most safety-critical gap, since the current implementation lets any
org_admin/country_admin/super_admin push their own draft through every status; (2) linking a new
draft to an existing detected hazard event for pre-fill, currently only a blank form; (3)
database-level immutability of `broadcast` drafts (currently editable forever); (4) a mandatory
reason on cancel/reject, visible to the author; (5) i18n for `CapView.vue`'s currently-hardcoded
Turkish text, across all 7 locales; (6) an optimistic-concurrency guard on status transitions
(currently an unconditional `UPDATE`). Org/country RLS scoping already exists (spec 004) and is
unchanged.

## Technical Context

**Language/Version**: JavaScript/Vue 3 `<script setup>` (frontend), PL/pgSQL (migration) — no Edge Function needed, all changes are RLS/trigger/column-level plus frontend logic against the existing `supabase-js` client

**Primary Dependencies**: `@supabase/supabase-js` v2.97.0 (already in use), Vue Router 4, Pinia, vue-i18n (existing i18n system)

**Storage**: Supabase-hosted PostgreSQL — additive changes to the existing `cap_drafts` table (new columns: `source_event_id`, `rejection_reason`/`cancellation_reason`, an immutability trigger) plus updated RLS policies; no new tables

**Testing**: Vitest (frontend state-machine/four-eyes pure-logic unit tests, extracted per the established `supabase/functions/shared/*.ts`-style pure-function pattern but colocated in `src/` since this logic runs client-side against Supabase directly, no Edge Function); manual RLS verification via `quickstart.md` (consistent with prior specs, since this repo has no pgTAP harness)

**Target Platform**: Existing Vue 3 SPA + Supabase Postgres — no new platform

**Project Type**: Web application (existing single frontend + Supabase backend, no new project structure)

**Performance Goals**: N/A — authoring/review is a low-frequency admin workflow, not a hot path

**Constraints**: Must not rename/drop any existing `cap_drafts` column or status value (unknown whether the table holds real production data, per clarification — treat as potentially live); the four-eyes check and the broadcast-immutability check must be enforced at the database level (RLS/trigger), not only in the Vue UI, since `CapView.vue` currently calls `supabase.from('cap_drafts').update(...)` directly with no server-side authorization function standing between the client and the table

**Scale/Scope**: Same user base as specs 004/005 — no scale change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: `cap_drafts.hazard_type` is already a free-text column (not an enum tied to code branches per hazard) — this feature adds no hazard-specific logic. PASS.
- **Principle II (Scope Discipline)**: This feature stops at producing a finalized (`broadcast`) CAP-aligned record — no dissemination (email/WhatsApp/web push/SMS) is added, consistent with the constitution's channel boundary and this spec's explicit out-of-scope declaration (FR-013). CAP authoring/validation is explicitly in-scope per Principle II's own carve-out ("CAP: authoring, validation, and export ONLY"). PASS.
- **Principle III (CAP v1.2 Compliance)**: The existing schema maps to CAP's mandatory `<info>` fields (category≈hazard_type, event, urgency, severity, certainty, headline≈title, description, area≈area_desc) but does not yet enforce validation before a status-changing action, nor does an actual CAP XML/JSON export function exist. This plan's Phase 1 design MUST include a validation step gating the `pending_approval` and `broadcast` transitions (FR-004, FR-010) and a `references`-carrying `cancel` path — full CAP XML export is noted as a task but the payload format itself is scoped to "produces a spec-compliant CAP-aligned record," not a hard requirement to emit XML (JSON export is an acceptable v1 implementation per Assumptions). PASS with note: tasks.md must include an explicit CAP-field-completeness validation task, since it does not exist today despite Principle III requiring it.
- **Principle IV (Data Quality & Normalization)**: N/A — no ingestion pipeline touched; `cap_drafts` is authored content, not an ingested `DisasterEvent`. PASS.
- **Principle V (Access Control & Auditability)**: Directly advances this principle — the four-eyes rule and the mandatory-reason-on-reject/cancel are new access-control/auditability guarantees; both wired through the existing `audit_log`/`log_table_change()` trigger already attached to `cap_drafts` (no new logging code needed for standard column changes — only the immutability/four-eyes *rejections* need an explicit path, which naturally surface as failed writes with no audit row, which is correct: a blocked action didn't happen, so nothing to log for cap_drafts itself, though the attempt could optionally be logged — deferred as non-blocking, see research.md). PASS.
- **Principle VI (Accessibility & i18n)**: `CapView.vue` currently has 100% hardcoded Turkish UI text — this is a real, pre-existing gap this feature MUST close for all text it touches, adding full i18n keys across all 7 locales. Unlike spec 004's grandfathered AdminView.vue precedent, this feature both touches and meaningfully extends CapView.vue, so it does not get a partial pass. PASS (with i18n as an explicit, non-optional task).
- **Principle VII (Performance & Resilience)**: N/A — no polling/map-rendering path touched. PASS.
- **Principle VIII (Simplicity & YAGNI)**: All changes are additive Postgres (RLS policies, one immutability trigger, new nullable columns) plus Vue component logic — no new service, queue, or Edge Function. A four-eyes check could theoretically be done purely in the RLS `USING`/`WITH CHECK` clause (comparing `created_by`/`last_edited_by` to `auth.uid()`), avoiding any new Edge Function — this is the chosen approach. PASS.

**Result**: PASS. One explicit new obligation flagged for tasks.md: a CAP-field-completeness validation gate (Principle III) does not exist today and must be added as part of this feature, not assumed already covered by the existing form's client-side `required` attributes (which are absent — see `CapView.vue`'s `submitDraft()`, which only checks `title.trim()`).

## Project Structure

### Documentation (this feature)

```text
specs/006-cap-alert-authoring/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

Existing single Vue 3 + Supabase project — no new top-level directories.

```text
src/
├── views/CapView.vue                    # MODIFY — i18n, source-event pre-fill picker, four-eyes-
                                          #   aware transition buttons (hide approve/reject for own
                                          #   drafts), mandatory reason prompt on reject/cancel,
                                          #   read-only rendering for broadcast drafts
├── stores/                              # (no new store — CapView.vue already calls supabase
                                          #   directly; extracting pure logic per constraints below)
└── i18n/locales/*.json                  # new `cap` key block, all 7 locales

supabase/
└── migrations/
    └── <timestamp>_cap_drafts_hardening.sql  # NEW — additive columns (source_event_id,
                                                #   rejection_reason, cancellation_reason,
                                                #   last_edited_by), four-eyes RLS check on the
                                                #   existing approval-capable UPDATE policies,
                                                #   broadcast-immutability trigger, status-transition
                                                #   guard function
```

**Structure Decision**: Single existing project — no new services. Four-eyes and status-transition-
guard logic is enforced in Postgres (RLS `WITH CHECK` + a `BEFORE UPDATE` trigger function), not a
new Edge Function, per Principle VIII — the existing `cap_drafts` table is written to directly from
the browser client (anon/authenticated key) today, so the database is the only enforcement point
that cannot be bypassed by a modified frontend. Pure state-machine transition-validity logic (which
statuses can move to which) is extracted to a small `src/lib/capStateMachine.js` module so it can be
unit-tested with Vitest without mocking Supabase, mirroring the `supabase/functions/shared/*.ts`
pure-logic-extraction pattern already established for Edge Functions in specs 004/005.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
