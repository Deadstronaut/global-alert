# Implementation Plan: Shapefile Exposure Dataset Upload

**Branch**: `023-shapefile-exposure-upload` | **Date**: 2026-07-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/023-shapefile-exposure-upload/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Add Shapefile (`.zip` bundle: `.shp`/`.shx`/`.dbf`/`.prj`) as a second accepted source format for
the existing exposure dataset upload feature (spec 008), closing that spec's one deliberately
deferred item. A new client-side pure function detects which parser to use from the file
extension and converts a Shapefile bundle to a GeoJSON `FeatureCollection` in the browser (via a
new `shpjs` dependency); the result is fed into the exact same `upload-exposure-dataset` Edge
Function payload shape already used for GeoJSON uploads today. The Edge Function itself, its
GeoJSON validation, and the PostGIS write path are entirely unchanged — this is a client-side
format-conversion addition only, with zero backend risk.

## Technical Context

**Language/Version**: JavaScript (Vue 3 Composition API, Vite bundler)

**Primary Dependencies**: Vue 3, Supabase JS client (existing); `shpjs` (new, client-side
Shapefile-to-GeoJSON conversion — no equivalent dependency exists in this project today)

**Storage**: N/A for this feature — no schema change; the existing PostGIS `exposure_datasets`/
`exposure_features` tables (spec 008) are the eventual destination, reached through the unchanged
existing Edge Function

**Testing**: Vitest (`tests/unit/`) for the pure file-type-detection function

**Target Platform**: Web (browser) — `shpjs` runs entirely client-side, bundled by Vite

**Project Type**: Single Vue 3 + Supabase project (existing structure, no new project type)

**Performance Goals**: N/A — a one-off, user-initiated file upload action, not a hot path

**Constraints**: `supabase/functions/upload-exposure-dataset/index.ts` and
`supabase/functions/shared/geojsonValidation.ts` MUST NOT change (FR-006, zero regression on the
existing GeoJSON path). No automatic coordinate reprojection — non-WGS84 Shapefiles must be
rejected, not silently mishandled (FR-004), which the existing validation already does once the
Shapefile is converted to GeoJSON.

**Scale/Scope**: One new npm dependency, one new pure utility module + its test, a small edit to
one existing Vue component's file-read logic. No backend, migration, or RLS changes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: N/A — exposure datasets are not hazard types.
  PASS.
- **II. Scope Discipline**: No new dissemination channel, identity system, or CAP behavior
  touched. PASS.
- **III. CAP v1.2 Compliance**: N/A — untouched. PASS.
- **IV. Data Quality & Normalization**: N/A in the `DisasterEvent`/hazard-ingestion sense — this
  is exposure reference data, not disaster event data; its existing validation path
  (`geojsonValidation.ts`) is reused unchanged, not weakened, for the newly-supported format.
  PASS.
- **V. Access Control & Auditability**: No RLS/role change — the same `upload-exposure-dataset`
  authorization check (spec 008) governs both GeoJSON and now Shapefile uploads identically,
  since both arrive at the function as the same GeoJSON payload. PASS.
- **VI. Accessibility & Internationalization**: New error/UI text (e.g., "unsupported file type,"
  "only WGS84 supported") goes through the existing i18n system across all 7 locales. PASS.
- **VII. Performance & Resilience by Design**: N/A — not a polled/offline-cache concern. PASS.
- **VIII. Simplicity & YAGNI**: Adds exactly one new dependency (`shpjs`) to close spec 008's
  explicitly-deferred, well-scoped gap; explicitly does NOT add coordinate reprojection or expand
  supported geometry types — smallest change that satisfies this iteration's acceptance criteria.
  PASS.

No violations — Complexity Tracking table is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/023-shapefile-exposure-upload/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/utils/
└── exposureFileParser.js         # new: detectParserType(fileName), parseExposureFile(file)

src/components/impact/
└── ExposureDatasetManager.vue    # modified: accept=".json,.geojson,.zip", uses
                                   # parseExposureFile() instead of inline JSON.parse

package.json                      # modified: new `shpjs` dependency

tests/unit/
└── exposureFileParser.test.js    # new: detectParserType() tests

supabase/functions/upload-exposure-dataset/
└── index.ts                      # UNCHANGED — same payload shape, same validation
```

**Structure Decision**: Single Vue 3 + Supabase project (existing repository layout, no new
project/package). This is the smallest-footprint spec in this project's history so far — one new
client-side utility file, one small edit to an existing component, no backend/migration/RLS work
at all.

## Complexity Tracking

*No Constitution violations — table not applicable.*
