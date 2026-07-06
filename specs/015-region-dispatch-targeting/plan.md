# Implementation Plan: Region-Scoped Dissemination Targeting

**Branch**: `015-region-dispatch-targeting` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/015-region-dispatch-targeting/spec.md`

## Summary

Close the "polygon/geofence targeting" gap in Dissemination without adopting PostGIS: `contacts.region_code` already
exists and is collected via the admin UI, but `dispatchMatching.ts`'s `matchesContact()` only checks `country_code` +
`hazard_type_filter`. This feature adds an optional `region_code` to `cap_drafts`, threads it through the dispatch
Edge Function's matching call (which currently constructs a narrowed `draftForMatching` object that drops
`region_code` even though the underlying row has it), and extends `matchesContact()` with an additive,
never-excluding region check: a contact is only skipped for region mismatch if *both* sides have a region recorded
and they differ (case-insensitive, trimmed). Absence of a region on either side is always a match, preserving 100%
of current behavior for every existing draft/contact.

## Technical Context

**Language/Version**: TypeScript (Deno, Supabase Edge Functions) for dispatch matching; JavaScript (Vue 3
Composition API, `<script setup>`) for the authoring UI; SQL (PostgreSQL 15, Supabase) for the migration.

**Primary Dependencies**: Supabase JS client (Edge Function + frontend), Vue 3, Pinia, Vitest (frontend unit tests),
Deno's built-in test runner (`Deno.test`, already used by `dispatchMatching.test.ts`).

**Storage**: PostgreSQL via Supabase — one additive column (`cap_drafts.region_code TEXT NULL`). No new table.

**Testing**: `dispatchMatching.test.ts` (Deno test runner) for the pure matching logic — this is the
constitution's non-negotiable test-first zone since it's alert-recipient-determining logic; no additional
suite needed for the UI input (a plain bound `<input>`, consistent with `area_desc`).

**Target Platform**: Existing Supabase-hosted Postgres + Deno Edge Functions (`dispatch-alert`); Vue 3 SPA (Vite)
for the browser client.

**Project Type**: Web application (existing single Vue 3 + Supabase project — no new project/service).

**Performance Goals**: N/A — this is a pure in-memory string-equality check added to an existing per-contact filter
loop; no measurable performance impact at expected contact-list scale (hundreds to low thousands per country).

**Constraints**: Zero regression for any existing contact or draft that has never set a region (FR-002, FR-005,
FR-007); no PostGIS/polygon/geofence logic introduced (spec explicitly excludes this); migration must be idempotent
(`ADD COLUMN IF NOT EXISTS`).

**Scale/Scope**: Single nullable column + one pure-function change + one Edge Function wiring fix + one optional
form input + 7-locale i18n key. No new tables, no new Edge Function, no new store.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: N/A — this feature doesn't touch hazard-type modeling.
- **Principle II (Scope Discipline)**: PASS. Dissemination stays limited to Email/WhatsApp/Web Portal; no new
  channel. No identity/federation change. No CAP ingest.
- **Principle III (CAP v1.2 Compliance)**: PASS, and reinforcing — CAP v1.2's `<area>` element already supports an
  `<areaDesc>` free-text field; adding an internal `region_code` for *dispatch targeting* is an internal
  implementation detail, not a CAP schema change, and does not alter `capExport.js`'s XML/JSON output (out of scope
  for this spec — export continues to use `area_desc`, unaffected).
- **Principle IV (Data Quality & Normalization)**: N/A — no external data source involved.
- **Principle V (Access Control & Auditability)**: PASS. No RBAC change; `cap_drafts` already has audit logging via
  its existing `log_table_change()` trigger, which will automatically capture `region_code` changes with zero
  additional code (it logs the whole row diff).
- **Principle VI (Accessibility & i18n)**: PASS, addressed directly — new label key added to all 7 locales
  (FR/task requirement).
- **Principle VIII (Simplicity/YAGNI)**: PASS, this is the core design rationale — reusing the existing free-text
  `region_code` convention already established for `contacts` rather than introducing a region taxonomy/registry or
  PostGIS geofencing (both explicitly deferred to the separate, already-tracked "Risk & Scenario Modeling" Post-PoC
  module).

No violations. No Complexity Tracking entries needed.

## Project Structure

### Documentation (this feature)

```text
specs/015-region-dispatch-targeting/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── <new>_cap_drafts_region_code.sql       # ALTER TABLE cap_drafts ADD COLUMN IF NOT EXISTS region_code
└── functions/
    ├── shared/
    │   ├── dispatchMatching.ts                # add region_code to both interfaces + matching rule
    │   └── dispatchMatching.test.ts            # new region-matching test cases
    └── dispatch-alert/
        └── index.ts                            # draftForMatching object gains region_code

src/
├── views/
│   └── CapView.vue                             # optional region_code input next to area_desc
└── i18n/locales/
    ├── tr.json / en.json / es.json / fr.json / ru.json / ar.json / zh.json   # cap.regionCode key
```

**Structure Decision**: Existing single Vue 3 + Supabase project layout, unchanged. This feature is additive only:
one migration, one pure-function extension + its test, one Edge Function wiring fix, one form field, 7 i18n edits.
No new directories, stores, or services.

## Complexity Tracking

*No violations — table intentionally omitted.*

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
