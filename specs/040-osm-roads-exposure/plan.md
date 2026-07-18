# Implementation Plan: OSM/Overpass Road Network Exposure Source

**Branch**: `040-osm-roads-exposure` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/040-osm-roads-exposure/spec.md`

## Summary

Add road-network exposure data, sourced from OpenStreetMap via the free Overpass API, as a second
auto-imported exposure source alongside Kontur Population (spec 038) — following the identical
architectural pattern: a new scheduled Edge Function fetches and validates records, then writes
them into the *existing* `exposure_datasets`/`exposure_features` tables via the same
supersede-on-reimport approach, with health/failure tracking reused from `data_sources` +
`sourceHealth.ts`. The Google Roads API is explicitly excluded (FR-002) — it is paid and, being a
route-matching service, unsuited to bulk network download regardless of cost.

Unlike Kontur, road data requires **no per-country dataset-resolution step**: Overpass supports a
direct `area["ISO3166-1"="<alpha-2>"]` country query, which lines up exactly with this codebase's
existing `country_code` convention (`getServedCountryCodes()`), so there is no HDX-style lookup
table to build or maintain. This makes the road source simpler to onboard a new country into than
Kontur was — no onboarding action item equivalent to spec 038's outstanding T026a.

One real gap is closed as part of this feature: `geometryToWkt.ts` (shared by both the auto-import
writer path and the manual-upload path) currently only supports Point/Polygon/MultiPolygon and
throws on LineString/MultiLineString — the geometry type OSM ways actually are. This is extended
additively (new cases, no signature change), which also fixes a latent gap that would otherwise
have silently blocked any future manual line-geometry (road/pipeline/etc.) upload too.

MVP scope (per the UNDP demo commitment): only Turkey and Madagascar need to actually succeed
end-to-end. Turkey is already an onboarded served country; Madagascar's `country_boundaries` row
is a dependency this feature assumes rather than creates (spec.md Assumptions).

## Technical Context

**Language/Version**: TypeScript (Deno) for Edge Functions, matching all existing
`supabase/functions/*`. No frontend changes expected — the Sources view and Impact Analysis Wizard
already render whatever `data_sources`/`exposure_datasets` rows exist, exactly as spec 038 found.

**Primary Dependencies**: None new. Overpass is consumed via plain `fetch()` (POST, Overpass QL
text body), matching every existing source's HTTP approach — no client library required (Overpass
has no official JS SDK; every existing integration in this project talks to its source with raw
`fetch()`, so this is consistent, not a deviation).

**Storage**: PostgreSQL via Supabase (existing `exposure_datasets`/`exposure_features`,
`data_sources`, `rejected_payloads`, `source_state_transitions`, `hazard_types` — one additive
migration: widen `hazard_type`/`rejected_payloads.hazard_type` CHECKs with `'roads'`, add a
`hazard_types` row with `category = 'exposure'` matching the precedent set for `'population'`, seed
one `data_sources` row for OpenStreetMap/Overpass). No new table is required — road data reuses
`exposure_datasets.source_name` (already free-text, added by spec 038) and needs no per-country
resolution table (see Summary).

**Testing**: Deno's built-in test runner (`deno test`), matching every existing
`supabase/functions/shared/*.test.ts`. Required for `validateRoadRecord` (business-logic
validation, same test-first-zone rationale spec 038 applied to `validatePopulationRecord`), for
`geometryToWkt.ts`'s new LineString/MultiLineString cases, and for the Overpass response-to-record
mapping in `osmRoadsFetch.ts` using a small fixture response (not a live network call in tests).

**Target Platform**: Supabase Edge Functions (Deno runtime), consistent with all existing
ingestion code; no platform change.

**Project Type**: Web application (existing Vue 3 frontend + Supabase backend) — backend-only Edge
Function + migration; no new frontend surface required.

**Performance Goals**: Not real-time — road networks change on the order of months/years; no p95
latency target applies. Import runs must complete within Supabase Edge Functions' execution time
limit per country processed, same constraint every existing `fetch-*`/`import-*` function already
operates under.

**Constraints**: Must not require a new server-side scheduler/cron mechanism beyond what spec 038
already introduced for Kontur (pg_cron, weekly) — reuse the identical cron pattern. Must not
introduce a client library or SDK dependency (Principle VIII) — raw `fetch()` with an Overpass QL
query string is sufficient, matching this project's existing HTTP-only integration style. For large
countries, a single nationwide Overpass query can be too large/slow for one request; this plan
assumes country-level queries are viable for Turkey and Madagascar specifically (both are
mid-sized) and defers any admin-boundary-level query splitting to a future feature if a larger
country is later onboarded — flagged, not solved, here (Complexity Tracking).

**Scale/Scope**: 1 new Edge Function (`import-osm-roads`), 1 migration, 2 new shared modules
(`roadRecord.ts`, `validateRoadRecord.ts`) plus one new fetch module (`osmRoadsFetch.ts`), one
additive extension to `geometryToWkt.ts` (LineString/MultiLineString), reuse (not duplication) of
`writePopulationDataset`'s pattern generalized into a shared writer (see Complexity Tracking). No
changes to the Impact Analysis Wizard UI, RLS policies, or any hazard-event code path.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. New source added via configuration (seed row
  + one additive CHECK value), not a structural rewrite; identical technique to spec 038's
  `'population'` addition and the earlier tier1-source-unification migration.
- **II. Scope Discipline (NON-NEGOTIABLE)** — PASS. Does not touch dissemination channels,
  identity/auth, or CAP ingestion. Road exposure data is squarely inside the existing Impact
  Analysis / Exposure Modeling scope (spec 008), same category spec 038 already established for
  population.
- **III. CAP v1.2 Compliance** — N/A. This feature does not touch alert authoring/export.
- **IV. Data Quality & Normalization** — PASS. Every road segment passes `validateRoadRecord()`
  before storage (FR-005); invalid segments are rejected with a recorded reason via the existing
  `logRejectedPayload` mechanism. Each `exposure_datasets` row is attributable to its source
  (`source_name = 'osm'`) for provenance, reusing the existing Sources-view freshness indicator
  rather than inventing a new one.
- **V. Access Control & Auditability** — PASS. `data_sources` CRUD/audit and
  `exposure_datasets`/`exposure_features` RLS (existing, country-scoped) apply automatically to the
  new rows; no new access-control surface introduced.
- **VI. Accessibility & Internationalization** — N/A / low-risk. No new user-facing UI text; if
  implementation surfaces a genuinely new string (e.g. a source display label), it MUST go through
  the existing i18n system, per the same flag spec 038 raised for itself.
- **VII. Performance & Resilience by Design** — PASS. Import interval is set to match how
  infrequently road networks actually change (weekly or monthly, not a blanket real-time interval),
  consistent with this principle's differentiation requirement.
- **VIII. Simplicity & YAGNI** — PASS, with one explicitly justified refactor (generalizing
  `writePopulationDataset` into a shared writer) recorded in Complexity Tracking. No new service,
  queue, database, or client library introduced; reuses `data_sources`, `exposure_features`,
  `sourceHealth.ts`, `getServedCountryCodes()`, and `geometryToWkt()` (extended, not duplicated).

**Result**: No unjustified violations. Two small, explicitly justified changes recorded in
Complexity Tracking (shared-writer generalization; deferred query-splitting for large countries).

## Project Structure

### Documentation (this feature)

```text
specs/040-osm-roads-exposure/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── import-osm-roads.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/
├── migrations/
│   └── 20260718120000_osm_roads_exposure_source.sql   # NEW: hazard_type CHECK widening ('roads') + hazard_types row + seed data_sources row
└── functions/
    ├── import-osm-roads/
    │   └── index.ts                                    # NEW
    └── shared/
        ├── geometryToWkt.ts                             # MODIFIED: add LineString/MultiLineString cases, behavior-preserving for existing types
        ├── geometryToWkt.test.ts                         # MODIFIED: add new-case tests
        ├── roadRecord.ts                                 # NEW (shared RoadRecord type, mirrors populationRecord.ts)
        ├── validateRoadRecord.ts                         # NEW
        ├── validateRoadRecord.test.ts                     # NEW
        ├── osmRoadsFetch.ts                               # NEW (Overpass query + response-to-RoadRecord mapping)
        ├── osmRoadsFetch.test.ts                          # NEW (fixture-based, no live network call)
        ├── roadImportPartition.ts                         # NEW (mirrors populationImportPartition.ts)
        ├── roadImportPartition.test.ts                    # NEW
        └── writeExposureDataset.ts                        # NEW: generalized from supersedeExposureDataset.ts's writePopulationDataset — see Complexity Tracking
```

`supersedeExposureDataset.ts`'s `writePopulationDataset` becomes a thin wrapper over the new
generic `writeExposureDataset()` — behavior-preserving for Kontur, verified by its existing test
suite continuing to pass unmodified.

**Structure Decision**: Follows the existing Supabase Edge Functions + Vue 3 frontend structure
exactly (no new top-level directories). One Edge Function (`import-osm-roads`), matching the
one-function-per-independent-source convention `import-kontur-population` already established for
auto-imported exposure sources (as opposed to GDACS's special-cased multi-hazard folding, which
does not apply here — this source produces exactly one exposure type).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Generalizing `writePopulationDataset` into `writeExposureDataset()` | Both Kontur and OSM roads need the identical insert-then-supersede-on-(source_name, country_code) behavior; `metric_value` differs semantically (population count vs. segment length in meters) but the write/chunk/rollback/supersede mechanics are identical. | Writing a second, separate `writeRoadDataset()` copy-pasted from `writePopulationDataset` — rejected: would duplicate the chunked-insert-then-rollback-then-supersede logic (already non-trivial, spec 038's most carefully sequenced module) in two places that must stay behaviorally identical, risking silent drift (e.g. one gets a bugfix, the other doesn't). Generalizing now, while there are only two call sites, is the smaller total change. |
| Extending `geometryToWkt.ts` for LineString/MultiLineString | OSM ways are LineString/MultiLineString geometries; the function currently throws `Unsupported geometry type` for them, which would reject every road segment. | Converting road geometries to a different WKT builder specific to this feature — rejected: `geometryToWkt.ts` is the one existing, tested conversion path both the auto-import writer and the manual-upload path already depend on; adding a second parallel implementation would let the two diverge and re-introduces exactly the duplication spec 038 deliberately avoided by extracting this helper in the first place. |
| Deferring Overpass query splitting (by admin boundary/bbox) for large countries | Out of scope for this feature's actual success criterion (SC-001: Turkey + Madagascar only) — both are mid-sized countries where a single country-level Overpass query is expected to complete within Edge Function limits (to be confirmed live during implementation, mirroring spec 038 T015's "confirm within resource/time limits before finishing" convention). | Building a general splitting strategy now for all 185 future countries — rejected per Principle VIII: speculative complexity for countries not in this feature's scope (India or Brazil's road networks would need it; Turkey and Madagascar's likely don't). Left as a documented follow-up (Assumptions, spec.md) rather than solved speculatively. |

## Post-Design Constitution Check (re-verified after Phase 1)

Re-checked against data-model.md/contracts/quickstart.md as designed — no new violations
introduced by the concrete design beyond what was already flagged pre-design:

- **I/II/III/V/VI** — unchanged from the pre-design pass; the concrete schema (data-model.md §1–3)
  and contract (contracts/import-osm-roads.md) confirm the design stayed within configuration/seed
  changes, no structural rewrite, no scope-discipline or CAP touchpoint, no new access-control
  surface, no new UI strings.
- **IV. Data Quality & Normalization** — CONFIRMED PASS at design level: `validateRoadRecord()`
  (data-model.md) is the single gate before storage, mirroring `validatePopulationRecord()`
  exactly; rejected segments are never silently stored (contracts/import-osm-roads.md).
- **VII. Performance & Resilience** — CONFIRMED PASS: weekly interval (research.md §6) matches
  road-network update cadence; per-country failure isolation (FR-009, contracts) prevents one
  country's Overpass failure from degrading others.
- **VIII. Simplicity & YAGNI** — CONFIRMED PASS: the `writeExposureDataset()` generalization
  (data-model.md's Writer section) is the only shared-code change, is behavior-preserving for
  Kontur (quickstart.md §8 regression check), and no new service/library was introduced anywhere in
  the final design.

**Result**: Design complete, no unresolved gate failures. Ready for `/speckit-tasks`.
