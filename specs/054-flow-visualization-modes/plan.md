# Implementation Plan: Flow Visualization Modes & Overlays

**Branch**: `054-flow-visualization-modes` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/054-flow-visualization-modes/spec.md`

## Summary

Extend spec 053's flow-visualization panel with two new capabilities: an animated Waves layer (Ocean mode, WAVEWATCH III data, reusing the existing particle-flow rendering by converting height+direction into the same synthetic-vector texture format Wind/Currents already use) and a color-graded air-quality Overlay (Chem/Particulates mode, CAMS PM2.5 data, rendered as a standard MapLibre raster layer using this app's existing gridded-metric color-ramp convention). Space and Bio modes remain visible-but-disabled — no real data source was identified for either (research.md §5). Both new capabilities reuse spec 053's established patterns (Python+GDAL importer container, Supabase Storage + a lightweight metadata table, public-read RLS, "fail loudly keep prior data" refresh semantics) rather than introducing new architectural shapes.

## Technical Context

**Language/Version**: Python 3.12 (importer containers, matching spec 053's `wind-importer`), JavaScript/Vue 3 (frontend, matching the existing codebase)

**Primary Dependencies**: GDAL (raster conversion, existing `ghcr.io/osgeo/gdal:ubuntu-full` base image), `copernicusmarine`-family Copernicus API client for CAMS (new, parallel to spec 053's `copernicusmarine` for CMEMS), MapLibre GL JS `raster` source type (standard, no new library — unlike the particle layers, this needs no custom WebGL code)

**Storage**: Supabase Postgres (`flow_snapshots` CHECK-constraint migration + new `overlay_snapshots` table) + Supabase Storage (existing `flow-snapshots` bucket for waves, new `overlay-snapshots` bucket)

**Testing**: Vitest (frontend unit tests, matching existing `tests/unit/` convention for staleness/legend logic), manual live verification via quickstart.md (matching spec 053's own validation approach — no GRIB2/NetCDF fixture-based test harness exists in this repo for the importer containers)

**Target Platform**: Browser (2D MapLibre map only, matching spec 053's 2D-first scope), Docker containers (importers)

**Project Type**: Web application (existing Vue 3 + Supabase codebase) — this feature adds to it, not a new project

**Performance Goals**: Matches spec 053's SC-003/SC-004 — no perceptible pan/zoom stutter with all animated layers + the overlay enabled simultaneously

**Constraints**: CAMS and WAVEWATCH III fetches must not block the frontend (server-side scheduled import only, same as spec 053); Overlay coloring happens server-side at import time, not in the browser (research.md §4)

**Scale/Scope**: Two new layer types (Waves, air-quality Overlay), one new DB table, one new Storage bucket, one new (or extended) importer container — no new frontend rendering framework

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: N/A — this is a meteorological/environmental visualization layer, not a hazard-event type; doesn't touch `DisasterEvent`/hazard-type registry. ✅ Pass.
- **II. Scope Discipline**: No dissemination-channel, identity, or CAP changes. ✅ Pass.
- **III. CAP v1.2 Compliance**: N/A — no alert authoring involved. ✅ Pass.
- **IV. Data Quality & Normalization**: N/A for `DisasterEvent` (this isn't a disaster event type), but the same *spirit* applies and is honored: both new sources get freshness/staleness indicators (FR-008), matching Principle IV's data-freshness requirement even though the letter of the principle is scoped to hazard sources. ✅ Pass.
- **V. Access Control & Auditability**: New tables (`overlay_snapshots`) are public-read, system-write-only (via service-role importer), same as `flow_snapshots` — no new admin-editable surface, so no new RBAC/audit requirement beyond what spec 053 already established. ✅ Pass.
- **VI. Accessibility & Internationalization**: New UI text (Mode/Overlay labels, disabled-mode notes, wave/air-quality legend copy) MUST go through the existing i18n `windLayer` namespace (or a new namespace following the same pattern), across all 7 locales, matching spec 053's own i18n work. Reduced-motion: the Overlay is a static raster (no animation to reduce); Waves reuses `SimpleWindLayer`'s existing reduced-motion handling (T028, already implemented) with zero new code. ✅ Pass, with the i18n requirement carried into tasks.
- **VII. Performance & Resilience by Design**: Overlay refresh cadence matches its source's real cadence (FR-006), not a fixed generic interval — consistent with this principle's differentiated-cadence requirement. Graceful degradation (FR-008) reuses the existing pattern. ✅ Pass.
- **VIII. Simplicity & YAGNI**: **Flagged** — this plan adds one new DB table (`overlay_snapshots`) and very likely one new importer container (or a mode flag on the existing one) for CAMS. See Complexity Tracking below for justification; Space/Bio modes were deliberately cut to avoid two more speculative pipelines (research.md §5).

**Initial gate result**: PASS, with Principle VIII's new-table/new-container additions justified in Complexity Tracking (below) rather than blocking.

## Project Structure

### Documentation (this feature)

```text
specs/054-flow-visualization-modes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   ├── wave-snapshot-contract.md
│   └── overlay-snapshot-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Extends spec 053's existing structure — no new top-level project, consistent with Principle VIII:

