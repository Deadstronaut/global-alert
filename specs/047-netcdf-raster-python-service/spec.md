# Feature Specification: NetCDF/GDAL Raster Processing — Python Service

**Feature Branch**: `047-netcdf-raster-python-service`

**Created**: 2026-07-20

**Status**: Draft — prepared and held pending explicit go-ahead; not scheduled for implementation yet.

**Input**: User description: "Prepare a separate spec for the Python-related work and hold it — we'll do everything else first." Context: this project's Deno/Edge-Function raster pipeline (geotiff.js + h3-js, no GDAL/native dependency, per Constitution Principle VIII) is GeoTIFF-only. Two real drought/vegetation indicators the Data Sources Inventory has found live, working data for — the Global Drought Observatory's Soil Moisture Anomaly and FAPAR anomaly — are published ONLY as NetCDF4/HDF5 bulk archives (live-verified: HDF5 magic bytes, ~260MB/year per indicator) or as WMS "quicklook" rendered images (FAPAR anomaly specifically) — neither is raw, GeoTIFF-readable data. No pure-JS/Deno library exists for NetCDF4/HDF5 parsing or gamma-distribution statistical fitting comparable to what Python's `xarray`/`netCDF4`/`h5py`/`rasterio`/`scipy` ecosystem provides. This project already runs a persistent, non-serverless Docker container (`server/` — the Node.js "aggregator", see `docker-compose.yml`) for each self-hosted deployment, so adding a second, Python-based container is an additive service to an existing compose stack, not new deployment infrastructure or a new hosting model.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - GDO Soil Moisture Anomaly and FAPAR become live exposure layers (Priority: P1) 🎯 MVP

An analyst viewing the map's exposure-layer panel can toggle on GDO's Soil Moisture Anomaly and FAPAR anomaly layers for a served country, the same way they already can for SPI/population/roads/rivers — using real, current data pulled from GDO's NetCDF archives, not a placeholder or manually uploaded snapshot.

**Why this priority**: This is the entire value of the feature — it's the one concrete, already-identified blocker (not a hypothetical future need) that this service exists to unblock. Both indicators were found to have real, live, working upstream data during this session's research; only the format is unreadable by the existing pipeline.

**Independent Test**: For a served country, invoke the Python service's conversion endpoint for a known GDO NetCDF archive + a known month, confirm it returns a valid GeoTIFF (or equivalent array data) covering that country's bounding box, and confirm that output feeds into the existing `writeExposureDataset`/exposure_datasets pipeline exactly like GDO SPI's WCS-sourced GeoTIFF does today.

**Acceptance Scenarios**:

1. **Given** a served country and GDO's Soil Moisture Anomaly NetCDF archive for the current period, **When** the Python service is asked to extract that country's data, **Then** it returns a GeoTIFF (or array) the existing Deno-side raster pipeline can consume without modification.
2. **Given** the same request repeated for FAPAR anomaly, **Then** the same contract holds — one conversion service handles both indicators via a parameter, not two separate services.
3. **Given** a request for a country/period combination with no matching data in the archive, **When** the service processes it, **Then** it returns a clear "no data" response rather than a crash or a silently-empty file — mirroring this project's established "reject, don't default" convention (see `validatePayload.ts`/rejected_payloads).

---

### User Story 2 - GHSL and GDO SPI's shared memory-ceiling blocker gets a real fallback path (Priority: P2)

If the in-progress, non-Python attempt to fix GHSL's and GDO SPI's shared `WORKER_RESOURCE_LIMIT` (a different GeoTIFF library, or a larger Edge Function resource tier) does not succeed, this same Python service becomes the fallback: GeoTIFF parsing moves out of the Edge Function entirely and into this persistent container, which has no comparable per-invocation memory ceiling.

**Why this priority**: Not this feature's primary motivation (GDO Soil Moisture/FAPAR is, since NetCDF has no non-Python path at all), but the two problems share enough surface — both need "parse a raster outside the Edge Function's memory limits" — that solving one well should make the other close to free.

**Independent Test**: Route GHSL's (or GDO SPI's) existing per-country GeoTIFF through the Python service's raster-to-hexagon (or grid-cell) conversion instead of the Deno Edge Function, and confirm the resulting exposure dataset matches the shape/contract of the existing WorldPop/GHSL output.

**Acceptance Scenarios**:

