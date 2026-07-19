# Implementation Plan: WorldPop Raster Population Exposure Source

**Branch**: `043-worldpop-raster-population` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/043-worldpop-raster-population/spec.md`

## Summary

Add WorldPop as a second, independent population exposure source, closing this project's
longest-standing Data Sources Inventory gap: raw-raster (GeoTIFF) population sources were
evaluated but never integrated because the project had no raster-processing pipeline. This
feature builds that pipeline (download GeoTIFF → read pixels → aggregate into H3 hexagons →
validate → write) as a **generic raster-to-hexagon mechanism configured by a small per-source
description**, not WorldPop-specific logic (FR-011), then supplies WorldPop's own config as the
first (and for this MVP, only) entry. Output lands in the existing generic `exposure_datasets`/
`exposure_features` tables via the unmodified `writeExposureDataset()` (spec 040), so it appears
in the spec 042 exposure-layer map with zero UI code changes — the same "generic architecture pays
off again" pattern already proven four times over (Kontur, roads, rivers, basins).

## Technical Context

**Language/Version**: Deno/TypeScript (backend shared modules + one-off import script), matching
spec 038/040/041's stack exactly.

**Primary Dependencies** (live-smoke-tested working in Deno via `esm.sh` before this spec was
written):
- `geotiff@2.1.3` — pure-JS/WASM GeoTIFF reader, no native/GDAL dependency. Reads WorldPop's
  100m-resolution population-count GeoTIFFs directly; supports windowed/tiled reads so the whole
  raster need not be decoded into memory at once for larger countries (Turkey's raster covers
  ~780,000 km² at 100m resolution).
- `h3-js@4.1.0` — H3 hexagon indexing (`latLngToCell`), used to bucket each raster pixel's
  center coordinate into a hexagon cell for aggregation. Same library family conceptually as
  Kontur's own H3 output, giving structurally comparable (not identical-resolution) hexagon
  layers per spec.md's Assumptions.

**Storage**: Supabase Postgres — writes to the existing `exposure_datasets`/`exposure_features`
tables via the existing generic `writeExposureDataset()` (spec 040), reads existing
`country_boundaries` for the country-membership check (FR-008/US3). One additive migration:
widen the `data_sources`/`rejected_payloads` `hazard_type` CHECK constraints to add
`'population_raster'` (kept distinct from Kontur's plain `'population'` hazard type so the two
sources' health/config rows don't collide), plus one new `hazard_types` row and one new
`data_sources` seed row — same shape as spec 040/041's migrations.

**Testing**: `deno test --no-check` for the new pure functions (pixel→hexagon aggregation,
record validation, raster source config lookup) — same "critical business logic gets tests,
network/GeoTIFF I/O is manually verified against real data" convention as spec 038/040/041.

**Target Platform**: Supabase Edge Functions (scheduled, low-frequency cron) for the
production-intended path; a one-off local Deno script for actually loading Turkey/Madagascar's
data in this session — matching spec 040/041's already-established, working pattern given
Overpass-class outbound reachability from the deployed Edge Function's shared egress IP
remaining unresolved (spec 040 research.md finding 5, tasks.md T018).

**Project Type**: Existing Supabase backend (single project) — no new project type.

**Performance Goals**: A country-scale raster (Turkey: ~780,000 km² at 100m resolution, on the
order of tens of millions of pixels) must aggregate into hexagons without loading the entire
decoded raster into memory at once — `geotiff.js`'s windowed-read API (reading the raster in
row-block strips, aggregating into a running per-hexagon accumulator map, discarding pixel data
once folded in) is the key technique, mirroring spec 041's "stream, don't load-all" approach for
continent-scale shapefiles (Constitution Principle VII).

**Constraints**: No new backend services (Constitution Principle VIII) — raster read and
aggregation run in Deno, not a separate GIS/raster service. Country boundary source is the
existing `country_boundaries` table, no new boundary data source.

**Scale/Scope**: 2 served countries (Turkey, Madagascar) for this MVP, per spec.md's scope note —
same as specs 038/040/041/042. H3 resolution: **resolution 7** (research.md §3 — visually and
numerically comparable in cell size to Kontur's own hexagons at the country scale this project
demos at; a planning-phase default per spec.md's Assumptions, not a product-scope decision).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. `'population_raster'` is a new
  `hazard_types` row (`category: 'exposure'`), not a new code branch in shared display/rendering
  logic — spec 042's exposure-layer map already renders any such dataset generically (confirmed
  four times over: osm, kontur, hydrorivers, hydrobasins). FR-011 additionally requires the
  raster pipeline itself to be config-driven (a `RasterSourceConfig` entry) rather than
  WorldPop-specific, directly extending this principle to the *ingestion* side, not just display.
- **II. Scope Discipline** — PASS. No dissemination/identity/CAP-ingestion surface touched.
- **III. CAP v1.2 Compliance** — N/A.
- **IV. Data Quality & Normalization** — PASS. Per-hexagon validation (finite/non-negative
  population value, non-empty pixel contribution, country membership) before write; invalid
  hexagons rejected with a logged reason, not silently stored or treated as zero (FR-008, US3) —
  mirrors spec 040/041's `validate*Record.ts` pattern exactly (new `validatePopulationRasterRecord.ts`).
- **V. Access Control & Auditability** — PASS. Reuses `exposure_datasets`/`exposure_features`'s
  existing RLS policies unchanged — no new access-control surface.
- **VI. Accessibility & Internationalization** — N/A for this feature's own scope (no new
  user-facing UI strings; spec 042's already-i18n'd exposure-layer panel picks this dataset up
  automatically). `exposureLayerLabel.js`'s `SOURCE_LABEL_KEYS` MAY be extended with a
  `worldpop` entry as a follow-up UX nicety, tracked in tasks.md but not required for FR-012's
  "zero code changes to rendering/store/popup logic" guarantee (a label-map data entry is
  configuration, not logic).
- **VII. Performance & Resilience by Design** — APPLIES. Windowed/streamed raster read (not
  decode-entire-country-into-memory-at-once) is the direct implementation of this principle for a
  tens-of-millions-of-pixels input.
- **VIII. Simplicity & YAGNI** — APPLIES. No new backend service; two small, focused new
  dependencies (both pure-JS/WASM, already smoke-tested, no native/GDAL requirement). Considered
  and rejected: a dedicated raster/GIS microservice (e.g. GDAL in a container) for the read+
  aggregate step (Complexity Tracking below).

**Initial gate result: PASS.**

## Project Structure

### Documentation (this feature)

```text
specs/043-worldpop-raster-population/
├── plan.md                          # This file
├── research.md                      # Phase 0 output
├── data-model.md                    # Phase 1 output
├── quickstart.md                    # Phase 1 output
├── contracts/                       # Phase 1 output
│   └── import-worldpop-exposure.md
└── tasks.md                         # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── functions/
│   ├── import-worldpop/
│   │   └── index.ts                       # NEW: Edge Function (mirrors import-osm-roads shape)
│   └── shared/
│       ├── rasterSourceConfig.ts          # NEW: generic RasterSourceConfig type + the WorldPop
│       │                                    #   entry (FR-011's "config addition, not new code"
│       │                                    #   mechanism)
│       ├── rasterToHexagon.ts             # NEW: source-agnostic windowed-read GeoTIFF ->
│       │                                    #   per-hexagon aggregation (pure function over an
│       │                                    #   already-fetched raster buffer + config)
│       ├── rasterToHexagon.test.ts        # NEW
│       ├── worldPopFetch.ts               # NEW: WorldPop per-country API lookup + GeoTIFF
│       │                                    #   download, delegates aggregation to
│       │                                    #   rasterToHexagon.ts
│       ├── worldPopFetch.test.ts          # NEW
│       ├── populationRasterRecord.ts      # NEW: PopulationRasterRecord type
│       ├── validatePopulationRasterRecord.ts       # NEW
│       ├── validatePopulationRasterRecord.test.ts  # NEW
│       ├── populationRasterImportPartition.ts      # NEW (mirrors roadImportPartition.ts)
│       └── populationRasterImportPartition.test.ts # NEW
└── migrations/
    └── <timestamp>_worldpop_population_raster_exposure_source.sql   # NEW
