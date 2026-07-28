# Implementation Plan: Hazard Impact Halo Visualization

**Branch**: `050-hazard-impact-halo-visualization` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/050-hazard-impact-halo-visualization/spec.md`

## Summary

Add a translucent circular "impact halo" overlay to the selected hazard event on the 2D map, sized to the event's existing `defaultBufferRadiusKm()` value, with a vertical opacity/intensity slider in the event's info card (US1). Color critical-infrastructure points already shown on the map (the `osm-buildings` exposure source) on a red-to-yellow gradient by distance from the event center, scoped to the halo's radius (US2). US3 (full building-footprint-level coloring) is scoped but explicitly blocked on a new data import — Microsoft's Global ML Building Footprints dataset (verified live-reachable, all three served countries covered) is the recommended source, following the exact raster-importer container pattern already established for DEM-slope/GHSL/WorldPop, not a live Overpass query.

## Technical Context

**Language/Version**: Vue 3 `<script setup>` (JS) for US1/US2; Deno 2.x (raster-importer container) for US3's import module — both already this project's stack, no new language/runtime.

**Primary Dependencies**: MapLibre GL JS (existing — halo rendered as a `fill`/`line` layer over a client-generated circle polygon, same technique already used for the "Uyarı Yarıçapı" radius circle already on this map); no new npm dependency required for the halo geometry itself (a simple point-buffer-in-degrees polygon generator is ~15 lines, no need to pull in `@turf/turf` for one circle). US3 reuses `geotiff`/`h3-js` already used by the DEM-slope importer, plus a CSV/GeoJSONL parser for Microsoft's tile format (no new heavy dependency — the existing raster-importer container already handles gzip/CSV-shaped sources like WorldPop's API responses).

**Storage**: Supabase Postgres. US1/US2 need **zero schema changes** — the halo is a client-side-only overlay (no persistence), and US2's severity coloring is computed from data already in `exposure_features` (no new column). US3 needs one new `exposure_datasets.source_name` value (`building_footprints` or similar) — reuses the existing generic `exposure_features` table unchanged, same as every other source (spec 038's Key Entities), so no migration beyond a `data_sources`/`hazard_types` CHECK-constraint widen + seed row (same two-statement pattern used for `dem_slope` in 20260728090000).

**Testing**: Vitest (existing suite, currently 230/230 — must stay green) for the halo/color-ramp pure functions; Playwright (this project's established live-testing convention throughout specs 048-049) for US1's slider behavior and US2's color-by-distance rendering, using the real Kahramanmaraş/Gaziantep earthquake scenario already used repeatedly in this engagement's live tests.

**Target Platform**: Existing Vue SPA (2D MapLibre view only for v1 — see spec's `NEEDS CLARIFICATION` on 3D globe scope) + Supabase backend + Deno raster-importer containers (US3 only).

**Performance Goals**: Halo render and the vertical-slider opacity change MUST NOT add any network round-trip (SC-001/SC-002 in spec.md) — both are pure client-side MapLibre paint-property updates against data already present once an event is selected. US2's distance-based coloring is computed client-side from critical-infrastructure features already fetched for the map (no new RPC).

**Constraints**: Reuse `src/lib/hazardBuffer.js`'s `defaultBufferRadiusKm()` unchanged (FR-001) — this plan does not touch that formula. US3, if/when planned, must NOT reuse `get_dataset_features_geojson` as-is for the new building-footprint dataset — that function `jsonb_agg`s an entire dataset in one call, and this project has now hit real statement-timeout/edge-proxy failures (520/521, see 20260728091000/093000 migrations) at "only" 126k-138k rows; a building-footprint dataset for Turkey (Microsoft's index lists 266 tiles) would likely be one to two orders of magnitude larger, so US3's own future plan MUST scope its fetch to the halo's radius (or current map viewport), not the whole country, from the start — flagged here so whoever plans US3 doesn't repeat that mistake.

**Scale/Scope**: US1/US2 — small, contained change to `MapView.vue` + `src/utils/exposureLayerColor.js` (a new color-ramp helper) + i18n strings. US3 — a new country-scale data-acquisition effort (a new `supabase/functions/shared/buildingFootprintsFetch.ts` + `raster-importer/import-building-footprints.ts`, mirroring `demSlopeFetch.ts`/`import-dem-slope.ts` exactly) — large enough in its own right that it should get its own `/speckit-plan` pass when picked up, not be designed in full here.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: PASS — the halo uses the event's existing `type`/`magnitude`/`severity` fields through the already-hazard-agnostic `defaultBufferRadiusKm()`; no hazard-type-specific branching added by this feature beyond what already exists.
- **Principle VI (Accessibility & i18n)**: PASS, with action — all new UI copy (slider label, halo legend, the "distance-based estimate, not a damage assessment" disclaimer required by FR-005) MUST go through `en.json`/`tr.json` (and ideally the other 5 locales, matching this project's known partial-coverage gap already tracked elsewhere) — no hardcoded strings. Color ramp MUST remain colorblind-considerate (reuse this project's existing Okabe-Ito-adjacent palette conventions from `exposureLayerColor.js` rather than a naive pure red-green gradient).
- **Principle VII (Performance)**: PASS — explicitly designed with zero new network round-trips for US1/US2 (see Performance Goals above); US3 explicitly deferred rather than rushed, given the real timeout lessons already learned this session.
- **Principle VIII (Simplicity/YAGNI)**: PASS — no new service/framework/dependency for US1/US2. US3 reuses the exact existing raster-importer container pattern (Deno container + `exposure_features`/`exposure_datasets`), not a new architecture.
- No violations requiring Complexity Tracking for US1/US2. US3's Complexity Tracking entry is captured below since it does add a new exposure source category, but the pattern itself is not new (already justified for DEM-slope in that spec).

## Project Structure

### Documentation (this feature)

```text
specs/050-hazard-impact-halo-visualization/
├── plan.md              # This file
├── research.md          # Phase 0 output — Overpass vs. Microsoft Building Footprints findings (also captured inline in spec.md's US3 research note)
├── data-model.md         # Phase 1 output — US3's building_footprints source only (US1/US2 need no schema)
├── quickstart.md         # Phase 1 output — manual test steps (select event, verify halo/slider/coloring)
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this plan)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── MapView.vue                    # US1: halo layer (source+fill+line), vertical slider in the event info card
│                                       # US2: distance-based recolor of existing osm-buildings points within halo radius
├── lib/
│   └── hazardBuffer.js                # UNCHANGED — reused as-is for halo radius (FR-001)
├── utils/
│   └── exposureLayerColor.js          # New: distance-to-severity color-ramp helper (shared by US2 now, US3 later)
└── i18n/locales/{en,tr,...}.json       # New strings: halo slider label, distance-estimate disclaimer (FR-005)

