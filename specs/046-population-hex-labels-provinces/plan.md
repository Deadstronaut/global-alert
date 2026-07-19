# Implementation Plan: Population Hexagon Labels + Province-Level Population View

**Branch**: `046-population-hex-labels-provinces` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/046-population-hex-labels-provinces/spec.md`

## Summary

Two independent, frontend-only additions to the existing population exposure layer rendering
(spec 042/043/045): (1) render each population hexagon's aggregated value as an on-map text
label once cells are large enough to read, using MapLibre's built-in symbol-layer text (no new
data fetch — the value is already in each feature's `__metricValue` property); (2) add a second,
manually-toggled rendering mode that shades each province (using the app's already-bundled
`tr-provinces`/`my-provinces` boundary data) by the sum of population-layer features whose
centroid falls inside it, computed client-side with a point-in-polygon aggregation over the
already-fetched population GeoJSON — no backend change, no new data source.

## Technical Context

**Language/Version**: JavaScript (Vue 3 `<script setup>`), matching the rest of the frontend.

**Primary Dependencies**: MapLibre GL JS (existing, symbol layers for text labels). Province
point-in-polygon aggregation uses a small hand-written ray-casting helper rather than adding
`@turf/*` as a new frontend npm dependency — the backend already uses `@turf/boolean-point-in-polygon`
server-side (`rasterToHexagon.ts`) via a Deno remote import, but that is not the same as an npm
dependency of the Vite frontend bundle, and Constitution Principle VIII favors the smallest change
over adding a new bundled dependency for one bounded-size computation (at most a few hundred
province polygons checked against at most ~140K hex centroids). Uses the existing
`src/data/boundaries/index.js` (`loadRegionBoundaries(countryCode)`) — already handles the
DB-override-then-bundled-fallback-then-null lookup chain, already returns `null` gracefully for a
country with no data (Madagascar today), and is already lazy/cached. No new boundary-loading code
is needed; this feature only needs a new *consumer* of that existing function.

**Storage**: N/A — both parts render already-loaded `exposure_features` data (via the existing
`get_dataset_features_geojson` RPC) and already-bundled static province boundary files. No new
tables, no new columns.

**Testing**: Vitest (existing frontend unit test convention) for the population-count label
formatter (large-number abbreviation) and the province population-aggregation function
(point-in-polygon summation), plus `eslint`/`npm run build`. Live browser click-through not
available in this environment (no browser automation tool) — same documented caveat as specs
044/045.

**Target Platform**: Web (existing Vue/Vite SPA), same as all prior specs this session.

**Project Type**: Web application (single Vue frontend + Supabase backend) — this feature touches
only the frontend half.

**Performance Goals**: Label rendering must not visibly stall pan/zoom on the densest served
country's population layer (SC-002) — achieved by using MapLibre's native symbol-layer text
(GPU-composited, not per-feature DOM/SVG) and only enabling labels once the hex-resolution level
already caps total cell count (spec 045's `MAX_HEX_RES = 6`, reusing that existing cap rather
than introducing a new one). Province aggregation (point-in-polygon over up to ~140K hex-cell
centroids against a handful of province polygons) must complete without a noticeable UI freeze —
addressed by aggregating only the currently-visible/selected country's already-fetched dataset
(never all countries at once) and running the aggregation once per toggle, not per frame.

**Constraints**: No new backend data source, no new database tables/columns (FR-009). Must not
regress the existing hexagon rendering path, the manual resolution slider (spec 045), or the
per-country exposure-layer panel filtering (spec 044's Phase 8 fix). Must not error/blank-map for
a country lacking province boundary data (FR-007) — degrade to hexagon-only.

**Scale/Scope**: Up to ~140,000 hexagon features per country at the existing automatic maximum
resolution (spec 045 research.md §4's live-tested numbers); province counts are small (tens of
provinces per country), so the aggregation is bounded by hex-cell count, not province count.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: N/A — this feature is exposure/population-layer
  presentation, not hazard-type modeling; no hazard-type branching is introduced. PASS.
- **Principle VI (Accessibility & i18n)**: New UI text (province-view toggle label, abbreviated
  population number formatting, "no boundary data available" state) MUST be added through the
  i18n system across all 7 locales, matching every prior spec this session. Text labels drawn
  directly on the map canvas (hexagon population numbers) are numeric only (locale-neutral
  digits/suffixes), not translated strings, so no RTL concern there. PASS, tracked as a task.
- **Principle VII (Performance & Resilience)**: Directly addressed in Technical Context above —
  label rendering reuses MapLibre's native (GPU) symbol layers rather than DOM overlays, and
  province aggregation is scoped to one country's already-fetched data, run once per toggle.
  PASS.
- **Principle VIII (Simplicity & YAGNI)**: Reuses existing bundled province boundary data,
  existing `exposure_features`/`get_dataset_features_geojson` pipeline, and existing
  hex-resolution cap — no new service, no new table, no new npm dependency (point-in-polygon is a
  ~15-line ray-casting helper, not worth a library for this bounded use case). PASS.

No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/046-population-hex-labels-provinces/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── components/
│   └── MapView.vue                 # hexagon label layer + province-view toggle/rendering
├── utils/
│   ├── exposureLayerColor.js       # existing graduated color ramp — reused for province shading
│   └── formatPopulationLabel.js    # NEW: large-number abbreviation for hex labels (e.g. "482K")
├── data/
│   └── boundaries/                 # existing tr-provinces.json / my-provinces.json (reused, not modified)
└── i18n/locales/*.json             # new keys: province-view toggle, no-boundary-data state

tests/ (co-located *.test.js, existing Vitest convention)
├── formatPopulationLabel.test.js   # NEW
└── provincePopulationAggregation.test.js  # NEW
```

**Structure Decision**: Single-project Vue frontend (matches every prior spec this session — no
backend directory changes). New logic lives in small, focused utility modules
(`formatPopulationLabel.js`, a province-aggregation utility) rather than growing `MapView.vue`'s
existing inline logic further than necessary, consistent with how `exposureLayerColor.js` and
`exposureLayerLabel.js` were already split out in spec 042's UX-polish pass.

## Complexity Tracking

*No Constitution Check violations — table intentionally omitted.*
