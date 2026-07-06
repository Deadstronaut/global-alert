# Feature Specification: Shapefile Exposure Dataset Upload

**Feature Branch**: `023-shapefile-exposure-upload`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Impact Analysis modülünün spec 008'de bilinçli olarak ertelenmiş tek somut kalemi: Shapefile (.zip: .shp+.shx+.dbf+.prj) formatında exposure dataset yükleme desteği — şu an sadece GeoJSON destekleniyor. Kapsam: client-side bir shapefile-parsing kütüphanesiyle .zip dosyasını GeoJSON'a çevirip, mevcut upload-exposure-dataset Edge Function'a aynı payload şekliyle göndermek (sıfır backend değişikliği). WGS84 olmayan projeksiyonlu shapefile'lar için otomatik reprojeksiyon kapsam dışı (mevcut WGS84 doğrulaması zaten reddedecek)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload an exposure dataset as a Shapefile (Priority: P1)

An analyst preparing an impact-analysis exposure dataset (e.g., population, building footprints,
infrastructure) has that data as a Shapefile — the format most GIS tools and government/NGO data
providers export by default — rather than GeoJSON. They want to upload it directly, the same way
they already upload a GeoJSON file, without needing to convert it themselves in a separate GIS
tool first.

**Why this priority**: This is the entire value of the feature — Shapefile is the more common
real-world exchange format for exposure data in this domain; without this, users are forced into
an external conversion step before every upload, which is exactly the friction spec 008 deferred
closing.

**Independent Test**: As an authorized administrator, select a `.zip` file containing a valid
Shapefile bundle (`.shp`/`.shx`/`.dbf`/`.prj`, WGS84 coordinates) and a metric property name;
upload it; confirm the resulting exposure dataset appears with the same feature count and is
usable in the existing impact-analysis workflow exactly as a GeoJSON upload would be.

**Acceptance Scenarios**:

1. **Given** a valid Shapefile bundle in WGS84 coordinates, **When** an administrator uploads it
   with a metric property name that exists in the Shapefile's attribute table, **Then** the
   system creates an exposure dataset with one feature per Shapefile record, usable identically to
   a GeoJSON-uploaded dataset.
2. **Given** the existing GeoJSON upload path, **When** a user uploads a `.geojson`/`.json` file
   as before, **Then** the upload behaves exactly as it did before this feature existed (zero
   regression).
3. **Given** a Shapefile bundle in a non-WGS84 projection, **When** an administrator attempts to
   upload it, **Then** the system rejects the upload with a clear message that only WGS84
   coordinates are supported, rather than silently importing incorrectly-placed geometry.

---

### Edge Cases

- What happens when a `.zip` file is selected but doesn't contain a valid Shapefile bundle
  (missing `.shp`/`.dbf`, corrupted, or not a Shapefile at all)? The system MUST reject it with a
  clear error, the same way an invalid/malformed GeoJSON file is rejected today.
- What happens when the chosen metric property name doesn't exist in the Shapefile's attribute
  table for some or all records? The system MUST apply the same existing per-feature numeric
  metric validation used for GeoJSON uploads today — a Shapefile-sourced dataset is not held to a
  looser or stricter standard.
- What happens when the Shapefile contains a geometry type not already supported for GeoJSON
  uploads (e.g., something other than point/polygon/multipolygon)? The system MUST reject those
  features (or the whole upload) using the same existing geometry-type handling as GeoJSON —
  Shapefile support does not expand which geometry types this system accepts.
- What happens when a user selects a file extension the system doesn't recognize (neither
  `.geojson`/`.json` nor `.zip`)? The system MUST reject it with a clear "unsupported file type"
  message before attempting to parse anything.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authorized administrator to upload an exposure dataset as a
  `.zip` file containing a Shapefile bundle, in addition to the existing GeoJSON upload option.
- **FR-002**: System MUST automatically determine whether an uploaded file is a Shapefile bundle
  or a GeoJSON file based on the file itself — the user MUST NOT be asked to separately declare
  the format.
- **FR-003**: A Shapefile-sourced dataset MUST be subject to the exact same validation rules as a
  GeoJSON-sourced dataset (WGS84 coordinate check, per-feature numeric metric check, supported
  geometry types) — no separate or reduced validation path.
- **FR-004**: System MUST reject a Shapefile bundle whose coordinates are not in WGS84, with a
  message explaining that only WGS84 is supported (no automatic reprojection).
- **FR-005**: System MUST reject a malformed or incomplete Shapefile bundle (missing required
  component files, corrupted, or not actually a Shapefile) with a clear error, without partially
  creating a dataset.
- **FR-006**: The existing GeoJSON upload path MUST continue to behave identically to how it did
  before this feature existed (zero regression).
- **FR-007**: A successfully uploaded Shapefile-sourced dataset MUST be indistinguishable, in
  every downstream use (zonal statistics, map display, scenario analysis), from a dataset uploaded
  as GeoJSON with equivalent data.

### Key Entities

- **Exposure Dataset** (existing entity, unchanged shape): the feature only adds a second
  supported source file format for creating this same entity — no new fields or relationships.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload a valid Shapefile exposure dataset in under 2 minutes, the same
  order of effort as an equivalent GeoJSON upload.
- **SC-002**: 100% of existing GeoJSON uploads continue to succeed and produce identical results
  to before this feature existed.
- **SC-003**: 100% of non-WGS84 or malformed Shapefile upload attempts are rejected with a clear,
  actionable error message rather than a silent failure or corrupted dataset.
- **SC-004**: Zero difference in downstream impact-analysis behavior (zonal statistics results,
  map rendering) between a dataset sourced from Shapefile and an equivalent one sourced from
  GeoJSON.

## Assumptions

- Only Shapefiles already in WGS84 (EPSG:4326) coordinates are supported in this iteration —
  automatic reprojection from other coordinate reference systems is out of scope, matching the
  effort/complexity boundary this project's constitution (Principle VIII, Simplicity/YAGNI) sets;
  a clear rejection message is the expected behavior for non-WGS84 input, not a silent failure.
- This feature adds a second accepted source *file format* for the existing exposure dataset
  upload feature; it does not change any validation rule, storage schema, or downstream
  impact-analysis capability — everything documented as already true for GeoJSON uploads (spec
  008) remains true here, applied identically to Shapefile-sourced data.
- Geometry types not already supported for GeoJSON uploads remain unsupported for Shapefile
  uploads too — this feature does not expand the set of supported geometry types.