```text
wind-importer/                       # existing (spec 053), extended
├── fetch_waves.py                   # new — WAVEWATCH III GRIB2 fetch (research.md §1)
├── wave_vector.py                   # new — height+direction → synthetic u/v (research.md §2)
├── fetch_overlay_cams.py            # new — CAMS PM2.5 fetch (research.md §3)
├── overlay_texture.py               # new — resample + server-side color ramp (research.md §4)
├── flow_texture_common.py           # existing (spec 053) — reused as-is for wave's vector encoding
├── main.py                          # existing — extended with 'wave' layer_type + overlay CLI mode
└── requirements.txt                 # existing — extended with the CAMS API client

supabase/migrations/
├── <timestamp>_flow_snapshots_add_wave_type.sql      # new — CHECK constraint update
└── <timestamp>_overlay_snapshots.sql                 # new — table + bucket + RLS, mirrors 20260805090000_flow_snapshots.sql

src/
├── vendor/simple-wind-layer.js      # existing (spec 053) — reused as-is for Waves, zero changes
├── components/
│   ├── MapView.vue                  # extended — 'wave' as a third flowLayerInstances entry; new raster-layer wiring for the Overlay
│   └── FlowControlPanel.vue         # extended — Mode grouping (Air/Ocean/Chem/Particulates/Space/Bio), Waves toggle, Overlay toggle + legend
├── stores/ui.js                     # extended — wavesEnabled, airQualityOverlayEnabled, selectedMode
├── utils/
│   ├── windLayerData.js             # existing (spec 053) — extended to also fetch overlay_snapshots
│   └── flowSnapshotStaleness.js     # existing (spec 053) — reused as-is (already layer_type-generic)
└── i18n/locales/*.json              # extended — windLayer namespace gains Mode/Waves/Overlay copy, all 7 locales

tests/unit/
├── windLayerData.test.js            # existing — extended for overlay_snapshots fetch
└── flowSnapshotStaleness.test.js    # existing — already generic, no change expected
```

**Structure Decision**: Additive-only extension of spec 053's existing layout — one importer container gains new fetch/convert modules (not a new container per se, though `main.py`'s CLI surface grows a new `--overlay-type` mode alongside `--layer-type`), two new migrations, and the two existing frontend components/stores that already own this feature area (`MapView.vue`, `FlowControlPanel.vue`, `ui.js`) are extended in place. No new frontend framework, no new backend service class — see Complexity Tracking for the one genuinely new piece (the `overlay_snapshots` table).

## Complexity Tracking

> Principle VIII (Simplicity/YAGNI) flagged one addition needing explicit justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New table `overlay_snapshots` (rather than reusing `flow_snapshots`) | The air-quality Overlay is a scalar, pre-colored raster with a fundamentally different shape than `flow_snapshots`' vector decode-range columns (`u_min/u_max/v_min/v_max`) — see data-model.md's "Why pre-colored" note | Reusing `flow_snapshots` with nullable overlay-specific columns was considered and rejected: it would leave every wind/current/wave row carrying unused `value_min`/`value_max` columns and vice versa, and conflate two different rendering paths (custom WebGL particle layer vs. standard MapLibre raster layer) behind one table — a worse fit than one small, honestly-scoped second table |
| CAMS as a second Copernicus credential/API surface (alongside CMEMS) | No viable free alternative for global aerosol/PM2.5 data was found beyond CAMS and the already-rejected GEOS-5 (research.md §3) | Reusing GEOS-5 (rejected in spec 053 for its research-only license) or skipping the Overlay capability entirely (rejected — it's explicitly in scope per the user's confirmed request and spec User Story 2) |
