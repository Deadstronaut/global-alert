# Implementation Plan: Live Flight & Ship Tracking

**Branch**: `072-live-flight-ship-tracking` | **Date**: 2026-08-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/072-live-flight-ship-tracking/spec.md`

## Summary

Add a real-data "live traffic" layer to the 3D globe showing currently-in-flight aircraft
(OpenSky Network, free anonymous tier) as a new toggle in the existing right-side globe layer
dock, defaulting off like the other six layers. Ship/AIS tracking is the same shape of feature
but has no viable free/anonymous data source (see Research) — it is scoped as a follow-up once
a provider/credential decision is made, not blocked from this plan's aircraft delivery. The
top-left 2x2 quick-access icon grid (radar badge, screenshot control, shelters toggle, new
flight/ship toggle) is a small layout change on top of existing controls, no new state beyond
the flight layer toggle itself.

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`, existing app) + TypeScript (Deno, Supabase Edge Functions)

**Primary Dependencies**: globe.gl / three-globe (existing, used for all other globe layers), Pinia (existing `ui.js` store pattern), Supabase Edge Functions runtime (existing `supabase/functions/shared/*` conventions)

**Storage**: N/A — live aircraft positions are ephemeral (fetched, displayed, replaced on next refresh), not written to `hazard_events` or any table. Matches spec Assumption that no new persisted entity is introduced.

**Testing**: Vitest (existing project test runner, `npm run test`)

**Target Platform**: Web (existing globe view, all supported browsers/locales)

**Project Type**: Web application (single existing Vue app + Supabase Edge Functions backend — no new project/service)

**Performance Goals**: Aircraft markers refresh at least once per minute on the globe (SC-002); globe interaction (rotate/zoom) stays smooth with the layer on (SC-005), consistent with the other six layers' client-side-only cost.

**Constraints**: OpenSky Network anonymous REST API — 400 daily request credits, 10s position resolution, no auth required (see Research). This budget is shared across *all* users of one deployment's edge function (self-hosted-per-country model), not per-browser — the edge function MUST cache upstream responses and serve cached data to the frontend, refreshing upstream far less often than the frontend polls.

**Scale/Scope**: One new Supabase Edge Function (`fetch-live-flights`), one new globe layer + dock toggle in `GlobeView.vue`, one new `ui.js` toggle (`showFlights`), a small top-left 2x2 icon grid layout change reusing three existing controls. Ship/AIS tracking explicitly out of this plan's implementation scope pending a data-source decision (see Research) — spec's User Story 1 acceptance for "ships" is not delivered by this plan; a follow-up spec/plan increment will cover it once a provider is chosen.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — N/A to this feature; flight/ship positions are not `DisasterEvent`s and deliberately don't reuse that model (see Storage above). PASS.
- **II. Scope Discipline** — Dissemination channels, identity, and CAP scope are untouched. Adding a live external data source is new, but is consumed via the existing Supabase Edge Function pattern (`supabase/functions/*`), not a new backend service. PASS.
- **III. CAP v1.2 Compliance** — N/A, no CAP messages involved. PASS.
- **IV. Data Quality & Normalization** — This feature does NOT feed `DisasterEvent`/`hazard_events`, so the dedup/normalization rule doesn't apply structurally; however the spec's own FR-004/FR-007 impose an equivalent discipline (no fabricated data, visible staleness indicator) as this feature's version of that principle's intent. PASS (by analogous requirement, not the literal DisasterEvent pipeline).
- **V. Access Control & Auditability** — No new role/permission introduced (spec Assumption); the layer is visible to whoever can already see the globe. No security-relevant action (login/edit/publish/role-change) is involved, so no new audit event is required. PASS.
- **VI. Accessibility & Internationalization** — New dock button and hover-card text MUST go through the existing `vue-i18n` system (all 7 locales), matching how the other six dock buttons were done. PASS (tracked as a task).
- **VII. Performance & Resilience by Design** — Refresh cadence is differentiated (aircraft: ~60s frontend poll against a server-side cache, not per-hazard-type since this isn't a hazard) and the layer MUST show a visible stale/unavailable state on fetch failure rather than freeze or fabricate (spec FR-007) — matches the offline/degrade-gracefully principle in spirit. PASS.
- **VIII. Simplicity & YAGNI** — Stays Supabase-based (one new Edge Function, no new service/queue/DB). Ship/AIS tracking is deliberately NOT attempted with a paid/complex integration in this increment — smallest change that satisfies what's actually deliverable now. PASS.

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/072-live-flight-ship-tracking/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/functions/
├── fetch-live-flights/
│   └── index.ts                    # NEW — proxies + caches OpenSky /states/all
├── shared/
│   └── cors.ts                     # existing, reused

src/
├── components/
│   └── GlobeView.vue               # MODIFIED — new flights layer + dock button
├── stores/
│   └── ui.js                       # MODIFIED — new showFlights toggle
├── i18n/locales/*.json             # MODIFIED — new dock button label, 7 locales
└── components/layout/
    └── (top-left 2x2 grid host — exact file identified in Phase 0 research)
```

**Structure Decision**: Single existing web app + existing Supabase Edge Functions backend. No
new project. Follows the same file layout every other `072`-series globe layer used (spec 072's
predecessor work all lived in `GlobeView.vue` + `ui.js` + locale files); the only new piece is
one small Edge Function, mirroring existing `fetch-*` functions' shape minus the `hazard_events`
write step.

## Post-Design Constitution Re-Check

Re-verified after Phase 1 (data-model.md, contracts/, quickstart.md): no new violations
introduced. The shared `QuickAccessGrid.vue` component (research.md §4) is a UI consolidation,
not a new backend/service, so Principle VIII still holds. The `preserveDrawingBuffer: true`
renderer option is a client-side rendering config change only. All eight principles remain PASS.

## Complexity Tracking

*No Constitution Check violations — table intentionally empty.*
