# Specification Quality Checklist: Multi-Horizon Hazard Forecasting Dashboard

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
- All clarifications resolved 2026-08-06: FR-011 (no frozen API contract required now, reasonably factored code is enough), FR-012 (90-day snapshot retention). Free/open data sources preferred over paid; paid API-key integrations deferred to a later per-deployment decision.
- Implementation status (2026-08-06, updated): tasks.md T001-T023 all complete — every user story (15-day GFS, 1-month CFSv2, 3-month CFSv2) is implemented and wired end-to-end: migrations, ingestion (`fetch_gfs.py`, `fetch_cfsv2.py`, `forecast_texture.py`, `forecast_outlook.py`), `docker-compose.yml` services for all three horizons, `ForecastPanel.vue` (handles all three horizons generically), i18n (7 locales), unit tests.
- Live verification performed (Docker image built with real GDAL, real network access, no writes to the project's live Supabase):
  - 15-day: all 8 GFS forecast steps x 3 variables (wind_speed, temperature, precipitation) fetched and texture-converted successfully against real NOMADS data. Two real bugs found and fixed this way: (1) the precipitation accumulation-window element name assumed 'APCP03'/'APCP06' but GFS's actual per-step bands are 'APCP06' + a step-varying cumulative-total element — fixed to use 'APCP06' uniformly; (2) domain/comments updated to match.
  - 1-month/3-month: real CFSv2 fetch against the public `noaa-cfs-pds` S3 mirror succeeded for both leads. Found and fixed: the original 1-fallback retry was insufficient for lead_months=3 (the two most recent cycles hadn't finished publishing that lead's monthly file yet — a real NOAA processing-lag behavior, not a bug) — widened to a 12-cycle backward search. Found and fixed: the assumed GRIB field names ('TMP' alone, 'PRATE') were wrong for this product (no plain surface TMP band — closest is `TMP@0.995-SIGL`; precip element is `APCP01m`, and its live-sampled magnitude matches an average-daily-rate in mm/day, not a month-total) — `GRIB_FIELD_BY_VARIABLE` and the climatology table were corrected and re-verified against 4 climatically distinct real coordinates (Amazon/Jakarta/Sahara/Istanbul) producing physically plausible classifications.
  - FR-009/FR-010 per-deployment disable flags live-verified for all three horizons (each skips before any network call, exit 0).
  - `country_boundaries`-based region-centroid listing verified against a mocked REST response (malformed/geometry-less features correctly skipped) — not run against the project's live Supabase data.
  - `docker compose config` validates the new services; full `vitest` suite (271 tests) and `vite build` pass with no regressions.
- **Intentionally not done**: full `quickstart.md` run against the project's actual live Supabase project (would require `supabase db push`-ing the new migrations and writing real rows to a shared instance) — left for the user to trigger explicitly rather than done unattended, per this session's own risk guidance on actions affecting shared systems. Live RLS enforcement (anon/authenticated actually blocked from INSERT/UPDATE/DELETE) was verified by code review against the identical, already-proven pattern used by `flow_snapshots`/`overlay_snapshots`, not by a live query against a real Postgres role. tasks.md T024/T026 left unchecked to reflect this; T027 (this note) done.
