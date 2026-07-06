# Implementation Plan: OGC WMS/WFS Map Layers

**Branch**: `012-ogc-wms-wfs` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-ogc-wms-wfs/spec.md`

## Summary

This closes the last named gap in the Data Ingestion & Monitoring module (MHEWS-FR-0037,
MHEWS-SD-MAP-03, constitution constraint C4 "OGC standards: consume only"). Unlike the existing
5 hazard-event `fetch-*` pipelines, OGC WMS/WFS data is not a `DisasterEvent` — it is a live,
admin-registered visual overlay rendered directly on the map. The approach: a new `map_layers`
admin registry table (separate from `data_sources`, since it never feeds the hazard-event
pipeline), reusing the existing hazard-taxonomy/SOP-repository RLS pattern (super_admin-only
writes), and a MapLibre GL integration in `MapView.vue` that adds a `raster` source (WMS, via a
tile-URL template built from the endpoint + layer name) or a `geojson` source (WFS, fetched live
via `GetFeature` with `outputFormat=application/json`), each with a layer-panel toggle and an
opacity slider using MapLibre's native `setLayoutProperty`/`setPaintProperty` calls — the exact
mechanism already used elsewhere in `MapView.vue` for the hexbin/heat layers.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API), SQL (PostgreSQL/Supabase)

**Primary Dependencies**: MapLibre GL JS (already the map's rendering engine, per MHEWS-SD-MAP-01),
Vue 3, Pinia, vue-i18n, Supabase JS client, Supabase Postgres (RLS)

**Storage**: PostgreSQL via Supabase — one new table, `map_layers`. No storage of external
WMS/WFS response payloads (FR-008: consume-only, rendered live).

**Testing**: Vitest for the pure URL-safety validation function (mirrors the existing project
convention of testing critical validation logic independently); no Deno Edge Function is involved.

**Target Platform**: Web (existing Vue SPA), 2D map view only (`src/components/MapView.vue`,
MapLibre GL-based) — the 3D globe view is explicitly out of scope per spec.md Assumptions.

**Performance Goals**: N/A beyond existing map rendering expectations; WFS feature-count limits
are explicitly out of scope per spec.md Edge Cases (no pagination/simplification introduced).

**Constraints**: Endpoint URLs MUST be HTTPS and MUST NOT resolve to a private/loopback address
(FR-002, mirrors the SRS's MHEWS-FC-INV-09 already named for `data_sources` but never
implemented there — this spec introduces the check for map layers, not retroactively for
`data_sources`, to stay in scope). Map layer management restricted to `super_admin` (FR-003).

**Scale/Scope**: 3 user stories, 1 new table, 1 new Pinia store, 1 new admin panel + form modal,
additive changes to `MapView.vue` for source/layer rendering plus a layer-control panel UI.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic, Model-Driven Design)**: PASS. Map layers are not hazard-typed at
  all — they are a generic visual-overlay registry independent of the hazard taxonomy, so this
  principle isn't implicated either way.
- **Principle II (Scope Discipline)**: PASS. This is explicitly the "OGC standards: consume only"
  constraint (C4) being fulfilled, not violated — the system never exposes its own WMS/WFS
  endpoint, only consumes external ones.
- **Principle III (CAP v1.2 Compliance)**: N/A — no CAP authoring/export logic touched.
- **Principle IV (Data Quality & Normalization)**: Deliberately N/A by design (FR-008) — WMS/WFS
  data is explicitly NOT normalized into `DisasterEvent`, NOT deduplicated, and NOT ingested/
  stored, since it is a live map overlay, not a hazard event. This is a conscious scope boundary
  documented in spec.md's Assumptions, not an oversight.
- **Principle V (Access Control & Auditability)**: PASS. Map layer CRUD is `super_admin`-only
  (FR-003), and the existing generic `log_table_change()` audit trigger will cover `map_layers`
  the same way it covers every other admin-managed registry table in this project.
- **Principle VI (Accessibility & i18n)**: PASS. All new UI text (layer panel, admin form) added
  via vue-i18n keys across all 7 locales, following the established generator-script pattern.
- **Principle VII (Performance & Resilience)**: PASS. An unreachable WMS/WFS endpoint fails to
  render silently (spec.md Edge Cases) rather than blocking the map or degrading other layers —
  consistent with this project's existing "degrade gracefully" resilience principle. No new
  polling loop is introduced (WFS is fetched once per toggle-on, not repeatedly).
- **Principle VIII (Simplicity & YAGNI)**: PASS. No new service, no health-monitoring state
  machine, no caching layer — deliberately simpler than `data_sources` because map layers don't
  feed any downstream pipeline (dedup, severity, dispatch) that would justify that complexity.

**Initial gate result**: PASS. No Complexity Tracking entries required.

**Post-Phase-1 re-check**: PASS, unchanged. `data-model.md` and `contracts/map-layers.md` confirm
the `map_layers` table and MapLibre integration stay within the patterns validated above.

## Project Structure

### Documentation (this feature)

```text
specs/012-ogc-wms-wfs/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
supabase/migrations/
└── 20260707150000_map_layers.sql          # NEW: map_layers table + RLS + audit trigger + URL safety check

src/utils/
└── mapLayerUrlSafety.js                    # NEW: pure isSafeLayerEndpointUrl(url) validator

tests/unit/
└── mapLayerUrlSafety.test.js                # NEW: Vitest coverage (HTTPS-only, private/loopback rejection)

src/stores/
└── mapLayers.js                             # NEW: Pinia store (fetch/create/update/deactivate)

src/components/admin/
├── MapLayerFormModal.vue                    # NEW
└── MapLayerRegistryPanel.vue                # NEW

src/components/
└── MapView.vue                              # MODIFIED: dynamic WMS raster source / WFS geojson source per active layer, layer-panel toggle + opacity slider UI

src/views/
└── AdminView.vue                             # MODIFIED: new super_admin-only "🗺️ Map Layers" tab

scripts/
└── add-map-layers-i18n.cjs                   # NEW: one-off i18n key injector (7 locales)
```

**Structure Decision**: Extension of the existing single Vue 3 + Supabase application. All new
files fit established directory conventions (`supabase/migrations/`, `src/stores/`,
`src/components/admin/`, `src/utils/`, `tests/unit/`, `scripts/`) already used by specs 009–011.

## Complexity Tracking

*No violations — table intentionally omitted.*
