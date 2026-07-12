---

description: "Task list for Shapefile Exposure Dataset Upload (spec 023)"
---

# Tasks: Shapefile Exposure Dataset Upload

**Input**: Design documents from `/specs/023-shapefile-exposure-upload/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/exposure-upload.md,
quickstart.md

**Tests**: Included — `detectParserType()`'s extension-based branching is exactly the class of
easy-to-get-subtly-wrong logic the constitution flags for test-first treatment, matching this
project's established pattern (`occupancyPercentage()` in spec 021,
`formatIntegrationStatus()` in spec 022).

**Organization**: This spec has a single user story (US1) — the smallest-footprint feature in
this project's history, no backend/migration/RLS work at all.

## Format: `[ID] [P?] [Story] Description`

## Path Conventions

Single Vue 3 + Supabase project — `src/`, `tests/unit/` at repository root.

---

## Phase 1: Setup

- [X] T001 Add `shpjs` as a new dependency in `package.json` (client-side Shapefile-to-GeoJSON conversion, research.md Decision 1) and run the project's package manager install

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure file-type-detection function is shared by (and is the entire logic behind)
the single user story — nothing else can be built until it exists.

**⚠️ CRITICAL**: Complete this phase before starting the user story.

- [X] T002 [P] Create `src/utils/exposureFileParser.js` with `detectParserType(fileName)` per data-model.md (returns `'geojson'` for a name ending in `.json`/`.geojson` case-insensitive, `'shapefile'` for a name ending in `.zip` case-insensitive, `null` otherwise)
- [X] T003 [P] Create `tests/unit/exposureFileParser.test.js` covering `detectParserType()`: `.json` → `'geojson'`, `.geojson` → `'geojson'`, `.GEOJSON`/`.ZIP` (mixed case) → correct type, `.zip` → `'shapefile'`, `.csv`/`.txt`/no extension → `null`

**Checkpoint**: The pure detection function and its tests exist — nothing calls it from the
upload component yet.

---

## Phase 3: User Story 1 - Upload an exposure dataset as a Shapefile (Priority: P1) 🎯 MVP

**Goal**: A user can select either a GeoJSON file or a Shapefile `.zip` bundle and upload it
through the same existing exposure dataset upload flow, with the backend completely unaware of
which format the data originated from.

**Independent Test**: Upload a valid WGS84 Shapefile bundle and confirm a usable exposure dataset
is created; upload an existing GeoJSON file and confirm identical behavior to before; attempt a
non-WGS84 or malformed Shapefile and confirm rejection (quickstart.md Scenarios 1–5).

### Implementation for User Story 1

- [X] T004 [US1] In `src/utils/exposureFileParser.js`, add `parseExposureFile(file)` per data-model.md: calls `detectParserType(file.name)`; for `'geojson'`, `await file.text()` then `JSON.parse` (identical to today's inline logic); for `'shapefile'`, `await file.arrayBuffer()` then convert via `shpjs` — **`shpjs` returns an array of `FeatureCollection`s instead of a single one if the `.zip` contains multiple `.shp` layers (analysis finding U1)**: if the result is an array, throw a clear error ("multiple layers in one Shapefile bundle are not supported — upload a single-layer .zip") rather than passing the array through to the Edge Function, which expects a single object with a `.features` array; otherwise use the single `FeatureCollection` as-is; for `null` detection, throws an error identifying the file as an unsupported type before any read
- [X] T005 [US1] In `src/components/impact/ExposureDatasetManager.vue`, change the file input's `accept` attribute to include `.zip` alongside the existing `.json,.geojson`
- [X] T006 [US1] In `src/components/impact/ExposureDatasetManager.vue`'s `upload()` function, replace the inline `const text = await form.value.file.text(); const geojson = JSON.parse(text)` (lines 47-48) with `const geojson = await parseExposureFile(form.value.file)` — the subsequent `supabase.functions.invoke('upload-exposure-dataset', ...)` call and everything after it remains completely unchanged (contracts/exposure-upload.md — zero backend change)
- [X] T007 [US1] In `src/components/impact/ExposureDatasetManager.vue`, ensure `parseExposureFile()`'s thrown error (unsupported file type, or a Shapefile conversion failure) is caught by the existing `try/catch` in `upload()` and surfaced via the existing `error.value` display — no new error-handling UI needed, reuses the existing pattern

**Checkpoint**: User Story 1 fully functional and independently testable — Shapefile and GeoJSON
uploads both work through the same upload button, with the Edge Function untouched.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T008 [P] Add/confirm i18n coverage for any new user-facing error text introduced in T004/T007 (e.g. "unsupported file type") across all 7 `src/i18n/locales/*.json` files (tr/en/es/fr/ru/ar/zh) — reuse an existing generic error key if one already fits (e.g. `impact.errors.uploadFailed`) rather than adding a redundant one
- [X] T009 Run `npm run test` and confirm all existing and new tests pass with no regressions
- [X] T010 Run `npm run build` and confirm a clean build (verify `shpjs` bundles without error)
- [X] T011 Validate quickstart.md Scenarios 1–5. Scenario 3 was re-verified against actual behavior (2026-07-10): `shpjs` bundles `proj4` and reprojects any Shapefile with a recognized `.prj` to WGS84 at parse time — a non-WGS84 bundle with a valid `.prj` is therefore **accepted** (reprojected), not rejected; only a bundle with no/unrecognized `.prj` still hits the backend's WGS84 bounds rejection. Proven with a synthetic UTM 33N fixture built in `tests/unit/exposureFileParser.test.js` (both the reprojection-succeeds and no-`.prj`-passes-through-untransformed cases) — quickstart.md Scenario 3 updated to match. Scenarios 1/2/4/5 were already covered by `detectParserType()`/`parseExposureFile()` unit tests plus the T009/T010 clean test+build runs; a live click-through in the browser with real fixture files remains optional follow-up, not required to close this item.
- [X] T012 Update `docs/PROJE_DURUMU.md` and `docs/iş planı istereler.txt`: Impact Analysis module's remaining item ("Shapefile yükleme") is now closed — update completion percentage; note that weighted vulnerability indices + probabilistic simulation remain out of scope (separate "Risk & Scenario Modeling" module, unaffected)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup (needs `shpjs` installed for T002/T003, though
  `detectParserType()` itself doesn't call `shpjs` — only `parseExposureFile()` in T004 does) —
  BLOCKS the user story
- **User Story 1 (Phase 3)**: Depends on Foundational only
- **Polish (Phase 4)**: Depends on the user story being complete

### Parallel Opportunities

- T002/T003 (pure function + its tests) can be scaffolded in parallel, though T003 asserts
  against T002's actual output
- T008 (i18n) can run in parallel with T009/T010

---

## Implementation Strategy

### MVP First (and only — single user story)

1. Complete Phase 1: Setup (`shpjs` dependency)
2. Complete Phase 2: Foundational (`detectParserType()` + tests)
3. Complete Phase 3: User Story 1 (Shapefile upload wired into the existing component)
4. **STOP and VALIDATE**: quickstart.md Scenarios 1–5 — Shapefile upload works, GeoJSON upload is
   unregressed, invalid input is rejected clearly

### Incremental Delivery

This spec is small enough that "incremental" is effectively "single-pass": Setup + Foundational +
User Story 1 together deliver the entire feature; Polish (i18n/docs/test/build verification) is
the only remaining phase.

---

## Notes

- No migration, no RLS, no Edge Function change — the smallest-footprint spec in this project so
  far, verified by design: `upload-exposure-dataset/index.ts` and
  `supabase/functions/shared/geojsonValidation.ts` are not listed as modified anywhere in this
  task list
- Reuses the existing `try/catch`/`error.value` error-display pattern already in
  `ExposureDatasetManager.vue` — no new error-handling UI introduced
- No new route, no new admin tab — this is an in-place enhancement to an existing, already-visible
  UI element (the file input)
- Commit only when explicitly requested by the user
