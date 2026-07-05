# Implementation Plan: Data Source Country Scoping

**Branch**: `002-source-scoping` | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-source-scoping/spec.md`

## Summary

Add a nullable `country_code` column to the existing `data_sources` table (feature
001-data-ingestion-monitoring) so each source is either **global** (`country_code IS NULL` —
visible/manageable by every admin, e.g. USGS, NASA FIRMS) or **country-scoped** (visible/manageable
only by that country's admins, e.g. Kandilli/AFAD for Turkey). Enforce visibility via RLS, reusing
the exact `country_scoped_read_*` / `current_profile_role()` pattern already established for
disaster-event tables in `20260704_country_scoped_disaster_reads.sql`. On the frontend, regroup the
existing "Sources" tab (`AdminView.vue` + `SourceHealthCard.vue`) into a **Global** section, a thin
divider, and a **Local (this country)** section — omitting the divider/local section entirely when
empty. Restrict `SourceFormModal.vue` so a `country_admin` can only save sources scoped to their own
country, while `super_admin` gets a scope picker (Global or any country).

## Technical Context

**Language/Version**: JavaScript (Vue 3 SFCs, Composition API) on the frontend — same as
001; no backend/Edge Function logic changes required (this feature is read/write-scoping and
admin UI only, not ingestion pipeline behavior).

**Primary Dependencies**: Vue 3.5, Pinia 3, `@supabase/supabase-js` 2.97 — all already in use,
no new dependency.

**Storage**: Supabase PostgreSQL. One additive column (`country_code TEXT NULL`) on the existing
`data_sources` table, plus one new RLS policy pair mirroring the existing
`country_scoped_read_*` convention. No new tables.

**Testing**: Vitest for the grouping/derivation logic (pure function: given a source list + the
viewing admin's country, produce `{ global: [...], local: [...] }`) — mirrors the existing
`sourceHealth.test.ts`-style unit-test convention from 001, but this logic lives on the frontend
(no Edge Function change), so it is a Vitest test under `src/` rather than a Deno test.

**Target Platform**: Web (Vite-built SPA), admin-only surface — same as 001.

**Project Type**: Single-repo web application with a thin serverless backend — unchanged from
001; this feature only touches `src/` and one migration file.

**Performance Goals**: Grouping/filtering of sources for display must be O(n) over the already-small
source list (low tens, per 001's Scale/Scope) — no new performance concern.

**Constraints**: Must NOT change how individual disaster events are tagged with `country_code`
(existing boundary/geocoding pipeline is untouched, per spec FR-010). Must NOT change
`fetch-*` Edge Functions, `validatePayload.ts`, or `sourceHealth.ts` — this feature is additive
scoping on top of the `data_sources` catalog only, not a change to health-state or validation
behavior from 001.

**Scale/Scope**: Same source count as 001 (low tens). Country count is unbounded in principle but
low in practice (one row per onboarded country per source) — no new scale concern.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Hazard-Agnostic, Model-Driven Design | Scoping is a config column (`country_code`) on the existing `data_sources` row, not a new code path per hazard type; adding a new country requires no code change. | PASS |
| II. Scope Discipline | No dissemination, CAP, or external-identity code touched — purely ingestion-catalog admin visibility. | PASS |
| III. CAP v1.2 Compliance | Not applicable. | N/A |
| IV. Data Quality & Normalization | Unaffected — `validatePayload()`/`normalize()`/event-level `country_code` tagging are explicitly out of scope (spec FR-010). | PASS |
| V. Access Control & Auditability | Reuses existing `profiles.role` + `country_code` RLS pattern (`current_profile_role()`, `country_scoped_read_*` convention from 20260704 migration) rather than inventing a new authorization mechanism; `data_sources` CRUD is already audited via `audit_data_sources` trigger (001), which continues to fire on the new column's changes with no extra work. | PASS |
| VI. Accessibility & i18n | Sources tab already has no i18n keys (pre-existing gap noted in 001's T017/T030); this feature follows the same existing convention (hardcoded Turkish strings) rather than being the one i18n'd corner of an otherwise non-i18n'd component — consistent, not a regression. New grouping/divider UI reuses existing CSS custom properties, no new hardcoded colors. | PASS |
| VII. Performance & Resilience | No polling/refresh/offline-cache behavior touched. | PASS |
| VIII. Simplicity & YAGNI | No new service, table, or framework — one nullable column + one RLS policy pair + a pure grouping function reusing the existing `country_code` concept already established by 001/profiles. | PASS |

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-source-scoping/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260706_data_sources_country_scope.sql   # NEW — country_code column + RLS policy pair

src/
├── stores/
│   └── sources.js                 # MODIFIED — fetchSources() unchanged (RLS filters server-side);
│                                   #            createSource()/updateSource() pass country_code
├── utils/
│   └── sourceScope.js             # NEW — pure groupSourcesByScope(sources, viewerCountryCode)
│                                   #       => { global: [...], local: [...] } helper
├── components/admin/
│   ├── SourceHealthCard.vue       # MODIFIED — optional small country-code badge when scoped
│   └── SourceFormModal.vue        # MODIFIED — scope field: locked to own country for
│                                   #            country_admin, full picker for super_admin
└── views/
    └── AdminView.vue              # MODIFIED — Sources tab renders groupSourcesByScope() output
                                    #            as two sections with a divider (local section
                                    #            omitted when empty, per FR-006)

tests/unit/ (or colocated per existing Vitest convention)
└── sourceScope.test.js            # NEW — groupSourcesByScope() unit tests
```

**Structure Decision**: No structural change from 001 — same single-repo `src/` +
`supabase/migrations/` layout. The new grouping logic is extracted as a small pure function
(`src/utils/sourceScope.js`) rather than inlined in `AdminView.vue`, so it is independently
unit-testable per the Testing section above, matching the codebase's existing `src/utils/`
convention (e.g. `severity.js`, `pointInPolygon.js`).

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
