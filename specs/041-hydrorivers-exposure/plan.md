# Implementation Plan: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

**Branch**: `041-hydrorivers-exposure` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/041-hydrorivers-exposure/spec.md`

## Summary

Import river-network (HydroRIVERS) and watershed-boundary (HydroBASINS) data for Turkey and
Madagascar into the existing generic `exposure_datasets`/`exposure_features` tables, following
spec 038/040's established pattern. Unlike Kontur (per-country HDX packages) or OSM/Overpass
(per-country API queries), HydroSHEDS distributes both datasets as **continent-scale** shapefile
ZIPs only — Turkey falls in the "eu" (Europe & Middle East) file, Madagascar in "af" (Africa) — so
this feature's core new engineering work is a **download → unzip → stream-parse shapefile →
spatially clip to the served country's boundary → validate → write** pipeline, run as a one-off
local script per served country (mirroring how spec 040's roads and spec 038's Kontur population
data were ultimately loaded in practice — Overpass/Supabase Edge Function reachability, spec 040
research.md finding 5/6, means the "run from a local machine, write via the same shared
`writeExposureDataset`" pattern is this project's proven, working approach right now, not a
workaround of last resort).

## Technical Context

**Language/Version**: Deno/TypeScript (backend shared modules + one-off import script), matching
spec 038/040's stack exactly.

**Primary Dependencies** (all live-verified working in Deno via `esm.sh` during planning):
- `jszip@3.10.1` — unzip HydroSHEDS' `.zip` distributions (no native dependency; the project
  already ships `jszip` in its frontend manual-upload path, `exposureFileParser.js`, so this is a
  second consumer of an already-vetted library, not a new unknown).
- `shapefile@0.6.6` — streaming `.shp`/`.dbf` reader (feature-by-feature, not whole-file-in-memory
  — important for continent-scale files where only a small fraction of features will survive the
  country clip).
- `@turf/bbox@7` + `@turf/boolean-intersects@7` — bounding-box pre-filter and precise
  line/polygon-vs-country-boundary intersection test for the spatial clip step.

**Storage**: Supabase Postgres — writes to the existing `exposure_datasets`/`exposure_features`
tables via the existing generic `writeExposureDataset()` (spec 040), reads existing
`country_boundaries` for the clip boundary. One additive migration: widen the `hazard_type` CHECK
constraints to add `'rivers'` and `'basins'`, plus two new `hazard_types`/`data_sources` seed rows
— same shape as spec 040's migration.

**Testing**: `deno test --no-check` for the new pure functions (record validation, bbox pre-filter,
continent-code lookup) — same "critical business logic gets tests, DB/network I/O is manually
verified" convention as spec 038/040.

**Target Platform**: Supabase Edge Functions (scheduled, low-frequency cron) for the
production-intended path; a one-off local Deno script for actually loading Turkey/Madagascar's
data in this session, matching spec 040's already-established, working pattern given Overpass's
(and by extension, any similarly-shaped outbound-heavy fetch's) unresolved reachability issue from
the deployed Edge Function's shared egress IP.

**Project Type**: Existing Supabase backend (single project) — no new project type.

**Performance Goals**: A country-scale clip (Madagascar out of the full "af" continent file, or
Turkey out of "eu") must complete without exceeding reasonable script/Edge-Function execution
time; streaming the shapefile (not loading the whole continent into memory as GeoJSON at once) is
the key technique enabling this for potentially million-feature continent files (HydroBASINS level
12 alone is ~1M polygons globally).

**Constraints**: No new backend services (Constitution Principle VIII) — the clip logic runs in
Deno, not a separate GIS service. Country-clip boundary source is the existing
`country_boundaries` table, no new boundary data source.

**Scale/Scope**: 2 served countries (Turkey, Madagascar) for this MVP, per spec.md's scope note —
same as specs 038/040/042. HydroBASINS level choice: **level 6** (research.md §3 — a reasonable
middle granularity for country-scale display, consistent with common third-party usage of that
level for regional/national visualization, e.g. Google Earth Engine's own "HydroATLAS Basins Level
06" reference dataset).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. `'rivers'`/`'basins'` are new `hazard_types`
  rows (`category: 'exposure'`), not new code branches in shared display/rendering logic — spec
  042's exposure-layer map visualization already renders any such dataset generically with zero
  changes needed (confirmed by spec 042's own FR-008/SC-004 design intent).
- **II. Scope Discipline** — PASS. No dissemination/identity/CAP-ingestion surface touched.
- **III. CAP v1.2 Compliance** — N/A.
- **IV. Data Quality & Normalization** — PASS. Per-record validation (geometry, country membership)
  before write, malformed records rejected with a logged reason not silently stored — mirrors
  spec 040's `validateRoadRecord.ts` pattern exactly (new `validateRiverRecord.ts`/
  `validateBasinRecord.ts`).
- **V. Access Control & Auditability** — PASS. Reuses `exposure_datasets`/`exposure_features`'s
  existing RLS policies unchanged — no new access-control surface.
- **VI. Accessibility & Internationalization** — N/A for this feature's own scope (no new
  user-facing UI strings; spec 042's already-i18n'd exposure-layer panel picks these datasets up
  automatically. `exposureLayerLabel.js`'s `SOURCE_LABEL_KEYS` MAY be extended with
  `hydrorivers`/`hydrobasins` entries as a follow-up UX nicety, tracked in tasks.md but not
  required for this feature's own Done criteria).
- **VII. Performance & Resilience by Design** — APPLIES. Streaming shapefile parse (not
  load-entire-continent-into-memory) is the direct implementation of this principle for
  continent-scale source files.
- **VIII. Simplicity & YAGNI** — APPLIES. No new backend service; three small, focused new
  dependencies (all already-vetted patterns: `jszip` already used elsewhere in this codebase,
  `shapefile`/`turf` are narrowly-scoped single-purpose libraries, not frameworks). Considered and
  rejected: a dedicated GIS/ETL service for the clip step (Complexity Tracking below).

**Initial gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/041-hydrorivers-exposure/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/             # Phase 1 output
│   └── import-hydro-exposure.md
└── tasks.md               # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── functions/
│   ├── import-hydrorivers/
│   │   └── index.ts                       # NEW: Edge Function (mirrors import-osm-roads shape)
│   ├── import-hydrobasins/
│   │   └── index.ts                       # NEW: Edge Function (mirrors import-osm-roads shape)
│   └── shared/
│       ├── hydroshedsContinent.ts         # NEW: country_code -> HydroSHEDS continent-file code
│       │                                    #   (data table, e.g. iso3166.ts's existing pattern —
│       │                                    #   not a branch, a lookup)
│       ├── hydroshedsClip.ts              # NEW: shared bbox-prefilter + precise-clip helpers
│       │                                    #   used by both rivers and basins fetch modules
│       ├── hydroRiversFetch.ts            # NEW: download+unzip+stream-parse+clip HydroRIVERS
│       ├── hydroRiversFetch.test.ts       # NEW
│       ├── hydroBasinsFetch.ts            # NEW: download+unzip+stream-parse+clip HydroBASINS
│       ├── hydroBasinsFetch.test.ts       # NEW
│       ├── riverRecord.ts                 # NEW: RiverRecord type
│       ├── basinRecord.ts                 # NEW: BasinRecord type
│       ├── validateRiverRecord.ts         # NEW
│       ├── validateRiverRecord.test.ts    # NEW
│       ├── validateBasinRecord.ts         # NEW
│       ├── validateBasinRecord.test.ts    # NEW
│       ├── riverImportPartition.ts        # NEW (mirrors roadImportPartition.ts)
│       ├── riverImportPartition.test.ts   # NEW
│       ├── basinImportPartition.ts        # NEW
│       └── basinImportPartition.test.ts   # NEW
└── migrations/
    └── <timestamp>_hydrorivers_hydrobasins_exposure_sources.sql   # NEW
```

