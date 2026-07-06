# Quickstart: Shapefile Exposure Dataset Upload

## Prerequisites

- A test `.zip` Shapefile bundle in WGS84 coordinates (`.shp`/`.shx`/`.dbf`/`.prj`), and — for
  Scenario 3 — a second bundle in a non-WGS84 projection (e.g. a local UTM zone).
- A super_admin/country_admin/org_admin test account with access to the Impact Analysis exposure
  dataset manager.

## Scenario 1 — Upload a valid Shapefile bundle (US1, FR-001/FR-003)

1. Open the Exposure Dataset manager; select the WGS84 `.zip` bundle; enter a name and a metric
   property name that exists in the Shapefile's attribute table; upload.
2. **Expected**: the dataset appears in the list with the correct feature count, usable in the
   impact-analysis workflow (zonal statistics) exactly like a GeoJSON-uploaded dataset.

## Scenario 2 — Zero regression on existing GeoJSON upload (FR-006, SC-002)

1. Upload a previously-working `.geojson` file, exactly as before this feature existed.
2. **Expected**: identical behavior and result to before — same validation, same dataset creation.

## Scenario 3 — Reject a non-WGS84 Shapefile (FR-004, SC-003)

1. Select the non-WGS84 `.zip` bundle; attempt to upload.
2. **Expected**: rejected with a clear message that only WGS84 coordinates are supported; no
   partial dataset is created.

## Scenario 4 — Reject a malformed Shapefile bundle (FR-005)

1. Select a `.zip` file that is missing `.shp` or `.dbf`, or is not actually a Shapefile.
2. **Expected**: rejected with a clear error before any upload attempt; no partial dataset is
   created.

## Scenario 5 — Reject an unsupported file type (FR-002 edge case)

1. Select a `.csv` or `.txt` file.
2. **Expected**: rejected immediately with an "unsupported file type" message, without attempting
   to parse the file as either GeoJSON or a Shapefile.

## Validation commands

```sh
npm run test   # existing suite + new exposureFileParser.test.js must pass
npm run build  # clean build
```
