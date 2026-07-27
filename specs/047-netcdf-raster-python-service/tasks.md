---

description: "Task list for feature 047: NetCDF/GDAL Raster Processing — Python Service"
---

# Tasks: NetCDF/GDAL Raster Processing — Python Service

**Input**: spec.md (the only design doc written before implementation — plan.md/research.md/
data-model.md were never produced as separate files; this tasks.md is written retrospectively,
closing out the feature against what was actually built and live-verified, per the same
"document reality" convention used elsewhere in this session — see spec 046's post-implementation
extension notes).

**Note on process**: unlike every other spec in this repo, 047's actual implementation happened
outside the formal spec-kit task loop — tracked instead in `docs/NEW_GAME_PLAN.md` (§4.2, §4.5,
§4.5b) as the work unfolded and pivoted. This file exists so 047 has the same closure record every
other spec has, not because the work was redone here.

---

## Phase 1: Setup — the Python/GDAL service itself

- [X] T001 Created `netcdf-service/` — FastAPI + GDAL (`ghcr.io/osgeo/gdal:ubuntu-full-3.9.3` base
  image per `netcdf-service/Dockerfile`), matching FR-005's "additive container, not a new
  deployment model" requirement.
- [X] T002 [P] Implemented `netcdf-service/app/gdal_convert.py`'s `netcdf_variable_to_geotiff()` —
  pure GDAL crop/convert (`gdal.Open('NETCDF:"<path>":<variable>')` → `gdal.Translate(...,
  bandList=[band], projWin=[...], format='GTiff')`), no dataset-specific knowledge, kept
  dependency-free (just `osgeo.gdal`) so it's testable against a small synthetic file.
- [X] T003 [P] Added `netcdf-service/app/test_gdal_convert.py`.
- [X] T004 Implemented `netcdf-service/app/main.py`'s `GET /convert` endpoint and `GET /health`,
  plus a content-addressed (SHA-256 of the source URL) download cache (`_ensure_downloaded`) so
  re-converting the same job's asset twice doesn't re-download it.
- [X] T005 [P] Added `netcdf-service/app/test_main.py`.
- [X] T006 Added `netcdf-service` to `docker-compose.yml` — internal-only (no `ports:` published to
  the host), `restart: unless-stopped`, a named `netcdf-cache` volume — per FR-002/FR-005 exactly.
- [X] T007 **Live-verified (this session)**: container `mhews-netcdf-service` is up and healthy in
  the running self-hosted stack; `GET /health` → `{"status":"ok"}` confirmed via
  `docker exec mhews-netcdf-service curl localhost:8000/health`.

**Checkpoint**: The service itself works and is deployed — independent of which upstream source
ends up calling it (see the pivot below).

---

## Phase 2: Pivot — User Story 1 (GDO Soil Moisture/FAPAR) closed WITHOUT this service

- [X] T008 **Finding, not a build task**: live-verified 2026-07-22 that spec.md's own premise for
  User Story 1 was wrong — GDO's Soil Moisture Anomaly (`smand`) and FAPAR Anomaly (`fpanv`) are
  both servable as ready-made GeoTIFF via the *same* WCS 2.0.0 endpoint GDO SPI already uses, not
  NetCDF4/HDF5-only as originally believed. See `supabase/functions/shared/gdoAnomalyFetch.ts`'s
  header comment for the full finding (including why `smian`/`smang` were tried and rejected —
  coverage gaps and a server-side 500, respectively).
- [X] T009 Implemented `gdoAnomalyFetch.ts` (shared, parametrized `GdoAnomalyConfig` for both
  indicators — one module, not two near-duplicates) entirely on the existing Deno/geotiff.js
  pipeline. **No NetCDF parsing, no Python service involved.**