1. **Given** the non-Python fix attempt for GHSL/GDO SPI is abandoned or fails, **When** this service is available, **Then** GHSL's/GDO SPI's import functions can be re-pointed at it with no change to `writeExposureDataset`'s contract.

---

### Edge Cases

- What happens when GDO changes its NetCDF file layout/variable naming (as it did once already, per the CHIRPS SPI folder's mid-archive bounding-box correction note found this session) without warning? → The service should fail loudly (a clear error surfaced through the existing `recordFetchOutcome`/health-state mechanism), not silently produce wrong values.
- What happens if the ~260MB archive download itself is slow/flaky? → Needs a real timeout and retry policy — this is a genuinely large file, unlike the small per-request GeoTIFFs the Edge Functions handle today.
- What happens if the Python container is down/unreachable when its Edge Function caller runs? → The caller should treat it like any other fetch failure (`recordFetchOutcome(sourceId, 'failure', ...)`), not crash the whole import invocation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST expose one internal-network-only HTTP endpoint (draft contract, see `gdoSpiFetch.ts`'s header comment): `GET /convert?dataset=<id>&countryCode=<cc>&bbox=<w,s,e,n>` returning either a GeoTIFF body (200) or `{ error: string }` (4xx/5xx), within a bounded timeout (~60s draft).
- **FR-002**: The service MUST NOT require authentication beyond network-level isolation (matches this project's existing internal-service trust model — the Edge Functions already hold the service-role key and call Supabase directly; this service is one more trusted internal hop, not a public-facing API).
- **FR-003**: The service MUST support at minimum GDO's Soil Moisture Anomaly and FAPAR anomaly NetCDF archives; the interface SHOULD be generic enough that GDO SPI/GHSL's GeoTIFF-conversion needs (User Story 2) fit the same contract without a second service.
- **FR-004**: Conversion output MUST be directly consumable by the existing `writeExposureDataset`/`ExposureFeatureInput` contract (or the equivalent grid-cell shape GDO SPI's Edge Function already produces) — no new ingestion path on the Deno/Supabase side.
- **FR-005**: The service MUST be added to `docker-compose.yml` as a new service block (mirroring `aggregator`'s `restart: unless-stopped`, persistent-container pattern) — not a new deployment model, not serverless.
- **FR-006**: Failures (missing data for a period, malformed archive, network failure fetching the archive) MUST be distinguishable from success in the response, so the calling Edge Function can route them through the existing `recordFetchOutcome`/`rejected_payloads` health-tracking machinery rather than treating every failure as a generic 500.

### Key Entities

- **NetCDF archive**: GDO's per-indicator, multi-year, multi-band HDF5-backed file (~260MB/year) — the service's primary input.
- **Conversion request/response**: the internal HTTP contract between an Edge Function and this service (FR-001).
- **GeoTIFF/array output**: the service's primary output — must slot into the existing raster pipeline's expected shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: GDO Soil Moisture Anomaly and FAPAR anomaly appear as live, toggleable exposure layers for at least one served country, sourced from real GDO data (not a manual upload).
- **SC-002**: The service handles a full country-sized conversion request (Turkey, the largest served country) within its timeout budget on a first attempt, without manual retry.
- **SC-003**: If GHSL/GDO SPI are re-pointed at this service (User Story 2), their existing `WORKER_RESOURCE_LIMIT` failures stop occurring.

## Assumptions

- The self-hosted deployment model (`docker-compose.yml`, one stack per country/customer) remains the deployment target — this spec does not address a fully-serverless/managed-cloud deployment, where "add a Docker container" would not be straightforward.
- GDO's NetCDF file layout stays reasonably stable; a layout change is an operational/maintenance concern for whoever implements this, not a blocking unknown at spec time.
- Python + GDAL + netCDF4/h5py + rasterio's larger image footprint (1-2GB, per this project's own prior research) is an acceptable one-time build/deploy cost for the given self-hosted model, not a per-request cost.

## Explicitly Out of Scope (for now)

- Meta/HDX Population's ~10-11GB-per-country raster problem — a different, larger disk-streaming problem than NetCDF parsing; not assumed to be solved by this service without further investigation.
- Any change to the existing Deno/Edge-Function raster pipeline itself (`rasterToHexagon.ts`, `geotiff.js` usage) beyond optionally routing specific sources through this new service.
