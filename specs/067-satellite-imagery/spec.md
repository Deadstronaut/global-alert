# Feature Specification: Satellite Imagery (Copernicus Data Space Ecosystem)

**Feature Branch**: `067-satellite-imagery`

**Created**: 2026-08-10

**Status**: Implemented

**Input**: User description: "Spec 066 parked satellite imagery ingestion pending a provider account, quoting Sentinel Hub's commercial pricing (~$10,000/month) as prohibitive. The underlying Sentinel-2 data is free via ESA's Copernicus Data Space Ecosystem (CDSE), which hosts the same Sentinel Hub API stack (Process API, OGC API, Catalog API, Statistical API) at no cost within a generous processing-unit quota. Project owner registered a free CDSE account and generated an OAuth client (Client Credentials flow); unblock and implement."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Admin requests satellite imagery for an active incident's area (Priority: P1)

An admin responding to an active hazard event wants a recent true-color satellite image of the
affected area for rapid visual assessment, without needing a GIS desktop tool or a paid API
subscription.

**Independent Test**: In the Satellite Imagery admin tab, enter a country and a bounding box,
click Request, and confirm a true-color PNG appears in the gallery within a few seconds.

**Acceptance Scenarios**:

1. **Given** an admin submits a valid country code and bounding box, **When** the request
   completes, **Then** a new `satellite_imagery` row is created and the image is viewable via its
   public storage URL.
2. **Given** a country_admin/org_admin submits a request, **When** the country code doesn't match
   their own, **Then** the request is rejected (403) — same authorization shape as
   `simulate-hazard-scenario`.
3. **Given** `COPERNICUS_CLIENT_ID`/`COPERNICUS_CLIENT_SECRET` are not configured, **When** a
   request is made, **Then** it fails with a clear 502 error rather than a silent/confusing
   failure.

### Edge Cases

- This is on-demand, not a scheduled cron import: a country's full extent at useful resolution
  would consume CDSE's free processing-unit quota quickly, and rapid damage assessment needs
  imagery for a specific area when actually needed, not a standing blanket import.
- Cloud coverage: defaults to a 30-day lookback window and 30% max cloud coverage filter so a
  request over a typically cloudy area still has a reasonable chance of returning a usable image,
  without the caller needing to know CDSE's query parameters.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `satellite_imagery` (country_code, bbox, requested date range,
  storage_path) and a public-read `satellite-imagery` storage bucket.
- **FR-002**: `import-satellite-imagery` MUST authenticate against Copernicus Data Space
  Ecosystem's identity service using a Client Credentials OAuth flow, reading
  `COPERNICUS_CLIENT_ID`/`COPERNICUS_CLIENT_SECRET` from Edge Function secrets — never from this
  database or any committed file.
- **FR-003**: The function MUST be callable only by `org_admin`/`country_admin`/`super_admin`, with
  the same country-scoping authorization as `simulate-hazard-scenario`.
- **FR-004**: The admin UI MUST let an admin specify a country and a bounding box and view the
  resulting imagery in a gallery.
- **FR-005**: This feature MUST NOT introduce any scheduled/cron ingestion — on-demand only, per
  the Edge Cases rationale above.

### Key Entities

- **satellite_imagery**: `country_code`, `bbox`, `collection`, `requested_from`, `requested_to`,
  `storage_path`, `source_name`, `requested_by`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can go from opening the tab to viewing a real satellite image in under 30
  seconds.
- **SC-002**: Zero recurring cost — verified against CDSE's free-tier Sentinel Hub Process API
  (live-tested 2026-08-10 with a real CDSE account, HTTP 200, valid PNG returned).

## Assumptions

- Copernicus Data Space Ecosystem's free tier (Sentinel Hub API stack, "Public" user category) is
  sufficient for this deployment's imagery request volume; if usage ever exceeds the free
  processing-unit quota, the same code works unmodified against paid Sentinel Hub (Process API's
  contract is identical) — only the OAuth client's origin/pricing tier would change.
- True-color (B02/B03/B04) Sentinel-2 L2A imagery is the initial use case; other evalscripts
  (NDVI, false-color, flood-water index) can be added later using the same Process API call shape
  without new infrastructure.
