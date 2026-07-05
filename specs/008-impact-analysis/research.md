# Research: Impact Analysis & Exposure Modelling

## §1. Spatial storage shape

**Decision**: Two tables — `exposure_datasets` (one row per uploaded dataset: name, description,
metric property name, country_code/org_id, created_by) and `exposure_features` (one row per
GeoJSON Feature: `dataset_id` FK, `geom geometry(Geometry,4326)`, `metric_value DOUBLE PRECISION`,
`properties JSONB` for the rest of the feature's original properties).

**Rationale**: Storing one row per feature (rather than one row per dataset with an embedded
FeatureCollection) lets `ST_Intersects`/`ST_DWithin` filter and `SUM()` aggregate directly in SQL
with a GiST index, which is both simpler and faster than deserializing a whole FeatureCollection
per query.

**Alternatives considered**: A single JSONB column holding the whole FeatureCollection per
dataset — rejected because PostGIS spatial indexing/queries require a native `geometry` column,
not JSONB; querying would require parsing all features per request, defeating the point of an
index.

## §2. Per-hazard-type buffer radius (FR-006/Clarifications)

**Decision**: A pure JS dispatch table in `src/lib/hazardBuffer.js`:
`{ earthquake: (event) => 2 ** event.magnitude, default: (event) => SEVERITY_RADIUS_KM[event.severity] }`,
looked up by `event.type`, falling back to `default` for any type without its own entry.

**Rationale**: Matches the clarification exactly — per-type logic, not one global formula, so a
future hazard-specific field (e.g., wildfire burned-area) can become its own dispatch entry without
touching other types. Computed client-side (cheap, no DB round-trip) and passed as the query
parameter to `compute_zonal_stats()`.

## §3. Zonal statistics query

**Decision**: A `SECURITY INVOKER` (RLS-respecting) SQL function `compute_zonal_stats(dataset_id
UUID, center_lat DOUBLE PRECISION, center_lng DOUBLE PRECISION, radius_km DOUBLE PRECISION)`
returning `(total_value DOUBLE PRECISION, feature_count INTEGER)`, using
`ST_DWithin(geom::geography, ST_MakePoint(center_lng, center_lat)::geography, radius_km * 1000)`
to filter, then `SUM(metric_value)`/`COUNT(*)`.

**Rationale**: `::geography` cast makes `ST_DWithin`'s distance argument meters on a sphere
(accounts for real-world curvature) rather than raw degree-based planar distance, which would be
inaccurate at country scale. `SECURITY INVOKER` (the default) is sufficient since the function
only reads `exposure_features`, which already has its own RLS policy scoping visibility — no
elevated privileges needed, unlike spec 007's `verify_audit_chain()` which needed to bypass RLS
for a super_admin-only cross-cutting check.

**Alternatives considered**: `ST_Intersects` against a precomputed circular polygon — equivalent
result but `ST_DWithin` with a geography cast is the standard, index-friendly idiom for
"within X km of a point" and avoids constructing a polygon per query.

## §4. GeoJSON validation boundary

**Decision**: Validation happens entirely in `supabase/functions/shared/geojsonValidation.ts`
(pure function, Deno-testable): checks `type === 'FeatureCollection'`, every feature has a
`geometry` and `properties`, every coordinate pair is within `[-180,180]`×`[-90,90]` (WGS84 bounds
check — GeoJSON's spec mandates WGS84, so a `crs` member naming anything else, or coordinates
clearly outside lat/lng bounds, is rejected per FR-013), and at least one property across the
FeatureCollection is consistently numeric (the candidate metric property). The Edge Function
`upload-exposure-dataset` calls this validator first and only proceeds to insert rows if it
passes — on failure, nothing is written (FR-002).

**Rationale**: Extracting validation to a pure function (mirroring `createUserAuthorization.ts`
etc. from spec 004) makes it Deno-testable without spinning up the full handler, and guarantees
the "reject before writing anything" behavior structurally (validate-then-insert, not
insert-then-rollback).

## §5. Geocoding proxy

**Decision**: A new Edge Function `geocode-search` reads a per-deployment-configured endpoint/key
from Supabase secrets (e.g., `GEOCODING_API_URL`, `GEOCODING_API_KEY`) and proxies a single
query→coordinates lookup, returning a normalized `{ lat, lng, label }[]` result to the frontend.

**Rationale**: Keeps the actual provider (which varies per deployment/country, per the established
precedent that project-level external-service configuration is not hardcoded — specs 004/005) out
of both application code and the browser (an API key in frontend code would be publicly visible).

**Alternatives considered**: Calling a geocoding API directly from the browser — rejected because
it would expose the provider's API key client-side and hardcode a specific vendor into application
code, both undesirable per the per-deployment-configuration precedent.

## §6. 24h trend indicator (no charting library)

**Decision**: A pure function `classifyTrend(recentCounts)` in `src/lib/trendSparkline.js` takes
an array of hourly counts (already derivable from cached event timestamps in the existing disaster
store) and returns `{ direction: 'up'|'down'|'stable', points: number[] }` — rendered as a small
inline `<svg><polyline>` (a handful of lines of template, no library) plus an arrow glyph for
direction, inside `ImpactPanel.vue`.

**Rationale**: Satisfies "24-hour trend indicator" (Assumptions) without adding a charting
dependency, consistent with this project's current zero-chart-library baseline and Principle VIII.
