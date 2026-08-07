# Phase 0 Research: Multi-Horizon Hazard Forecasting Dashboard

## 1. Short-range (15-day) horizon: data source

**Decision**: Extend the existing `wind-importer/fetch_gfs.py` GFS pipeline to request forecast
steps beyond `f000` (e.g. `f024`, `f072`, `f120`, `f168`, `f216`, `f264`, `f312`, `f360` — roughly
one point per day out to 15 days, thinning GFS's native 3-hourly resolution rather than storing
every step) instead of adding a new data source.

**Rationale**: `fetch_gfs.py`'s `filename()` already accepts a `forecast_hour` parameter (only
the caller hard-codes `FORECAST_HOUR = "f000"`), and the NOMADS filter URL/cycle logic is
identical for any forecast step — GFS publishes a single run containing all steps from f000 to
f384. This is the smallest possible change that satisfies FR-004, matching Constitution
Principle VIII (Simplicity/YAGNI): no new external service, just a new parameter value and a new
storage table to distinguish "this is a future step from cycle X" from the nowcast's f000 rows.

**Alternatives considered**: A dedicated forecast-specific model/API (e.g. commercial weather
API) was rejected — GFS already provides free, public, 16-day-out forecast steps and the app's
infrastructure (GDAL, GRIB2 parsing, texture generation) already exists for it; introducing a
second short-range source would duplicate the whole ingestion pipeline for no accuracy gain at
this range.

## 2. Medium/long-range (1-month, 3-month) horizon: data source

**Decision**: NOAA CFSv2 (Climate Forecast System version 2), raw ensemble GRIB2 output from
NOMADS (`https://nomads.ncep.noaa.gov/pub/data/nccf/com/cfs/prod/` — 7-day rotating archive of
the latest runs, 4 runs/day, 40-member ensemble over a rolling 10-day initialization window,
free, public, no API key required — live-verified via NOAA's own CFS downloads page,
cfs.ncep.noaa.gov/cfsv2/downloads.html). Ingestion computes a simple per-region tercile
classification (below/near/above-normal precipitation and temperature) by comparing the ensemble
mean against a static climatological reference, rather than a full statistical reforecast-based
calibration.

**Rationale**: CFSv2 is the only free, global-coverage, no-API-key seasonal/sub-seasonal product
readily available — matching the constitution's Simplicity/YAGNI principle (no paid vendor) and
the user's explicit instruction (spec.md Assumptions: prefer free sources, defer paid API-key
integrations). It natively covers both the ~1-month (monthly-mean forecast fields) and ~3-month
(seasonal-mean fields) horizons from the same source and ingestion code path, so this spec's two
outer horizons share one fetcher (`fetch_cfsv2.py`) with a `--lead-months=1` vs `--lead-months=3`
style parameter, not two separate integrations.

**Alternatives considered**:
- *NOAA CPC's pre-computed seasonal/monthly outlook GIS products* (shapefiles/rasters at
  `cpc.ncep.noaa.gov/products/GIS/`) were considered as a way to avoid computing anomaly
  classifications ourselves — **rejected** because CPC's official outlook products are scoped to
  the continental U.S. only (confirmed via NOAA/Drought.gov documentation), which does not fit
  this platform's country-agnostic federated deployment model (Turkey, Madagascar, and other
  served countries per `docker-compose.yml`'s tile-builder comments). A US-only product would
  silently fail FR-010 ("unavailable"/"not configured" state) for every non-US deployment as its
  *only* possible state, defeating the feature's purpose outside the US.
- *ECMWF SEAS5 / sub-seasonal products* were considered (mentioned in the original feature
  description as an alternative) — **rejected for the baseline** because ECMWF's forecast data
  products require a paid or registered-quota API (Copernicus Climate Data Store has a free tier
  but with request quotas and a non-trivial auth/token setup per deployment), which conflicts with
  the user's explicit "free if available, defer paid/API-key setup" decision on FR-011/FR-012.
  Documented here so a future spec can add ECMWF as an optional, better-resolution alternative
  source per deployment without re-doing this research.

