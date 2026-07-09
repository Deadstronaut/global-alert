# Implementation Plan: Population Exposure Data Sources

**Branch**: `038-population-exposure-sources` | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-population-exposure-sources/spec.md`

## Summary

Add one new population exposure data source (Kontur Population) as Tier 1 (lowest risk) of a
larger client-requested 14-external-source integration effort. Of the 4 sources originally
requested, 3 were removed after live verification found them infeasible for this feature's scope:
**WorldPop** (removed during planning — GeoTIFF-only, no vector/CSV extract, spec.md's Amendment,
data-model.md §5b), **Meta/HDX Population** (removed during implementation — its CSV resource is
18.6 million raw grid-resolution rows per country, spec.md's Amendment 2, data-model.md §5c), and
**GHSL** (removed during implementation — a global GeoTIFF tile grid with no vector/per-country
download, spec.md's Amendment 3, data-model.md §5d). All three are deferred to a future,
separately-scoped feature. Kontur is imported periodically by a new scheduled Edge Function into
the *existing*
`exposure_features`/`exposure_datasets` tables (spec 008/023/034) — no new data model, reusing the
Impact Analysis Wizard's existing consumption path unchanged. Health/failure monitoring reuses the
*existing* `data_sources` + `sourceHealth.ts` state machine (spec 001), extended by one additive
CHECK-constraint value (`hazard_type = 'population'`) rather than a parallel mechanism. Per-country
dataset discovery for Kontur uses a live HDX search (verified working via HDX's structured
`groups`/ISO3 filter) run **once at country onboarding**, not on every import cycle — the result is
persisted into a country-isolated config table, not re-queried live each time (data-model.md §5a).
No new services, queues, or frameworks are introduced (Principle VIII); one narrowly-scoped new
dependency (a GeoPackage reader, for Kontur only) is taken on and explicitly justified in
Complexity Tracking.

## Technical Context

**Language/Version**: TypeScript (Deno) for Edge Functions, matching all existing
`supabase/functions/*`; Vue 3 / JavaScript for any admin-UI touches (Sources view already supports
arbitrary `hazard_type` values with no hardcoded list — verify during implementation, no changes
expected).

**Primary Dependencies**: `@supabase/supabase-js` (existing). One new dependency: `sql.js` (WASM
SQLite, via esm.sh) to read Kontur's GeoPackage resource — live-verified during implementation to
load and query a real 90MB/458k-row file in under 2 seconds total, well within Edge Function
limits. HDX's CKAN Action API is otherwise consumed via plain `fetch()`, matching every existing
source's HTTP approach.

**Storage**: PostgreSQL via Supabase (existing `exposure_datasets`/`exposure_features`,
`data_sources`, `rejected_payloads`, `source_state_transitions` — one additive migration: widened
`hazard_type` CHECK + new `exposure_datasets.source_name` column, see data-model.md).

**Testing**: Deno's built-in test runner (`deno test`), matching every existing
`supabase/functions/shared/*.test.ts` — required for `validatePopulationRecord` (business-logic
validation, falls under constitution's "critical business logic" testing requirement by analogy
with the existing `validatePayload`/`sourceHealth`/dedup test-first zones) and for each
`<source>Fetch.ts`'s shape-mapping logic once the live upstream shape is confirmed (research.md §4).

**Target Platform**: Supabase Edge Functions (Deno runtime), consistent with all existing
ingestion code; no platform change.

**Project Type**: Web application (existing Vue 3 frontend + Supabase backend) — this feature adds
backend-only Edge Functions and a migration; no new frontend surface is required beyond the
existing Impact Analysis Wizard already listing whatever `exposure_datasets` rows exist (verify,
don't rebuild).

**Performance Goals**: Not real-time — these sources update on the order of weeks/months
(research.md §3/§5); no p95 latency target applies. Import runs should complete within Supabase
Edge Functions' execution time limits per country processed (existing constraint on all
`fetch-*` functions already).

**Constraints**: Must not require a new server-side scheduler/cron (Principle VIII — reuse
client-driven polling, research.md §5). Must not require raw raster (GeoTIFF) processing
(research.md §6 — if a source turns out to require this, that's a blocking finding to raise before
implementing that one source, not a reason to add a new dependency speculatively).

**Scale/Scope**: 4 new Edge Functions, 1 migration, 1 shared-helper extraction
(`geometryToWkt.ts`), 1 new shared validator (`validatePopulationRecord.ts`), 4 new
`<source>Fetch.ts` modules, seed rows for 4 `data_sources` entries. No changes to the Impact
Analysis Wizard UI, RLS policies, or any hazard-event code path.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. New source added via configuration (seed
  rows + one CHECK widening), not a structural rewrite; mirrors the exact technique the in-flight
  `20260709000000_data_sources_tier1_source_type.sql` migration already used for `tsunami`/
  `epidemic`/`multi_hazard`.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. Does not touch dissemination channels,
  identity/auth, or CAP ingestion. Population exposure data is squarely inside the existing Impact
  Analysis / Exposure Modeling scope (spec 008), not a new module.
- **III. CAP v1.2 Compliance** — N/A. This feature does not touch alert authoring/export.
- **IV. Data Quality & Normalization** — PASS. Every record passes `validatePopulationRecord()`
  before storage (FR-004); invalid records are rejected with a recorded reason via the existing
  `logRejectedPayload` mechanism, never silently stored. Each `exposure_datasets` row is
  attributable to its source (`source_name`) for freshness/provenance visibility, satisfying the
  spirit of this principle's "data-freshness indicator" requirement via the existing Sources view
  (`last_success_at`/health state), which this feature reuses rather than reinventing.
- **V. Access Control & Auditability** — PASS. `data_sources` CRUD/audit (existing RLS + audit
  trigger) and `exposure_datasets`/`exposure_features` RLS (existing, scoped by `country_code`) are
  unchanged and apply automatically to the new rows; no new access-control surface introduced.
- **VI. Accessibility & Internationalization** — N/A. No new user-facing UI text is introduced by
  this feature (existing Sources view and Impact Analysis Wizard already render whatever rows
  exist, using existing i18n'd labels/components); if implementation surfaces a genuinely new
  string (e.g. a source display name), it MUST go through the existing i18n system per this
  principle — flagged for implementation-time attention, not a plan-level violation.
- **VII. Performance & Resilience by Design** — PASS. Poll/import intervals are set per real-world
  update cadence (days/weeks, not a blanket interval), consistent with this principle's
  differentiation requirement (research.md §5).
- **VIII. Simplicity & YAGNI** — PASS, with one explicitly justified additive column (see
  Complexity Tracking below). No new service, queue, database, or framework introduced; reuses
  `data_sources`, `exposure_features`, `sourceHealth.ts`, and `geometryToWkt()` (extracted, not
  duplicated) end-to-end.

**Result**: No unjustified violations. One minor, explicitly justified schema addition recorded in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/038-population-exposure-sources/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── import-population-source.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── 20260713140000_population_exposure_sources.sql # NEW: CHECK widening + exposure_datasets.source_name + population_source_country_datasets + seed rows (2 sources, not 4)
└── functions/
    ├── import-kontur-population/
    │   └── index.ts                                   # NEW
    ├── import-ghsl-population/
    │   └── index.ts                                   # NEW
    ├── upload-exposure-dataset/
    │   └── index.ts                                   # MODIFIED: geometryToWkt() extracted out, behavior-preserving
    └── shared/
        ├── geometryToWkt.ts                            # NEW (extracted from upload-exposure-dataset)
        ├── geometryToWkt.test.ts                        # NEW
        ├── populationRecord.ts                          # NEW (shared PopulationRecord type)
        ├── validatePopulationRecord.ts                  # NEW
        ├── validatePopulationRecord.test.ts              # NEW
        ├── supersedeExposureDataset.ts                   # NEW
        ├── servedCountries.ts                            # NEW (getServedCountryCodes — data-model.md §4a)
        ├── iso3166.ts                                    # NEW (ISO2<->ISO3 mapping, needed for HDX's `groups` filter)
        ├── iso3166.test.ts                               # NEW
        ├── resolveHdxCountryDataset.ts                   # NEW (data-model.md §5a — one-time onboarding resolution)
        ├── resolveHdxCountryDataset.test.ts              # NEW
        ├── konturFetch.ts                                # NEW (uses a GeoPackage-reading dependency, see Complexity Tracking)
        └── ghslFetch.ts                                  # NEW

src/services/api/config.js                              # MODIFIED: add 2 EDGE_FUNCTIONS entries + POLLING_INTERVALS (only if client-driven triggering is adopted for these — confirm against existing Sources-tab "run now" pattern first, per research.md §5)
```

**WorldPop and Meta/HDX Population are absent from this tree entirely** — both deferred out of this feature (see Summary and
data-model.md §5b), not merely unimplemented within it.

**Structure Decision**: Follows the existing Supabase Edge Functions + Vue 3 frontend structure
exactly (no new top-level directories). One Edge Function per source (not folded together like
GDACS), since these sources share no in-memory dedup state with each other — each function is
independently triggerable/schedulable, matching `fetch-earthquakes`/`fetch-wildfires`/etc.'s
one-function-per-independent-concern convention rather than GDACS's special-cased exception
(research.md and spec 003's contracts explain why GDACS's folding was necessary there and is not
applicable here).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| New `exposure_datasets.source_name` column | Supersession (FR-007) requires identifying "the previous dataset this same auto-import source created for this country" before writing a new one; the existing `description` free-text field is not reliably queryable for this. | Parsing/matching against `description` text — rejected: fragile (breaks if wording changes), not indexable, and could false-match a manually uploaded dataset with a similarly worded description, risking accidental deletion of a human-uploaded dataset (unacceptable per Principle IV's data-quality guarantee). A dedicated nullable, indexed column is the smallest correct fix and does not affect any existing row (`NULL` for all pre-existing manually uploaded datasets). |
| New `population_source_country_datasets` table | Kontur/Meta publish one dataset per country on HDX with no derivable URL pattern (verified live); a per-country dataset reference must be persisted somewhere to keep the codebase country-agnostic (Principle I) and to avoid a live HDX search on every import cycle (data-model.md §5a). | A live HDX search on every import run instead of persisting a resolved reference — rejected: adds a second external dependency to every scheduled run, is not guaranteed stable/reproducible over time (HDX's catalog and search ranking can change), and is harder to audit for data feeding humanitarian decisions (Principle IV). Reusing `data_sources.endpoint_config` instead of a new table — rejected: that column is one value per *source*, not per *(source, country)* pair, and (per the guardrail added to spec 001) is anon-readable, which this per-country config table deliberately is not. |
| New dependency: GeoPackage reader (Kontur only) | Kontur's HDX resources are GeoPackage-only (verified live) — a SQLite-based OGC standard format with no existing parser in this codebase. | Skipping Kontur entirely — considered and rejected in favor of taking the dependency: unlike WorldPop's raster-only format (which was excluded from this feature, see Summary), GeoPackage is a well-supported, bounded-scope format with mature pure-JS/WASM readers, and Kontur is the client's most-documented/highest-quality source of the three. This is the one Kontur-specific dependency in this feature — scoped to `konturFetch.ts` only, not a general new capability added to shared infrastructure. |
