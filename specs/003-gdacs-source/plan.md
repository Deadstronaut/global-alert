# Implementation Plan: GDACS Global Data Source

**Branch**: `003-gdacs-source` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-gdacs-source/spec.md`

## Summary

Add GDACS as a supplementary source **integrated into the 4 existing single-hazard Edge Functions**
(`fetch-earthquakes`, `fetch-wildfires`, `fetch-floods`, `fetch-droughts`) rather than as a
standalone `fetch-gdacs` function. GDACS covers 4 of this app's hazard types from one endpoint
(EQ→earthquake, WF→wildfire, FL→flood, DR→drought; TC/VO excluded, see below), and each of the 4
existing functions now calls GDACS's public GeoJSON API independently and folds its
category-specific contribution into that function's own existing multi-source batch — this is
required, not just a style choice: this app's per-hazard-type deduplication is an **in-memory,
per-function** step (each `fetch-*` function collects all of its own sources into one array,
deduplicates, then upserts once). A standalone `fetch-gdacs` function would run as a completely
separate invocation with no visibility into what `fetch-earthquakes` already fetched from USGS in
the same cycle, so the same real-world earthquake reported by both would never be deduplicated —
this was caught and corrected during implementation (see research.md §6).

GDACS is registered as **4 separate `data_sources` rows** (one per hazard type it covers, all
named `"GDACS"`, each with its own health tracking), reusing the existing `(hazard_type, name)`
lookup key in `resolveSourceId()` unchanged. All 4 rows get `country_code = NULL` (global scope,
per feature 002). The 2 out-of-scope categories (TC, VO) are dropped via a shared
`gdacsSplit()` helper and recorded via structured logging + response metadata rather than a
`rejected_payloads` row (that table's `hazard_type` column is CHECK-constrained to the 5 supported
hazard types, so TC/VO can't be written there without altering the constraint — also discovered
during implementation, see research.md §7).

## Technical Context

**Language/Version**: TypeScript (Deno runtime) for the new Edge Function — matches the existing
5 `fetch-*` functions exactly, no new language/runtime introduced.

**Primary Dependencies**: `@supabase/supabase-js` via `esm.sh` (already in use by every existing
`fetch-*` function); no new dependency. GDACS's public GeoJSON API requires no API key (unlike
NASA FIRMS), so no new secret/env var is needed.

**Storage**: No schema changes. Reuses the existing `data_sources`, `source_state_transitions`,
`rejected_payloads` tables (001) and the `country_code` column (002) — 4 new `data_sources` rows
are inserted as data (via the existing admin CRUD or a seed step), not a migration.

**Testing**: Deno's built-in `Deno.test`, consistent with the existing convention for `fetch-*`
Edge Function logic (e.g. `validatePayload.test.ts`, `sourceHealth.test.ts`). The one genuinely
new piece of logic (splitting one GDACS response into per-hazard-type buckets and dropping TC/VO)
is a pure function and gets its own Deno test.

**Target Platform**: Supabase-hosted Edge Function (Deno), same as the 5 existing `fetch-*`
functions; triggered on the same pg_cron-based polling convention.

**Project Type**: Single-repo web application with a thin serverless backend — unchanged; this
feature only adds one new file under `supabase/functions/fetch-gdacs/` plus (optionally) a small
shared splitting helper.

**Performance Goals**: One HTTP call per poll cycle covers 4 hazard types (vs. 4 separate calls
if GDACS were registered as 4 independent single-hazard sources) — strictly cheaper than the
existing per-hazard-type fetch pattern, not a new performance concern.

**Constraints**: Must not modify `normalize()`, `upsertEvents()`, `validatePayload()`, or
`sourceHealth.ts`'s existing function signatures (Constitution Principle IV/VIII — additive only,
matching the precedent set by features 001/002). Must not add `tropical_cyclone` or `volcano` as
new `hazard_type` values (spec Assumptions — that would require a separate, explicit
constitution-level decision per Principle I, out of scope here). Must preserve the existing
per-source failure isolation: a GDACS-specific fetch failure must not affect any other source's
polling cycle (Constitution Principle VII).

**Scale/Scope**: One new Edge Function, 4 new `data_sources` catalog rows, one new small
splitting/normalization helper — smallest change that satisfies the spec (Constitution
Principle VIII).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Result |
|---|---|---|
| I. Hazard-Agnostic, Model-Driven Design | GDACS's 4 in-scope categories map onto existing `hazard_type` values with zero new code paths in stores/UI; the 2 out-of-scope categories (TC, VO) are explicitly NOT added as new hazard types, per spec Assumptions — adding them later would be a config/schema change, not a rewrite. | PASS |
| II. Scope Discipline | No dissemination, CAP, or identity code touched. WMO/CAP explicitly excluded per spec. | PASS |
| III. CAP v1.2 Compliance | Not applicable — no CAP authoring/export involved. | N/A |
| IV. Data Quality & Normalization | Directly implements this principle: every GDACS record passes through the existing `validatePayload()` before `normalize()`; out-of-scope categories are dropped via the same "reject with reason" pattern already used for malformed records (spec FR-004/FR-005), not a special-cased bypass. | PASS |
| V. Access Control & Auditability | GDACS's 4 `data_sources` rows are managed via the exact same RLS-gated CRUD as every other source (001/002) — `super_admin` full control, no `country_admin` can claim them (global scope, per 002's write-restriction rules, since no country owns a global source). | PASS |
| VI. Accessibility & i18n | No new UI beyond what 001/002 already built (GDACS just becomes 4 more rows in the existing Sources tab's Global group) — no new component, no new hardcoded strings beyond a source name/description already following the existing convention. | PASS |
| VII. Performance & Resilience | One HTTP call still isolated via the existing per-source failure pattern; a GDACS outage degrades only GDACS's 4 rows' health state, never blocks other sources' polling (mirrors existing `Promise.allSettled` isolation used by multi-source fetch functions like `fetch-earthquakes`). | PASS |
| VIII. Simplicity & YAGNI | No new schema, no new mechanism — reuses `(hazard_type, name)` as the existing multi-row-per-source key, just from the source-name side instead of the hazard-type side. The out-of-scope-category exclusion reuses the existing rejected-payload audit trail rather than inventing a new "unsupported category" table. | PASS |

No violations requiring Complexity Tracking justification.

## Project Structure

### Documentation (this feature)

```text
specs/003-gdacs-source/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
supabase/
├── functions/
│   ├── shared/
│   │   ├── normalize.ts, upsert.ts, validatePayload.ts, sourceHealth.ts   # UNCHANGED contracts
│   │   ├── gdacsSplit.ts          # NEW — pure function: raw GDACS GeoJSON features
│   │   │                          #       → { earthquake: [], wildfire: [], flood: [], drought: [],
│   │   │                          #           dropped: [{ eventtype, reason }] }
│   │   ├── gdacsSplit.test.ts     # NEW (Deno test) — routing + drop + empty-feed behavior
│   │   ├── gdacsFetch.ts          # NEW — fetchGdacsFeatures() (the one HTTP call, reused by all
│   │   │                          #       4 functions) + toGdacsNormalized() (validate+normalize
│   │   │                          #       one hazard type's bucket)
│   │   └── dedup.ts               # NEW — deduplicateEvents(), extracted from fetch-earthquakes'
│   │                              #       pre-existing inline dedup so fetch-wildfires/floods/
│   │                              #       droughts (newly multi-source once GDACS is added) can
│   │                              #       reuse it instead of duplicating the same logic 3x
│   ├── fetch-earthquakes/index.ts # MODIFIED — adds GDACS as a 5th tracked source; also the one
│   │                              #       function that logs GDACS's dropped TC/VO categories
│   │                              #       (avoids 4x-redundant logging across all 4 functions)
│   ├── fetch-wildfires/index.ts   # MODIFIED — adds GDACS as a 2nd source (previously single-
│   │                              #       source; now needs dedup for the first time)
│   ├── fetch-floods/index.ts      # MODIFIED — adds GDACS as a 3rd source; also adds a dedup step
│   │                              #       that didn't exist before (GloFAS/ReliefWeb were never
│   │                              #       deduplicated against each other pre-003)
│   └── fetch-droughts/index.ts    # MODIFIED — adds GDACS as a 2nd source (previously single-
│                                  #       source; now needs dedup for the first time)
│
supabase/migrations/
└── (none — no schema change; 4 data_sources rows are seeded via quickstart.md's admin-CRUD step,
   same convention as 001's quickstart.md §2 seeding the original 5 sources)
```

**Structure Decision**: No standalone `fetch-gdacs` function (see Summary for why — in-memory,
per-function dedup requires GDACS's contribution to join each hazard type's existing batch, not
run in isolation). Three new shared helpers reused across the 4 modified functions, following the
existing `supabase/functions/shared/` convention. No new admin UI component needed since 001/002
already render arbitrary `data_sources` rows generically.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
