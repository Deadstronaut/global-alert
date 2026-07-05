# Quickstart: Impact Analysis & Exposure Modelling Validation

## Prerequisites

- Migration `<timestamp>_impact_analysis.sql` applied (postgis extension, new tables, RPCs, RLS).
- `upload-exposure-dataset` and `geocode-search` Edge Functions deployed.
- `GEOCODING_API_URL`/`GEOCODING_API_KEY` secrets configured (or a test/mock endpoint for local
  verification — this is a per-deployment operator setting, not a hardcoded value).
- A small test GeoJSON FeatureCollection (a few polygons with a `population` property) for upload.

## Scenario 1 — Upload an exposure dataset

1. As org_admin/country_admin/super_admin, upload the test GeoJSON, naming `population` as the
   metric property.
2. **Expected**: dataset appears in the list with the correct feature count.

## Scenario 2 — Reject invalid upload

1. Attempt to upload a non-GeoJSON file, then a GeoJSON with coordinates far outside WGS84 bounds.
2. **Expected**: both rejected with a clear error; no `exposure_datasets`/`exposure_features` rows
   created for either attempt.

## Scenario 3 — Run a zonal-stats query

1. Select a detected hazard event whose location falls within the test dataset's polygons.
2. Select the uploaded dataset, run the analysis.
3. **Expected**: a non-zero summed population appears, using the per-hazard-type default radius
   (2^magnitude km for earthquake, or the severity table for other types).

## Scenario 4 — No-overlap result

1. Select a hazard event far from the test dataset's polygons.
2. Run the analysis.
3. **Expected**: a clear "no exposure data intersects this area" message, not an error or blank.

## Scenario 5 — Save and reload a scenario

1. Save the Scenario 3 analysis with a name.
2. Navigate away, then reload the saved scenario.
3. **Expected**: the same hazard event, dataset, and radius are restored; result matches.

## Scenario 6 — Deleted-dataset reference

1. Delete the exposure dataset used in Scenario 5's saved scenario.
2. Reload that scenario.
3. **Expected**: a clear "referenced data no longer available" state, not a crash.

## Scenario 7 — Split-view panel

1. Click a hazard event on the map.
2. **Expected**: details appear in a persistent side panel (map remains visible); selecting a
   different event updates the panel without a page reload.

## Scenario 8 — Geocoding search

1. Search a known place name.
2. **Expected**: map recenters/zooms there within a few seconds.
3. Search a nonsense query.
4. **Expected**: a clear "no results" state.

## Scenario 9 — Export

1. From a completed analysis, export CSV, JSON, and GeoJSON.
2. **Expected**: each file's content matches the on-screen result; the GeoJSON export contains the
   intersecting features' geometry and metric values.

## Scenario 10 — i18n

1. Switch locale through all 7 supported languages and open the Impact Analysis UI.
2. **Expected**: no raw i18n keys or hardcoded text in any locale.