**Structure Decision**: Two Edge Functions (rivers, basins) rather than one combined function —
matches this project's existing one-function-per-source convention (import-kontur-population,
import-osm-roads are each single-source), keeps each function's cron schedule/health tracking
independent (a basins failure must not affect rivers' health state, and vice versa), and keeps
each function small enough to stay within Edge Function limits once/if that path becomes viable
again. Shared clip/continent-lookup logic lives in `shared/` so it isn't duplicated between them.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |

**Considered and deferred:**

| Option | Why Deferred |
|--------|--------------|
| A dedicated GIS/ETL microservice (e.g. GDAL/ogr2ogr in a container) for shapefile parsing and clipping | Would be more robust for very large files, but adds a new backend service (Principle VIII violation) for a problem the pure-JS streaming approach (shapefile + turf) already solves at this MVP's scale (2 countries, one continent file each) — revisit only if a future country's continent file proves too large for this approach. |
| Doing the spatial clip in PostGIS (insert everything unclipped into a staging table, then `ST_Intersects` in SQL) instead of in JS with turf | Would offload clip correctness to PostGIS's more battle-tested geometry engine, but requires inserting the entire continent's un-clipped feature set first (network + storage cost for millions of rows that will mostly be discarded) — a JS bbox-prefilter + turf precise-clip discards the vast majority of candidates before any DB write, which is cheaper for this MVP's scale. Revisit if turf's clip correctness proves insufficient on real data (tracked as a research.md risk, not assumed away). |
