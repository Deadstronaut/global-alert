# Implementation Plan: Multi-Horizon Hazard Forecasting Dashboard

**Branch**: `055-hazard-forecasting-dashboard` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/055-hazard-forecasting-dashboard/spec.md`

## Summary

Add three forecast horizons (15-day deterministic, 1-month probabilistic, 3-month probabilistic)
on top of the existing nowcast-only GFS pipeline, surfaced as a new Forecast panel in the
dashboard's overview grid (`src/components/DashboardPlaceholder.vue`, next to the existing
`Earthquake*Chart` components). Short-range reuses the existing `wind-importer` Python/GDAL
container and `fetch_gfs.py` (already parameterized by `forecast_hour`, currently pinned to
`f000`) by adding a new forecast-specific fetch path that pulls f024/f072/f120/.../f360-class
steps instead of the nowcast's f000, storing results in a new `forecast_snapshots` table
(sibling to `flow_snapshots`/`overlay_snapshots`, texture-based). Medium/long-range reuse the
same container image with a new NOAA CFSv2 fetcher (free, no API key, GRIB2 over HTTP — same
shape as `fetch_gfs.py`), storing per-region probabilistic classifications in a new
`forecast_outlooks` table (tabular, not raster — no texture pipeline needed since CFSv2 output
here is a discrete anomaly/likelihood class per region, not a continuous field to render as a
map layer).

## Technical Context

**Language/Version**: Python 3.11 (ingestion, matches `wind-importer/Dockerfile`), Vue 3 +
`<script setup>` (frontend, matches `DashboardPlaceholder.vue`), SQL/PL-pgSQL (Supabase
migrations)

**Primary Dependencies**: `requests`, `numpy`, GDAL (already in `wind-importer/requirements.txt`
and `Dockerfile`) for GFS/CFSv2 GRIB2 fetch+decode; Supabase JS client + existing chart primitives
(`src/components/ui/chart/*`) for the frontend panel; no new frontend dependency.

**Storage**: Supabase Postgres (two new tables: `forecast_snapshots` for the 15-day raster/texture
layer, `forecast_outlooks` for the 1-month/3-month tabular probabilistic values) + Supabase
Storage (one new bucket `forecast-snapshots` for 15-day forecast textures, same public-read /
service-role-write shape as `overlay-snapshots`).

**Testing**: `wind-importer` has no existing Python test suite (verified by inspection — GDAL/
network-dependent fetchers are live-verified manually per the Dockerfile/compose comments), so
new fetchers follow that same project convention: manual live-verification documented in
`quickstart.md`, plus one deterministic unit test per pure-logic helper (e.g. forecast-step-to-day
mapping, CFSv2 anomaly-class thresholding) using `pytest` if/when introduced — not a hard
blocker, since the constitution's test-first zones (dedup, severity mapping, CAP XML, proximity)
don't cover ingestion fetchers. Frontend panel: `vitest`, matching `tests/unit/windLayerData.test.js`'s
existing convention for `src/utils/*` and dashboard components.

**Target Platform**: Linux containers (Docker), self-hosted per country deployment
(`docker-compose.yml`), consistent with every other `mhews-wind-importer:latest`-tagged service.

**Project Type**: Web application (Vue frontend + Supabase backend + Python ingestion
containers) — matches existing `docker-compose.yml` structure, no new project type introduced.

**Performance Goals**: Forecast panel loads and renders the selected horizon/region in under 2s
after data is cached client-side (SC-001's 30s end-to-end budget has generous headroom for a
Supabase read + chart render). Ingestion containers run within GFS's 6-hour cycle / CFSv2's own
publication cadence — no new latency requirement beyond "the panel's timestamp reflects the true
data age" (FR-007).

**Constraints**: Federated deployments MUST be able to enable/disable each horizon independently
(FR-009/FR-010) via `server/.env`-style config (matching every other importer's `env_file`
pattern) — no shared/central toggle. Free/open data sources only for baseline delivery (GFS,
NOAA CFSv2); no paid API keys required (per user decision on FR-011/FR-012 resolution in
spec.md's Assumptions).

**Scale/Scope**: One region-scoped read per horizon per dashboard session; ingestion writes at
most a few rows per horizon per cycle (15-day: ~8-12 forecast steps per GFS cycle; 1-month/
3-month: one row per region per CFSv2 run, region count bounded by each deployment's served
country/province list, matching `hazard_types`/`regions`-scale tables already in the schema).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Hazard-Agnostic, Model-Driven Design**: PASS. Forecast horizon/type is data (`horizon`,
  `variable` columns), not new hard-coded branches in core `DisasterEvent`/store logic. The
  Forecast panel is additive UI, not a rewrite of hazard modeling.
- **II. Scope Discipline**: PASS. No new dissemination channel, no new identity/auth mechanism,
  no CAP changes. Forecasting is a new *data display* capability, explicitly outside the three
  Scope Discipline bullets (dissemination/identity/CAP), so it does not trigger an amendment.
- **III. CAP v1.2 Compliance**: N/A. This feature does not author or export CAP alerts.
- **IV. Data Quality & Normalization**: PASS. New ingestion pipelines follow the same
  normalization discipline as `flow_snapshots`/`overlay_snapshots` (validated GRIB2 magic-byte
  check pattern from `fetch_gfs.py`, reject malformed payloads, no silent storage of bad data).
  FR-007 (data-freshness timestamp) directly satisfies this principle's "every displayed... layer
  MUST expose a data-freshness indicator" requirement.
- **V. Access Control & Auditability**: PASS. Forecast panel is read-only and dashboard-gated by
  existing role checks (`canRenderAdminTab`-equivalent visibility, or simpler: shown to any
  dashboard viewer since it's non-sensitive weather data, matching the existing `Earthquake*Chart`
  overview tiles which have no per-tab permission gate). New tables get the same
  `audit_*_snapshots`-style trigger as `overlay_snapshots` for INSERT/UPDATE/DELETE. No new role
  is introduced.
- **VI. Accessibility & Internationalization**: PASS. New UI text goes through `vue-i18n`
  (`dashboard.forecast*` keys added to all 7 locale files), no hard-coded strings; charts reuse
  existing colorblind-safe/dark-mode-aware chart primitives (`src/components/ui/chart/*`).
- **VII. Performance & Resilience by Design**: PASS. 15-day ingestion runs on GFS's own 6-hour
  cadence (matches `wind-importer-scheduled`'s existing interval reasoning); 1-month/3-month
  follow CFSv2's own publication cadence (research.md documents the exact interval). Panel shows
  cached/last-known data with a freshness timestamp rather than blocking on a live fetch,
  matching the offline-cache-first principle.
- **VIII. Simplicity & YAGNI**: PASS *with justification recorded below*. New Docker services are
  added, but this is not "introducing a new service class" — it is the same
  `mhews-wind-importer:latest` image and `docker-compose.yml` `*-importer-scheduled` pattern
  already used by 20+ existing services in this repo (wind, currents, waves, 15+ overlay
  variables). No new framework, queue, or database. See Complexity Tracking.

**Result**: No unjustified violations. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/055-hazard-forecasting-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output (Supabase table read contract)
└── tasks.md              # Phase 2 output (/speckit-tasks, not this command)
```

### Source Code (repository root)

```text
wind-importer/
├── fetch_gfs.py              # extend: add forecast-step fetch functions (15-day horizon)
├── fetch_cfsv2.py            # NEW: NOAA CFSv2 monthly/seasonal fetcher (1mo/3mo horizons)
├── forecast_texture.py       # NEW: GFS forecast-step GRIB2 -> texture (reuses grib_to_texture.py helpers)
├── forecast_outlook.py       # NEW: CFSv2 -> per-region anomaly/likelihood classification
└── main.py                   # extend: --forecast-horizon={15d,1mo,3mo} CLI mode

supabase/migrations/
├── <ts>_forecast_snapshots.sql            # NEW table + storage bucket + RLS + audit trigger
├── <ts>_forecast_snapshots_retention.sql  # NEW: 90-day retention (FR-012), cron job
├── <ts>_forecast_outlooks.sql             # NEW table + RLS + audit trigger
└── <ts>_forecast_outlooks_retention.sql   # NEW: 90-day retention (FR-012), cron job

src/components/dashboard/
└── ForecastPanel.vue         # NEW: horizon selector + region selector + chart/summary display

src/i18n/locales/*.json       # extend: dashboard.forecast* keys, all 7 locales

docker-compose.yml            # extend: forecast-15d-importer-scheduled,
                               #         forecast-1mo-importer-scheduled,
                               #         forecast-3mo-importer-scheduled
                               #         (same mhews-wind-importer:latest image, new CLI flags)

tests/unit/
└── forecastData.test.js      # NEW: unit tests for forecast panel data-shaping helpers
```

**Structure Decision**: Extends the existing single-repo layout (Vue frontend `src/`, Python
ingestion `wind-importer/`, Supabase `supabase/migrations/`, orchestration `docker-compose.yml`)
with no new top-level project. This mirrors spec 053/054's own structure decision exactly, since
forecasting is architecturally the same shape as those flow/overlay features (Python+GDAL
ingestion → Supabase → Vue display) with a new time dimension (horizon) instead of a new physical
variable.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| 3 new always-on Docker containers (`forecast-15d/1mo/3mo-importer-scheduled`) | Each horizon has a genuinely different source cadence (GFS 6-hourly, CFSv2 monthly-ish) and a stall in one must not block the others — this is the exact reasoning already documented in `docker-compose.yml` for `currents-importer-scheduled`/`waves-importer-scheduled` being separate from `wind-importer-scheduled`. | A single combined container/cron job was rejected because it would couple three independent failure domains and cadences into one process, contradicting the pattern this codebase already established and reverted away from being monolithic in spec 054's incremental history. |
