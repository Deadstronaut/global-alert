# Implementation Plan: Animated Wind Flow Visualization

**Branch**: `053-wind-flow-visualization` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/053-wind-flow-visualization/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add an animated, earth.nullschool.net-style particle-flow visualization to the existing 2D MapLibre map, covering two independently-toggleable Animate modes for v1: **Wind** and **Ocean Currents** (spec FR-009). Data comes from NOAA GFS (research.md §1 — GEOS-5/GMAO's own "research only" terms rule it out for this operational app), converted every 6 hours by a new scheduled importer into a compact RG-channel PNG texture (research.md §2–3 — the standard technique for this exact problem, and the only shape that fits the vector, continuously-animated nature of wind/current data, unlike this app's existing scalar-per-hex raster pipeline). Rendering reuses an existing, permissively-licensed MapLibre custom-WebGL-layer implementation (research.md §2) rather than writing a particle renderer from scratch — this will be the first `type: 'custom'` MapLibre layer in the codebase, called out explicitly below per Principle VIII.

## Technical Context

**Language/Version**: TypeScript/Deno (Supabase Edge Functions, matching existing conventions), Python 3.x (new scheduled importer, reusing `netcdf-service`'s existing GDAL-based Docker foundation), JavaScript/Vue 3 (frontend, `MapView.vue`)

**Primary Dependencies**: MapLibre GL JS (already in use), a vendored/adapted MapLibre wind-particle custom layer (research.md §2 — candidate: a MapLibre-ported fork of `openearth/windgl`, exact package pinned during `/speckit-tasks`), GDAL (Python, already used by `netcdf-service`), `@supabase/supabase-js` (already in use)

**Storage**: Supabase Postgres (new `flow_snapshots` table, data-model.md) + Supabase Storage (new bucket for PNG textures — first Storage usage in the Supabase-functions backend; frontend already uses Storage elsewhere per codebase precedent in `CommunityReportsPanel.vue`)

**Testing**: Vitest (frontend unit tests, existing convention — e.g. any pure decode/staleness-check helpers extracted from the layer, following this repo's pattern of testing pure functions like `disasterSourceBadges.js`), `node --test`-equivalent or Deno test for the importer's data-transform logic if written in a testable-unit shape

**Target Platform**: Existing 2D web map (browser), existing Docker Compose deployment model for the new scheduled importer

**Project Type**: Web application (existing frontend + Supabase backend + new scheduled Docker job) — fits this repo's established shape, no new project type introduced

**Performance Goals**: Smooth particle animation with no perceptible stutter (SC-003); enabling the layer must not degrade existing map interaction responsiveness (SC-004) — both directly dependent on using a GPU/WebGL custom layer (research.md §2), not a DOM/SVG or per-frame-JS-recompute approach, per constitution Principle VII's "canvas over SVG" performance guidance generalized to "GPU over per-frame JS" for this case

**Constraints**: No live third-party API calls from the browser (constitution Principle IV pattern + spec Assumptions) — all data reaches the frontend via Supabase, matching every other hazard layer; data freshness indicator required on the layer itself (constitution Principle IV, spec FR-004)

**Scale/Scope**: Global coverage (not country-scoped, unlike every existing exposure layer — spec is deliberately global-first for this feature), 2 Animate modes (Wind, Ocean Currents) refreshed every 6 hours, 2D map only (3D globe explicitly out of scope, spec FR-010)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Hazard-Agnostic, Model-Driven Design | ✅ Pass | New layer is additive config/data, not a rewrite of `DisasterEvent`, stores, or existing rendering layers. |
| II. Scope Discipline | ✅ Pass | No dissemination-channel, identity, or CAP surface touched. |
| III. CAP v1.2 Compliance | N/A | Feature has no alert-authoring/CAP surface. |
| IV. Data Quality & Normalization | ✅ Pass (with note) | Wind/current data does NOT flow through the `DisasterEvent` normalization model — it's not a discrete hazard event, it's a continuous field, same category-exception as this app's existing exposure/raster layers (population, rainfall) which also bypass `DisasterEvent`. Freshness indicator requirement (spec FR-004) is honored. |
| V. Access Control & Auditability | ✅ Pass | Public read-only data (research.md, contracts) — no new write-path or role scoping needed; nothing to audit beyond the existing importer-run logging convention. |
| VI. Accessibility & Internationalization | ⚠ Action required in tasks | Legend/labels/staleness messaging MUST go through the existing i18n system (all 7 locales) like every other UI string; reduced-motion "safe mode" MUST provide a non-animated fallback (e.g. static arrows/color fill) for the particle animation specifically — flagged as an explicit task, not optional polish, since this feature is animation-first by nature. |
| VII. Performance & Resilience by Design | ✅ Pass (drives design) | GPU/WebGL custom layer chosen specifically to satisfy this; graceful-degradation requirement (spec FR-006) matches "remain usable when network requests fail." |
| VIII. Simplicity & YAGNI | ⚠ Justified deviation — see Complexity Tracking | New Docker container (scheduled importer) and new Supabase Storage usage in the backend are both deviations from "stay within existing services" — justified below. |

## Project Structure

### Documentation (this feature)

```text
specs/053-wind-flow-visualization/
├── plan.md              # This file
├── research.md           # Phase 0 output
├── data-model.md          # Phase 1 output
├── quickstart.md          # Phase 1 output
├── contracts/
│   └── flow-snapshot-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Existing web-application layout (frontend + Supabase backend + Docker-based periodic importers) — no new top-level project type, extends the established `raster-importer/`-sibling pattern:

```text
src/
├── components/
│   └── MapView.vue                  # existing — gains the wind/current custom-layer wiring + toggle UI
├── stores/
│   └── ui.js                        # existing — gains windEnabled/currentsEnabled state (data-model.md)
└── vendor/ or lib/
    └── flow-particle-layer/         # NEW — adapted MapLibre wind-particle custom layer (research.md §2)

supabase/
├── migrations/
│   └── <timestamp>_flow_snapshots.sql   # NEW — data-model.md's flow_snapshots table + storage bucket

wind-importer/                       # NEW — sibling to raster-importer/, Python+GDAL, own Dockerfile
├── Dockerfile                       # based on netcdf-service's existing GDAL base image
├── fetch_gfs.py                     # NOMADS GRIB2 fetch (research.md §1)
├── grib_to_texture.py               # GRIB2 U/V → PNG+JSON conversion (research.md §2–4)
└── main.py                          # entrypoint, --layer-type/--once flags (quickstart.md)

tests/unit/
└── flowSnapshotStaleness.test.js    # NEW — pure staleness-check logic (contracts/flow-snapshot-contract.md §Frontend step 4), same pattern as disasterSourceBadges.test.js
```

**Structure Decision**: Extends the existing three-part shape (frontend `src/`, Supabase backend `supabase/`, Docker-based periodic importers) rather than introducing a new structural pattern. The one new top-level directory (`wind-importer/`) mirrors the already-established `raster-importer/` sibling directory exactly, just for a source whose format (GRIB2, vector) doesn't fit that existing importer's scalar/hex-oriented code.

## Complexity Tracking

> Required — Constitution Check above has two ⚠ entries needing justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New Docker container (`wind-importer/`), not reusing `netcdf-service` or `raster-importer/` as-is | GRIB2's GDAL access pattern (direct `gdal.Open`, band-indexed) doesn't fit `netcdf-service`'s NetCDF-subdataset-specific contract (`NETCDF:"path":variable`), and the job is a scheduled batch producing a combined U+V texture, not an on-demand single-band conversion — a structurally different job shape (research.md §4) | Extending `netcdf-service`'s HTTP endpoint to branch on GRIB2 was considered — rejected because nothing would ever call it on-demand (this data isn't fetched per-hex-import like every current `netcdf-service` caller), forcing an awkward synchronous contract onto what's actually a cron job. Doing the GRIB2 parsing in Deno/TypeScript instead of Python was also considered — rejected, no mature GRIB2 library exists in that ecosystem comparable to GDAL/wgrib2. |
| New Supabase Storage bucket usage in the backend pipeline (not `exposure_features`/JSONB) | Wind/current data is a small binary texture (PNG), not a relational scalar-per-row dataset — Storage is the natural fit for a binary blob, and `exposure_features`' scalar-per-hex shape structurally cannot represent vector flow data at all (research.md §3, confirmed by codebase research: `rasterToHexagon.ts` has no vector/band-pair concept anywhere) | Storing the texture as a base64 blob in a JSONB column was considered — rejected as needlessly reinventing what Supabase Storage already does for binary assets, with worse caching/CDN characteristics than a real Storage object. |
