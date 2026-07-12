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

## Scenario 3 — Non-WGS84 Shapefile with a valid `.prj` (FR-004, SC-003)

**Verified 2026-07-10** (`tests/unit/exposureFileParser.test.js`): `shpjs` bundles its own `proj4`
and reprojects coordinates to WGS84 at parse time whenever the bundle includes a recognized
`.prj` file — this happens transparently, before the Edge Function's WGS84 bounds check ever
runs.

1. Select a `.zip` bundle in a different projection (e.g. a local UTM zone) that includes a
   correct `.prj` file; upload.
2. **Expected**: accepted — the Shapefile is silently reprojected to WGS84 and behaves exactly
   like a native WGS84 upload. No rejection occurs in this case.
3. Select a bundle with a **missing or unrecognized `.prj`** (or non-WGS84 coordinates with no
   `.prj` at all).
4. **Expected**: rejected — with no `.prj` to reproject from, raw projected coordinates pass
   through unchanged and the existing backend WGS84 bounds check (`geojsonValidation.ts`)
   rejects them with a clear message; no partial dataset is created.

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
