# Data Model: Impact Analysis & Exposure Modelling

## `exposure_datasets` (new table)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | default gen_random_uuid() |
| name | TEXT NOT NULL | |
| description | TEXT | nullable |
| metric_property_name | TEXT NOT NULL | which original GeoJSON property holds the numeric metric |
| feature_count | INTEGER NOT NULL | denormalized count, set at upload time |
| country_code | VARCHAR(2) | scoping, mirrors cap_drafts/data_sources pattern |
| org_id | UUID REFERENCES organizations(id) ON DELETE SET NULL | |
| created_by | UUID REFERENCES auth.users(id) ON DELETE SET NULL | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

RLS: same shape as `cap_drafts` — super_admin all; country_admin own country_code; org_admin own
country_code+org_id; viewer no access (exposure data is an admin/analysis input, not public-facing
map content in this spec).

## `exposure_features` (new table)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | default gen_random_uuid() |
| dataset_id | UUID NOT NULL REFERENCES exposure_datasets(id) ON DELETE CASCADE | |
| geom | geometry(Geometry,4326) NOT NULL | PostGIS column, WGS84 |
| metric_value | DOUBLE PRECISION NOT NULL | the numeric metric for this feature |
| properties | JSONB | remaining original GeoJSON properties |

Index: `CREATE INDEX ON exposure_features USING GIST (geom);`

RLS: inherits visibility via a join to `exposure_datasets` (a row is visible only if its parent
dataset is visible to the current user) — implemented as a policy checking
`EXISTS (SELECT 1 FROM exposure_datasets d WHERE d.id = exposure_features.dataset_id AND <same
visibility rule as exposure_datasets>)`.

## `impact_scenarios` (new table)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | default gen_random_uuid() |
| name | TEXT NOT NULL | |
| hazard_event_snapshot | JSONB NOT NULL | immutable copy of the hazard event fields used (id, type, lat, lng, severity, magnitude, title, time) — a snapshot, not a live FK, since hazard events aren't stored in one canonical queryable table (research.md/Assumptions) |
| exposure_dataset_id | UUID REFERENCES exposure_datasets(id) ON DELETE SET NULL | real FK — set NULL (not cascaded) if the dataset is later deleted, so the scenario can still show "referenced data no longer available" (FR-009) rather than disappearing entirely |
| radius_km_override | DOUBLE PRECISION | nullable — overrides the computed per-hazard-type default when set |
| result_snapshot | JSONB | last computed total_value/feature_count, for quick display without recomputation on load |
| country_code | VARCHAR(2) | |
| org_id | UUID REFERENCES organizations(id) ON DELETE SET NULL | |
| created_by | UUID REFERENCES auth.users(id) ON DELETE SET NULL | |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

RLS: same country/org-scoped shape as `exposure_datasets`.

## `compute_zonal_stats()` (new RPC function)

```sql
compute_zonal_stats(dataset_id UUID, center_lat DOUBLE PRECISION, center_lng DOUBLE PRECISION, radius_km DOUBLE PRECISION)
RETURNS TABLE(total_value DOUBLE PRECISION, feature_count INTEGER)
```

`SECURITY INVOKER` (default) — relies on `exposure_features`'s own RLS policy for visibility
(research.md §3).

## `get_intersecting_features()` (new RPC function, for GeoJSON export — FR-012)

```sql
get_intersecting_features(dataset_id UUID, center_lat DOUBLE PRECISION, center_lng DOUBLE PRECISION, radius_km DOUBLE PRECISION)
RETURNS TABLE(id UUID, geom_geojson TEXT, metric_value DOUBLE PRECISION, properties JSONB)
```

Same `ST_DWithin` filter as `compute_zonal_stats()`, but returns per-feature rows (via
`ST_AsGeoJSON(geom)` for `geom_geojson`) instead of an aggregate, so the client can reassemble a
GeoJSON FeatureCollection for export. `SECURITY INVOKER`, same RLS-backed visibility.

## Audit

Both `exposure_datasets` and `impact_scenarios` get the existing generic
`audit_*` trigger (`AFTER INSERT OR UPDATE OR DELETE ... EXECUTE FUNCTION log_table_change()`),
matching the established pattern (specs 004/006/007) — no new logging code.

## Relationships summary

```
exposure_datasets 1───* exposure_features
exposure_datasets 1───* impact_scenarios (via exposure_dataset_id, ON DELETE SET NULL)
organizations 1───* exposure_datasets / impact_scenarios (via org_id, existing table)
```