```

**Structure Decision**: One Edge Function (`import-worldpop`), matching this project's existing
one-function-per-source convention. The raster-to-hexagon aggregation logic (`rasterToHexagon.ts`)
is deliberately split from the WorldPop-specific fetch/download logic (`worldPopFetch.ts`) so
FR-011's genericity requirement is structural, not just documented: a future GeoTIFF source (Meta/
HDX Population, GHSL) would add its own `*Fetch.ts` (download + config) and reuse
`rasterToHexagon.ts` unchanged, the same way `hydroRiversFetch.ts`/`hydroBasinsFetch.ts` each had
their own fetch logic but shared `hydroshedsClip.ts` in spec 041.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |

**Considered and deferred:**

| Option | Why Deferred |
|--------|--------------|
| A dedicated raster/GIS microservice (e.g. GDAL/`gdal_translate`+`gdal_polygonize` in a container) for GeoTIFF reading and zonal aggregation | Would be more robust/faster for very large rasters, but adds a new backend service (Principle VIII violation) for a problem `geotiff.js` + `h3-js` already solve at this MVP's scale (2 countries) with zero native dependencies — revisit only if a future country's raster proves too large for windowed pure-JS reads. |
| Reprojecting/resampling the raster before aggregation (e.g. to align pixel grid with H3 cell boundaries) | Adds real complexity (a resampling step, a new geospatial library) for a precision gain not required by any FR/SC — pixel-center-point-in-hexagon aggregation (mirroring how Kontur's own hexagon population values are themselves already an aggregation, not a precise areal apportionment) is sufficient for this system's stated use case (a second, independent *estimate* for cross-checking, not a survey-grade areal statistic). Revisit only if a future requirement demands areal-weighted precision. |
