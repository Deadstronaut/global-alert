# Implementation Plan: Impact Analysis & Exposure Modelling

**Branch**: `008-impact-analysis` | **Date**: 2026-07-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-impact-analysis/spec.md`

## Summary

Enable PostGIS on the existing Supabase Postgres database and add two new tables
(`exposure_datasets` + `exposure_features`, and `impact_scenarios`) plus a `compute_zonal_stats()`
RPC function for spatial sum queries. Add a GeoJSON-upload Edge Function (validates + inserts real
geometry), a thin geocoding-proxy Edge Function (per-deployment-configured provider), and frontend
work: an admin exposure-dataset manager, a 2-step impact analysis workflow with a persistent
split-view side panel (new `ImpactPanel.vue`, layered onto the existing `MapView.vue`), a geocoding
search box, and a dependency-free 24h trend sparkline. No hazard-ingestion pipeline changes.

## Technical Context

**Language/Version**: JavaScript/Vue 3 `<script setup>` (frontend), TypeScript (Deno 2.9.1 Edge Functions for GeoJSON upload + geocoding proxy), PL/pgSQL (migration)

**Primary Dependencies**: `@supabase/supabase-js` v2.97.0, MapLibre GL (existing map renderer), `h3-js` (existing), vue-i18n (existing); PostGIS (Postgres extension, not an npm dependency) for spatial storage/queries; no new npm charting/geocoding-client library — the geocoding proxy runs server-side so the frontend just calls the existing Supabase client against a new Edge Function.

**Storage**: Supabase-hosted PostgreSQL with `postgis` extension enabled. New tables: `exposure_datasets` (metadata), `exposure_features` (one row per GeoJSON feature, `geometry(Geometry,4326)` column + numeric metric value), `impact_scenarios` (saved hazard+exposure+parameter combinations).

**Testing**: Vitest for pure client-side logic (per-hazard-type buffer-radius calculation, sparkline trend classification, GeoJSON structural pre-validation before upload); Deno test for the upload Edge Function's structural-validation logic (extracted to `supabase/functions/shared/geojsonValidation.ts`, mirroring the established pure-logic-extraction pattern from specs 004/005/006); manual quickstart.md verification for the PostGIS spatial query itself (no local PostGIS test harness in this repo).

**Target Platform**: Existing Vue 3 SPA + Supabase Postgres/Edge Functions — no new platform; PostGIS is a Postgres extension, not a new service (Constitution Principle VIII).

**Project Type**: Web application (existing single frontend + Supabase backend, no new project structure).

**Performance Goals**: Zonal-stats queries must complete in a few seconds for this platform's realistic exposure-dataset sizes (thousands, not millions, of features per country-scoped dataset) — achieved via a GiST spatial index on `exposure_features.geom` and a single set-based `ST_Intersects`+`SUM` query, not per-feature iteration.

**Constraints**: GeoJSON uploads must be validated (structure, WGS84 coordinate bounds, at least one numeric property) before any row is written — partial/invalid uploads must not leave orphaned data (FR-002). The buffer-radius calculation must be structured per-hazard-type (a lookup/dispatch, not one global formula) so one type's logic can change independently (FR-006/Clarifications). The geocoding provider's endpoint/key is per-deployment configuration (Edge Function secret), never hardcoded to a specific vendor in application code.

**Scale/Scope**: Single/few-country deployment scale, consistent with prior specs — no multi-tenant-at-scale requirements beyond existing country/org RLS scoping.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Hazard-Agnostic)**: The buffer-radius dispatch is keyed by hazard `type` as data (a lookup object/table), not a hard-coded if/else chain requiring a code change to add a new hazard type's default — a new type without a specific formula falls back to the severity-based table. PASS.
- **Principle II (Scope Discipline)**: No new dissemination channel, no external identity federation, no CAP ingestion changes. The geocoding proxy calls one external HTTP endpoint (address→coordinates lookup) — this is a read-only utility lookup, not a new "channel" in the dissemination sense the constitution scopes (email/WhatsApp/web); it's closer to the existing pattern of calling external hazard-data APIs (USGS/GDACS/NASA FIRMS) already permitted for data ingestion. PASS.
- **Principle III (CAP v1.2)**: N/A — this feature doesn't touch CAP authoring. PASS.
- **Principle IV (Data Quality & Normalization)**: Exposure dataset uploads are validated (structure, coordinate bounds, required numeric property) before storage, and rejected uploads store nothing (FR-002) — directly consistent with this principle's "reject/flag malformed payloads rather than silently storing them." PASS.
- **Principle V (Access Control & Auditability)**: Exposure dataset upload/delete and scenario save/load are scoped by the existing country_code/org_id RLS pattern (specs 004/006) and logged via the existing `audit_log`/`log_table_change()` trigger (FR-014). PASS.
- **Principle VI (Accessibility & i18n)**: All new UI (exposure manager, impact workflow, split-view panel, geocoding search, sparkline) is new user-facing surface — full i18n from the start, all 7 locales (FR-015). PASS.
- **Principle VII (Performance & Resilience)**: Zonal-stats queries are index-backed set-based SQL, not client-side iteration over potentially large feature sets — keeps the map/analysis workflow responsive. The sparkline is computed from already-cached client-side event data (no new polling). PASS.
- **Principle VIII (Simplicity & YAGNI)**: PostGIS is a Postgres extension (not a new service) — the minimal-complexity way to get real spatial storage/queries, and is explicitly justified in Complexity Tracking below since it is the first use of a "new" capability (beyond core Postgres) in this project. Shapefile upload, weighted vulnerability indices, and forecast-integrated projected impact are explicitly deferred (Assumptions) rather than built speculatively. A full charting library is deliberately NOT added for the "24h trend" requirement — a dependency-free sparkline is used instead, proportionate to the project's current zero-chart-library baseline.

**Result**: PASS. The one Complexity Tracking entry: enabling PostGIS, justified below as the standard, minimal path to real spatial geometry/queries (the alternative — hand-rolling polygon-intersection math in application code — would be substantially more complex and error-prone for a life-safety-adjacent computation).

## Project Structure

### Documentation (this feature)

```text
specs/008-impact-analysis/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── hazardBuffer.js                 # NEW — pure per-hazard-type default buffer-radius
│   │                                     #   calculation (earthquake magnitude formula +
│   │                                     #   severity table fallback for other types)
│   └── trendSparkline.js               # NEW — pure 24h trend classification/series-shaping
│                                         #   from already-cached event timestamps
├── components/
│   ├── impact/
│   │   ├── ImpactPanel.vue             # NEW — split-view side panel: selected event details +
│   │   │                                 #   2-step impact workflow + results + sparkline
│   │   ├── ExposureDatasetManager.vue   # NEW — admin upload/list/delete exposure datasets
│   │   └── GeocodingSearch.vue          # NEW — search box calling the geocode-search Edge Function
│   └── MapView.vue                     # MODIFY — mount ImpactPanel.vue + GeocodingSearch.vue,
│                                         #   emit selected-event state for the panel to consume
└── i18n/locales/*.json                 # new `impact` key block, all 7 locales

supabase/
├── functions/
│   ├── upload-exposure-dataset/index.ts     # NEW — validates + inserts GeoJSON as PostGIS rows
│   ├── shared/geojsonValidation.ts          # NEW — pure structural/WGS84-bounds validation
│   ├── shared/geojsonValidation.test.ts     # NEW — Deno tests
│   └── geocode-search/index.ts              # NEW — thin proxy to a per-deployment-configured
│                                              #   geocoding endpoint (secret-configured)
└── migrations/
    └── <timestamp>_impact_analysis.sql       # NEW — postgis extension, exposure_datasets,
                                                #   exposure_features (+ GiST index), impact_scenarios,
                                                #   compute_zonal_stats() RPC, RLS policies, audit triggers
```

**Structure Decision**: Single existing project — PostGIS as a Postgres extension (no new service).
GeoJSON parsing/validation happens in an Edge Function (needs the service role to write geometry
reliably and keep validation off the client, consistent with Principle IV); the geocoding proxy is
a separate, minimal Edge Function so the actual provider endpoint/key never reaches the browser.
Pure calculation logic (buffer radius, sparkline shaping, GeoJSON structural validation) is
extracted into small testable modules mirroring the established pattern from specs 004-007.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Enabling the `postgis` Postgres extension (first use in this project) | Real spatial geometry storage + `ST_Intersects`/`ST_DWithin` zonal-statistics queries (FR-005/FR-006) | Hand-rolling point-in-polygon and circle-intersection math in application code (JS or plain SQL) would be significantly more error-prone for a life-safety-adjacent computation, duplicate well-tested spatial logic that PostGIS already provides, and still requires an index-backed spatial query to perform acceptably at any real dataset size — PostGIS is the standard, minimal-complexity solution already designed for exactly this problem, and is a database extension (not a new external service), keeping it within Principle VIII's intent. |
