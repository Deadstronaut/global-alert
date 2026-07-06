# Implementation Plan: CAP v1.2 Envelope & Export

**Branch**: `014-cap-v12-envelope-export` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-cap-v12-envelope-export/spec.md`

## Summary

`cap_drafts` already has a full four-eyes authoring/approval/broadcast state machine (spec 006),
but no CAP v1.2 envelope fields and no export capability exist anywhere — a genuine, confirmed
constitution violation (Principle III). This plan adds a `sender` column (auto-populated at
insert time via a trigger, mirroring the `is_exercise` auto-set pattern from spec 013), reuses the
existing `id` column as the CAP `identifier` (no new column needed), extends the existing
`guard_cap_draft_transition()` completeness gate to also require `sender` before broadcast, and
adds a pure JS `generateCapXml(draft, supersededDraft)` / `generateCapJson(...)` pair of functions
(tested via Vitest) wired to new "Export XML"/"Export JSON" buttons in `CapView.vue`, visible only
for broadcast-or-later drafts.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), SQL (PostgreSQL/Supabase)

**Primary Dependencies**: existing `cap_drafts` table/trigger (specs 006, 013), Vue 3, vue-i18n.
No XML-building library needed — CAP v1.2's `<alert>` structure is simple enough to build via
template-literal string construction with proper XML-escaping of user-supplied text fields.

**Storage**: PostgreSQL via Supabase — one new column (`cap_drafts.sender`), one new trigger
function. No new table (exports are computed on demand, per spec.md Assumptions).

**Testing**: Vitest for `generateCapXml()`/`generateCapJson()`/`capMsgType()` — this is exactly the
kind of pure, critical business logic (CAP message construction) the constitution's Development
Workflow & Quality Gates names as a non-negotiable test-first zone ("CAP XML validation").

**Target Platform**: Web (existing Vue SPA), `CapView.vue`.

**Performance Goals**: N/A — export is an on-demand, single-alert operation.

**Constraints**: Generated XML MUST include every OASIS CAP v1.2-mandated `<info>` field
(category, event, urgency, severity, certainty, effective, expires, headline, description, area)
and correctly map this project's existing severity/certainty/urgency values (already CAP-aligned
strings per the `cap_drafts` CHECK constraints) directly into the CAP schema's expected values.

**Scale/Scope**: 4 user stories, 1 new column + 1 new trigger + 1 modified existing trigger
function, 1 new pure-JS module + tests, additive UI changes to `CapView.vue`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — CAP export reads `hazard_type` as
  already-stored data; no hazard-type-specific export logic is introduced.
- **Principle II (Scope Discipline)**: PASS — this spec stays within "CAP: authoring, validation,
  and export ONLY" (explicitly named in Principle II); no inbound CAP hub ingestion is introduced.
- **Principle III (CAP v1.2 Compliance)**: PASS — this spec exists specifically to satisfy this
  principle, which the codebase currently violates (no export/validation exists at all). FR-002
  ("block broadcast if envelope missing") directly satisfies "validation MUST block publish, not
  just warn."
- **Principle IV (Data Quality & Normalization)**: N/A — no ingestion pipeline touched.
- **Principle V (Access Control & Auditability)**: PASS — export is a read-only operation on
  already-authorized-to-view drafts (existing `cap_drafts` RLS, unchanged); no new write path, so
  no new audit surface is needed beyond what `log_table_change()` already covers for the new
  `sender` column (covered automatically, whole-row audit).
- **Principle VI (Accessibility & i18n)**: PASS — new UI text (export buttons, exercise-marker
  label in exports) added via vue-i18n keys across all 7 locales.
- **Principle VII (Performance & Resilience)**: PASS — no new polling; export is synchronous,
  on-demand, computed client-side from already-fetched draft data (one extra fetch for the
  superseded draft's own envelope fields, only when Story 4 applies).
- **Principle VIII (Simplicity & YAGNI)**: PASS — no XML-building library dependency added (CAP's
  `<alert>` shape is simple enough for template-literal construction); no new table for storing
  generated exports (computed fresh each time, per spec.md Assumptions).

**Initial gate result**: PASS. No Complexity Tracking entries required.

**Post-Phase-1 re-check**: PASS, unchanged. `data-model.md` and `contracts/cap-export.md` confirm
the additive-only nature of the schema change and the pure-function nature of export generation.

## Project Structure

### Documentation (this feature)

```text
specs/014-cap-v12-envelope-export/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260707170000_cap_envelope.sql        # NEW: cap_drafts.sender column + auto-set trigger +
                                             # extended completeness gate in guard_cap_draft_transition()

src/lib/
└── capExport.js                            # NEW: capMsgType(draft), generateCapXml(draft, superseded),
                                             # generateCapJson(draft, superseded) — pure functions

tests/unit/
└── capExport.test.js                       # NEW: Vitest coverage for all three functions

src/views/
└── CapView.vue                             # MODIFIED: "Export XML"/"Export JSON" buttons on
                                             # broadcast-or-later drafts, fetching the superseded
                                             # draft's envelope fields when supersedes_id is set
```

**Structure Decision**: Extension of the existing single Vue 3 + Supabase application. `capExport.js`
follows the existing `src/lib/` convention already used by `capStateMachine.js` and
`auditExport.js` for this project's other pure business-logic/export modules.

## Complexity Tracking

*No violations — table intentionally omitted.*