supabase/functions/shared/              # US3 only (future pass):
├── buildingFootprintsFetch.ts          # New, mirrors demSlopeFetch.ts's tile-fetch-and-merge shape
└── rasterSourceConfig.ts               # New BUILDING_FOOTPRINTS_SOURCE_CONFIG entry

raster-importer/                        # US3 only (future pass):
└── import-building-footprints.ts       # New, mirrors import-dem-slope.ts exactly

supabase/migrations/                    # US3 only (future pass):
└── <timestamp>_building_footprints_exposure_source.sql   # widen hazard_type CHECK + seed data_sources row, same pattern as 20260728090000
```

**Structure Decision**: No new top-level directories or services. US1/US2 are additive changes inside `MapView.vue` and `exposureLayerColor.js`, matching how every prior exposure-layer-styling feature (spec 042, spec 046) was implemented. US3, when picked up, follows the raster-importer container pattern byte-for-byte (already proven 3 times this session: WorldPop, GHSL, DEM-slope).

## Complexity Tracking

> Fill only for the parts of this plan that add real complexity beyond "modify an existing file."

| Addition | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|---------------------------------------|
| New `building_footprints` exposure source (US3, future) | US3 cannot be built at all without real building-location data — confirmed live that `osm-buildings` is critical-infrastructure points only, not general buildings | Reusing `osm-buildings` was considered and rejected: live-verified it contains zero general building rows (only schools/clinics/police), so there is nothing to relabel — new data is unavoidable, not a design choice |
| New country-scoped (not whole-dataset) GeoJSON fetch RPC (US3, future) | A building-footprint dataset will be far larger than any existing exposure source; reusing `get_dataset_features_geojson`'s "aggregate the whole dataset in one call" shape would reproduce the exact 520/521 edge-proxy failure just fixed for WorldPop/Meta at a much smaller row count | Simply raising `get_dataset_features_geojson`'s own statement_timeout further (the fix applied to the existing function) was rejected as a future strategy here: that migration's own history shows raising the timeout alone stopped working once the proxy's own ceiling was hit, independent of the Postgres-side setting — the real fix is scoping the query (by halo radius/viewport), not a bigger timeout |
