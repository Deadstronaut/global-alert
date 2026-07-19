# Implementation Plan: Exposure Layer Map Visualization

**Branch**: `042-exposure-layer-map-visualization` | **Date**: 2026-07-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/042-exposure-layer-map-visualization/spec.md`

## Summary

Render every existing `exposure_datasets`/`exposure_features` row (OSM roads today; Kontur
population, HydroRIVERS, HydroBASINS once spec 041 lands) as an independently toggleable MapLibre
GL layer on the existing `MapView.vue`, with click-to-inspect popups, using entirely
geometry/attribute-driven generic code — no per-source special-casing. Reuses this codebase's
existing spec-012 WMS/WFS map-layer toggle pattern (`addWfsLayer`/`toggleMapLayer`/
`removeMapLayerRendering` in `MapView.vue`) almost verbatim, swapping the WFS `fetch()` call for
one new read-only Postgres RPC that returns a dataset's features as GeoJSON. This is a
visualization-only feature (FR-009): the only backend change is one additive, read-only SQL
function — no changes to `exposure_datasets`/`exposure_features` schema, import pipelines, or
validation.

## Technical Context

**Language/Version**: Vue 3 (Composition API) + JavaScript (frontend); PL/pgSQL (one new Postgres function)

**Primary Dependencies**: MapLibre GL JS (already in use — confirmed in `MapView.vue`, NOT Leaflet
despite a legacy `.map-leaflet` CSS class name), Pinia, Supabase JS client, vue-i18n

**Storage**: Supabase Postgres — read-only against existing `exposure_datasets`/`exposure_features`
tables (spec 038/040 schema); one new SQL function, no schema/table changes

**Testing**: Vitest for any new pure JS helpers (style/popup-content assembly functions); no
Deno/Edge Function tests needed (no Edge Function work in this feature)

**Target Platform**: Existing web app (desktop + mobile browser), same as the rest of `MapView.vue`

**Project Type**: Web application (existing Vue frontend + Supabase backend) — single existing project, no new project type

**Performance Goals**: Map remains interactive (pan/zoom, other layer toggles) while a 35,000+
feature layer is visible (spec's SC-003), matching the real OSM roads (Turkey) dataset already in
production (37,407 features)

**Constraints**: No new backend services (Constitution Principle VIII); GPU-rendered vector layers
preferred over per-feature DOM markers for large datasets (Constitution Principle VII); new UI
text via i18n only, colorblind-safe layer colors (Constitution Principle VI)

**Scale/Scope**: Today: 1 real dataset (OSM roads, Turkey, 37,407 features) across 2 served
countries (Turkey, Madagascar) with a third (Malaysia) also served; designed to scale to however
many exposure datasets exist per served country as spec 041 and future sources land

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design** — PASS. Layer list, styling, and popup content are
  all derived from `exposure_datasets`/`exposure_features` data (geometry type, `metric_value`,
  `properties` JSONB) at render time; adding a new exposure source (e.g. HydroRIVERS) requires
  zero changes to this feature's code (spec's FR-008/SC-004), matching this principle directly.
- **II. Scope Discipline** — PASS. No dissemination, identity, or CAP-ingestion surface touched.
- **III. CAP v1.2 Compliance** — N/A. This feature does not touch CAP authoring/export.
- **IV. Data Quality & Normalization** — PASS (N/A for new ingestion — this feature does no
  ingestion). Existing dataset freshness is already exposed via `data_sources`/Sources admin view
  (spec 038/040); this feature does not need its own freshness indicator since it renders
  already-validated, already-superseded data, not a live feed.
- **V. Access Control & Auditability** — PASS. Read-only rendering of data the user's existing RLS
  policies (`exposure_features_visible_with_dataset`, spec 008) already scope correctly; no new
  write paths, no new audit-relevant actions (toggling a layer view is not a security-relevant
  action per Principle V's list).
- **VI. Accessibility & Internationalization** — APPLIES. Layer-panel labels and popup field
  labels MUST go through vue-i18n; per-layer colors MUST be chosen from a colorblind-safe palette
  (tracked in research.md §4).
- **VII. Performance & Resilience by Design** — APPLIES, directly informs the design. MapLibre GL
  (GPU/WebGL vector rendering) is already the project's chosen approach for large event counts,
  consistent with "prefer canvas/GPU over naive per-feature DOM rendering" — this feature reuses
  that, it does not introduce Leaflet-style per-feature DOM markers.
- **VIII. Simplicity & YAGNI** — APPLIES. One new Postgres SQL function is the only backend
  addition; no new service, queue, or tile server. Considered and rejected: a dedicated vector-tile
  pipeline (e.g. Martin/pg_tileserv) — unnecessary complexity for the MVP's current data scale (see
  Complexity Tracking).

**Initial gate result: PASS, no violations requiring justification beyond the one Complexity
Tracking entry below (a deferred alternative, not a taken-on violation).**

## Project Structure

### Documentation (this feature)

```text
specs/042-exposure-layer-map-visualization/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── get-dataset-features-geojson.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
# Existing web application — Vue 3 frontend + Supabase backend (single project, no new project type)

src/
├── components/
│   └── MapView.vue                     # MODIFIED: add exposure-layer panel, generic
│                                        #   add/remove/toggle/popup functions mirroring
│                                        #   the existing addWfsLayer/toggleMapLayer pattern
├── stores/
│   └── exposureLayers.js               # NEW: fetches exposure_datasets (served-country scoped),
│                                        #   mirrors mapLayers.js's shape/conventions
└── i18n/
    └── locales/*.json                  # MODIFIED: new panel/popup labels, all 7 locales

supabase/
└── migrations/
    └── <timestamp>_exposure_layer_features_rpc.sql
                                         # NEW: get_dataset_features_geojson(dataset_id) —
                                         #   read-only SQL function, no table/schema changes

tests/ (Vitest, co-located per this repo's convention)
└── src/stores/exposureLayers.test.js   # NEW: store logic (served-country filtering) unit tests
```

**Structure Decision**: No new project/module boundary — this is additive work inside the existing
single-page Vue app (`src/`) and the existing Supabase backend (`supabase/migrations/`), following
the same file organization as the spec-012 WMS/WFS layer feature and spec 038/040's exposure work
it directly builds on.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none taken on)* | — | — |

**Considered and deferred (not a current violation, documented per Constitution Principle VIII's spirit):**

| Option | Why Deferred |
|--------|--------------|
| Server-side vector tiles (e.g. pg_tileserv/Martin) instead of a single GeoJSON RPC fetch | Adds a new backend service (violates Principle VIII) for a scale (tens of thousands of features, one dataset at a time) that MapLibre GL's native GeoJSON source already handles client-side; revisit only if a future dataset is proven too large for a single-fetch-and-render approach (see research.md §2 for the size/mitigation analysis). |