## 3. Anomaly/tercile classification approach (1-month/3-month)

**Decision**: Classify each region's forecast ensemble-mean precipitation and temperature into
one of three buckets (`below_normal`, `near_normal`, `above_normal`) by comparing against a
fixed, versioned climatological baseline (documented, static reference values per region/month,
refreshed at most yearly — not recomputed live per ingestion run).

**Rationale**: A full tercile calibration against a rolling multi-decade reforecast (the
"proper" meteorological approach CPC itself uses) is out of proportion for this spec's baseline —
it would require ingesting and maintaining a separate multi-decade reforecast dataset per region,
which is a second, much larger data-engineering project. A fixed climatological reference is a
documented, transparent simplification (surfaced to the admin via FR-008's "clearly distinguish
probabilistic from deterministic" requirement, worded here as "outlook relative to typical
conditions for this month/region") consistent with Simplicity/YAGNI, while still being a real,
non-fabricated signal derived from actual CFSv2 output.

**Alternatives considered**: Full ensemble-percentile-based probability (e.g. "62% chance of
above-normal") was considered and rejected for the baseline as requiring the reforecast
calibration above; the simpler 3-bucket classification is flagged in `data-model.md` as
extensible to a percentage-based version later without a schema change (the `confidence` column
is designed to hold either representation).

## 4. Ingestion container shape

**Decision**: Reuse the existing `mhews-wind-importer:latest` Docker image (same
`wind-importer/Dockerfile`, already has GDAL + `requests` + `numpy`) and add three new scheduled
`docker-compose.yml` services (`forecast-15d-importer-scheduled`,
`forecast-1mo-importer-scheduled`, `forecast-3mo-importer-scheduled`), each invoking
`main.py` with a new `--forecast-horizon={15d,1mo,3mo}` flag, mirroring the exact pattern already
used by `wind-importer-scheduled`/`currents-importer-scheduled`/`overlay-importer-scheduled`/etc.

**Rationale**: This is not "adding a new service" in the Constitution's Simplicity/YAGNI sense —
it is the same image and same `*-importer-scheduled` compose pattern already proven for 20+
variables in this repo. Each horizon gets its own container (not one shared "forecast" container)
because the three sources genuinely have independent cadences and failure domains, matching the
existing rationale documented in `docker-compose.yml` for why `currents-importer-scheduled` and
`waves-importer-scheduled` are separate from `wind-importer-scheduled` rather than one combined
process.

**Alternatives considered**: A single combined `forecast-importer` container looping through all
three horizons was rejected — see Complexity Tracking table in plan.md.

## 5. Per-deployment horizon enable/disable (FR-009/FR-010)

**Decision**: Each horizon's ingestion container reads an environment flag
(`FORECAST_15D_ENABLED`, `FORECAST_1MO_ENABLED`, `FORECAST_3MO_ENABLED`, default `true`) from
`server/.env`, matching the `env_file`-per-deployment pattern every other importer already uses.
When disabled, the container exits immediately without writing any row, and the frontend Forecast
panel independently detects "no snapshot exists / none newer than N cycles" per horizon+region to
render the FR-010 "unavailable"/"not configured" state — no separate `is_enabled` database flag
is needed, since "no fresh data" is already an observable, honest signal per Constitution
Principle IV (no fabricated/default values).

**Rationale**: Reuses the exact per-deployment `.env` configuration mechanism the constitution
and existing `docker-compose.yml` already establish for this federated model, rather than
inventing a new configuration surface.

## 6. Frontend region selection

**Decision**: Reuse the free-text `region_code` convention already used by
`ContactFormModal.vue`/`ContactsPanel.vue` and `CapView.vue`'s dispatch targeting, rather than
introducing a new region-picker component.

**Rationale**: Consistent with the existing product-wide region concept (no separate "regions"
table/UI exists yet to build on), and matches spec.md's Assumption that forecast region selection
reuses the existing region concept rather than introducing a new one.