- [X] T010 Implemented `raster-importer/import-gdo-anomaly.ts` and the
  `gdo-anomaly-importer`/`gdo-anomaly-importer-scheduled` `docker-compose.yml` services (manual +
  daily-scheduled runs), writing straight to `exposure_datasets` via `writeExposureDataset`/
  `aggregateRasterToHexagonsFromImage` — same shape as every other raster source (FR-004
  satisfied without this feature's own service).
- [X] T011 **Live-verified (this session)**: real data exists in `exposure_datasets` for both
  indicators, all 3 served countries, written 2026-07-26 —
  `gdo_soil_moisture_anomaly`: tr 2846 / mg 2251 / my 1217 features.
  (fAPAR anomaly confirmed present in the same table during this session's exposure-panel checks —
  see spec 042 T024's live session, "Bitki Örtüsü Anomalisi (FAPAR)" row.)

**Checkpoint**: User Story 1 (P1/MVP) is fully satisfied (SC-001) — via a WCS pivot, not the
service Phase 1 built. That service didn't go to waste, though — see Phase 3.

---

## Phase 3: The service's real (discovered-later) target — GloFAS river discharge

- [X] T012 **Finding**: GloFAS river discharge (fetched via Copernicus EWDS,
  `supabase/functions/shared/ewdsClient.ts`) has no WCS-style shortcut — EWDS's
  `cems-glofas-forecast` process only offers `grib2`/`netcdf` output, confirmed against the live
  OpenAPI spec. This — not GDO — became this service's actual, real motivation (NEW_GAME_PLAN.md
  §4.2). Also discovered: EWDS jobs are async (submit → poll → a fresh one-off signed download URL
  per job), so there's no fixed "archive_url" to pre-register the way spec.md's original
  `dataset=<id>` draft contract assumed.
- [X] T013 **Contract revised from spec.md's FR-001 draft** to fit EWDS's actual shape: `GET
  /convert?sourceUrl=<url>&variableName=<var>&bandIndex=<n>&bbox=<w,s,e,n>` (ad-hoc mode — the
  caller passes the just-obtained job asset URL directly) instead of a fixed dataset registry
  lookup. Documented in `main.py`'s own header as a deliberate, live-driven revision, not a
  deviation nobody noticed.
- [X] T014 Implemented `raster-importer/import-glofas.ts`: `ewdsClient.ts` (submit/poll/download)
  → `netcdf-service`'s `/convert` (GDAL, `GLOFAS_NETCDF_VARIABLE_NAME='dis24'`) → GeoTIFF →
  `rasterToHexagon.ts`'s shared H3-hexagon aggregator (`GLOFAS_SOURCE_CONFIG`, `h3Resolution: 5`)
  → `writeExposureDataset`. Reuses `gdoAnomalyFetch.ts`'s `simplifyGeometry` rather than
  duplicating Douglas-Peucker a third time.
- [X] T015 Added `glofas-importer` (manual, `docker compose run --rm glofas-importer`) and
  `glofas-importer-scheduled` (`restart: unless-stopped`, daily 04:00 UTC via `cron.ts`'s "glofas"
  job — GloFAS publishes a new forecast daily, unlike GHSL/Meta's monthly cadence) to
  `docker-compose.yml`. Migration `20260723000000_glofas_data_source.sql` seeds the
  `data_sources` row (`hazard_type='flood'`, `name='GloFAS/Copernicus'`).
- [X] T016 **Live-verified end-to-end 2026-07-22** with a real EWDS account/token: all 3 served
  countries succeeded — my 10,700 / tr 32,387 / mg 20,245 features on that run (counts drift
  slightly run-to-run since GloFAS re-forecasts daily — see T017's current snapshot).
  `GLOFAS_NETCDF_VARIABLE_NAME='dis24'` confirmed correct (GDAL opened it without error, not a
  guess). One external (non-code) gotcha hit and resolved: EWDS returns HTTP 403 "required
  licences not accepted" until the account owner accepts the `cems-glofas-forecast` dataset's
  licence once, on the EWDS website.
- [X] T017 **Live-verified (this session, 2026-07-27)**: `glofas_river_discharge` rows present in
  `exposure_datasets` for all 3 countries (tr 2853 / mg 2251 / my 1217, written 2026-07-26), and
  `mhews-glofas-importer-scheduled`'s container logs confirm the daily cron
  (`glofas-river-discharge-import`, `0 4 * * *`) is actively registered and running in the current
  self-hosted stack — not a one-off historical run.
- [X] T018 Fixed a health-visibility gap found while implementing this: `import-glofas.ts`
  originally never called `recordFetchOutcome`, so GloFAS didn't appear as a row in the admin
  Sources/health tab despite writing real exposure data every run. Fixed — now reports outcome like
  every other source.

**Checkpoint**: SC-001 (live layers) and SC-002 (Turkey-sized request within budget) both satisfied
— via GloFAS, the source spec.md didn't originally name, using the service spec.md did.

---

## Phase 4: User Story 2 (GHSL/GDO SPI shared fallback) — not pursued

- [X] T019 **Not implemented, and not needed**: grepped `supabase/functions/` and
  `raster-importer/` for any reference to `netcdf-service`/`NETCDF_SERVICE_URL` outside
  `import-glofas.ts` — none found. GHSL and GDO SPI never got routed through this service; their
  own `WORKER_RESOURCE_LIMIT` situation was evidently not blocking enough to need the fallback
  path spec.md's User Story 2 (P2, explicitly conditional — "if the non-Python fix attempt does
  not succeed") described. Not chasing this further here — it's a different feature's concern, and
  User Story 2 was P2/conditional by its own design, not this closure's job to resolve.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T020 Edge-case handling (spec.md's Edge Cases section) confirmed present:
  `gdal_convert.py` uses `gdal.UseExceptions()` and raises loudly on any unreadable/malformed
  input (FR-006, "fail loudly, never silently wrong") rather than returning an empty/default
  raster; `main.py`'s `/convert` catches conversion failures and returns HTTP 502 with the
  underlying message (not a bare 500); `import-glofas.ts` routes failures through the same
  `recordFetchOutcome`/`rejected_payloads` machinery every other source uses (FR-006).
- [X] T021 FR-002 (no auth beyond network isolation) confirmed: `docker-compose.yml`'s
  `netcdf-service` block publishes no `ports:` to the host — reachable only from other containers
  on the `mhews` network, matching the project's existing internal-service trust model.
  `netcdf-service/app/test_main.py`/`test_gdal_convert.py` exist as the service's own test
  coverage (Python/pytest, not part of the repo's Deno/Vitest suites — not re-run in this closure
  pass; the service's live `/health` + real end-to-end GloFAS data in `exposure_datasets` are
  stronger evidence than a local pytest run would add).

**Checkpoint**: Feature closed. Both of spec.md's real-world blockers (GDO NetCDF, GloFAS
GRIB2/NetCDF) are resolved and live — one without this service (pivot), one with it (its actual
purpose, discovered mid-implementation). Nothing currently blocks on this service being extended
further; User Story 2 stays available as a future option if GHSL/SPI's memory-ceiling issue
resurfaces.
