# Phase 0 Research: Animated Wind Flow Visualization

## 1. Data source: NASA GEOS-5/GMAO vs NOAA GFS

**Decision**: NOAA GFS (Global Forecast System), surface/10m wind and an equivalent ocean-current product, via NOMADS.

**Rationale**: Spec FR-008 (per user decision) prefers GEOS-5/GMAO if practical, falling back to GFS otherwise. Research shows GEOS-5/GMAO's own documentation states forecasts are "experimental and are produced for research purposes only. Use of these forecasts for purposes other than research is not recommended" ([GMAO GEOS Near-Real Time Data Products](https://gmao.gsfc.nasa.gov/gmao-products/geos-near-real-time-data-products/)) — this app is an operational hazard-monitoring tool, not a research context, so this is a hard practical disqualifier, not a preference. Access is also more fragmented (NCCS portal, OpeNDAP, a point-query API for single lat/lng — no simple bulk-grid-download equivalent to GFS's filter API) ([GEOS-5 Forecast Products](https://www.nccs.nasa.gov/services/data-collections/coupled-products/geos5-forecast), [GEOS Composition Forecasts data access](https://gmao.gsfc.nasa.gov/gmao-products/geos-cf/data-access_geos-cf/)).

GFS, by contrast: free, public, no auth, real-time, updates every 6 hours (00/06/12/18 UTC cycles) — matching spec FR-007's chosen cadence exactly — with a documented, widely-used bulk-download filter API (`filter_gfs_0p25.pl`) at NOMADS ([NOMADS fast GRIB2 download](https://nomads.ncep.noaa.gov/info.php?page=fastdownload)) and mature tooling (`wgrib2`) for extracting the specific U/V wind-component fields needed.

**Alternatives considered**: GEOS-5/GMAO (rejected — research-only license terms), ECMWF/Copernicus (viable alternative, not evaluated in depth — GFS was sufficient and is the same source the reference-quality prior art (windgl, nullschool) is built on).

## 2. Rendering approach: animated particle flow on MapLibre GL

**Decision**: Adapt an existing open-source MapLibre wind-particle *custom layer*, built on the same technique as the original [openearth/windgl](https://github.com/openearth/windgl) project, rather than writing a WebGL renderer from scratch.

**Rationale**: This codebase's `MapView.vue` currently uses only standard MapLibre layer types (fill/line/circle/symbol/heatmap/raster/raster-dem/fill-extrusion) — no `type: 'custom'` (WebGL) layer exists anywhere in `src/` today (confirmed by codebase research). Animated particle flow has no standard-layer-type equivalent in MapLibre; a custom WebGL layer is unavoidable. Multiple already-MapLibre-ported, permissively-licensed forks of the original windgl technique exist and are purpose-built for exactly this: [maplibre-gl-particle](https://github.com/Oseenix/maplibre-gl-particle), [windgl-js](https://github.com/illogicz/windgl-js), [maplibre-gl-wind](https://github.com/geoql/maplibre-gl-wind). Building this from raw WebGL/GLSL would be a large, error-prone undertaking for a first-of-its-kind layer in this codebase; adapting a proven implementation is the YAGNI-compliant choice.

**Data format these libraries expect**: wind U/V components encoded as an RG-channel PNG texture in equirectangular (plate carrée) projection, with a small JSON sidecar giving `uMin/uMax/vMin/vMax` for decoding — not raw numeric grids. This shapes the storage/pipeline decision below.

**Alternatives considered**: Raw custom WebGL shader written in-house (rejected — reinvents a well-solved problem, highest risk/effort); deck.gl `IconLayer`/particle overlay running alongside MapLibre (rejected — introduces a second rendering framework, conflicts with Principle VIII/Simplicity).

## 3. Data shape & storage: why the existing raster→hexagon pipeline doesn't fit

**Decision**: Wind/current snapshots are stored as a small PNG texture (in Supabase Storage) + a JSON metadata sidecar (range values, issued-at timestamp) referenced by one lightweight DB row per snapshot — not as `exposure_features` rows (the existing one-row-per-hex pattern).

**Rationale**: Codebase research confirms `supabase/functions/shared/rasterToHexagon.ts` and every `exposure_features` row is strictly **scalar**-per-hex (`metric_value DOUBLE PRECISION`, one number) — population count, rainfall mm, slope degrees. Wind is a **vector** (direction + speed, i.e. two components per point) driving a continuous animated field, not a discrete per-hex fill — fundamentally the wrong shape for that pipeline, confirmed by `rasterSourceConfig.ts`'s `pixelValueMeaning` enum (`count|density|mean`) having no vector case. Forcing wind into that pipeline would mean inventing hex-level vector aggregation with no existing precedent, then throwing away the animation the whole feature is about. The PNG-texture approach is the established technique for exactly this problem (it's what the reference tool's own technical lineage uses) and happens to also be a very compact, cacheable artifact (a few hundred KB per snapshot at a coarse enough resolution) — a much better fit for "one snapshot every 6 hours, served to every client" than a large per-cell row set.

This is a deliberate deviation from this codebase's established exposure-data pattern — see `plan.md`'s Complexity Tracking for the explicit justification required by the project constitution.

## 4. GRIB2 → PNG texture conversion: reuse netcdf-service or add a new job?

**Decision**: A new, small, cron-scheduled Python container (reusing `netcdf-service`'s existing Python+GDAL Docker foundation, not its HTTP-request contract) that fetches the latest GFS U/V wind GRIB2 files from NOMADS every 6 hours, converts them to the PNG+JSON texture format, and uploads the result to Supabase Storage.

**Rationale**: Codebase research shows `netcdf-service` is a synchronous HTTP endpoint (`GET /convert?sourceUrl=&variableName=&bandIndex=&bbox=`) that opens files via GDAL's NetCDF-subdataset syntax (`NETCDF:"path":variable_name`) and returns a single-band GeoTIFF per call — built for on-demand, one-variable-at-a-time conversion (used by the raster→hexagon import path). GRIB2 files open differently in GDAL (direct `gdal.Open(path)`, bands selected by index/metadata, not named subdatasets), and this job needs to run on a schedule producing a combined two-component (U+V) PNG, not answer ad hoc per-request conversions — a different execution model (`raster-importer/cron.ts`'s `Deno.cron` scheduled-job pattern is the closer fit than netcdf-service's request/response pattern). Rather than distorting either existing service to do double duty, a new small Python container that starts from the same GDAL base image as `netcdf-service` (no new *class* of technology — same language, same core library, same containerization approach) but runs as its own scheduled job (mirroring `raster-importer/`'s `*-importer-scheduled` compose services, e.g. GloFAS's existing daily `0 4 * * *` cron entry, extended to a 6-hourly schedule) is the smallest change that fits. This is flagged in Complexity Tracking as a new container, with the justification above.

**Alternatives considered**: Extend `netcdf-service`'s HTTP contract with a GRIB2-aware branch (rejected — awkward fit for a scheduled batch job invoked by nothing, forces a caller to exist that doesn't otherwise need to); do the conversion in Deno/TypeScript (rejected — no mature GRIB2 library in the Deno/Node ecosystem comparable to GDAL/wgrib2, would mean re-implementing GRIB2 parsing).

## 5. Ocean current data

**Decision**: Same pipeline as wind (GFS-adjacent NOAA product — NOMADS also serves ocean current forecasts, e.g. via RTOFS — exact product to be pinned down in the data-model/tasks phase, not a blocker for this plan) — same PNG-texture shape, same 6-hour cadence, same storage pattern, rendered as a second, independently-toggleable instance of the same custom MapLibre layer type with a different source texture and land-masking (particles suppressed over land).

**Rationale**: Spec FR-009/FR-012 require Wind and Currents to ship together in v1 as independently toggleable layers — reusing one rendering mechanism and one storage/import pattern for both (rather than building two different systems) is the direct YAGNI-compliant reading of "both in v1."
