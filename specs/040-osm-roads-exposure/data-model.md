# Phase 1 Data Model: OSM/Overpass Road Network Exposure Source

## Schema changes

### 1. Widen `data_sources.hazard_type` / `rejected_payloads.hazard_type` CHECK

Additive only, layered on top of spec 038's widening (must re-state the full allowed set — Postgres
`CHECK` constraints are replaced, not merged, by each `ADD CONSTRAINT`):

```sql
ALTER TABLE data_sources DROP CONSTRAINT IF EXISTS data_sources_hazard_type_check;
ALTER TABLE data_sources ADD CONSTRAINT data_sources_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads'
  ));

ALTER TABLE rejected_payloads DROP CONSTRAINT IF EXISTS rejected_payloads_hazard_type_check;
ALTER TABLE rejected_payloads ADD CONSTRAINT rejected_payloads_hazard_type_check
  CHECK (hazard_type IN (
    'earthquake', 'wildfire', 'flood', 'drought', 'food_security',
    'tsunami', 'epidemic', 'multi_hazard',
    'population', 'roads'
  ));
```

### 2. New `hazard_types` row (mirrors `'population'`'s precedent, spec 038 §4)

```sql
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('roads', 'Road Network', 'exposure', 'Road network exposure data from OpenStreetMap (not an alertable hazard) — used by Impact Analysis')
ON CONFLICT (code) DO NOTHING;
```

`hazard_types.category` already accepts `'exposure'` (widened by spec 038's migration) — no further
CHECK change needed here.

### 3. New `data_sources` row (seed, not a schema change)

| `name` | `hazard_type` | `country_code` | `poll_interval_seconds` | `staleness_threshold_seconds` |
|---|---|---|---|---|
| `OpenStreetMap Roads` | `roads` | `NULL` (global — per-country handled inside the function, same as Kontur) | `604800` (7d) | `2592000` (30d) |

Looked up via `resolveSourceId('roads', 'OpenStreetMap Roads')` — identical mechanism to every
other source.

### 4. No new per-country resolution table

Unlike Kontur (`population_source_country_datasets`), road data needs no persisted per-country
dataset reference — Overpass's `ISO3166-1` area selector takes the country code directly at query
time (research.md §5). Nothing to add here.

### 5. No changes to `exposure_datasets` / `exposure_features` schema

Existing columns (added by spec 008, extended by spec 038) are sufficient:

- `exposure_datasets.name` — e.g. `"osm — TR — 2026-07"` (source + country + import batch,
  mirroring Kontur's naming convention exactly).
- `exposure_datasets.metric_property_name` — fixed value `"length_m"` for this source.
- `exposure_datasets.source_name` — `"osm"` (already free-text since spec 038; no CHECK constraint
  to widen).
- `exposure_datasets.country_code` — the served country this import batch covers.
- `exposure_datasets.org_id` — `NULL` (auto-imported, not organization-scoped, same as Kontur).
- `exposure_features.geom` — `geometry(Geometry, 4326)`, already type-unconstrained at the column
  level; `LineString`/`MultiLineString` values are valid without a schema change (only
  `geometryToWkt.ts`, application code, needed extending — see below).
- `exposure_features.metric_value` — the way's length in meters (research.md §4).
- `exposure_features.properties` — `{ highway: string, name?: string, osm_id: number }`.

### 6. `geometryToWkt.ts` extension (application code, not schema)

```ts
case 'LineString': {
  const coords = geometry.coordinates as number[][]
  return `LINESTRING(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`
}
case 'MultiLineString': {
  const lines = geometry.coordinates as number[][][]
  return `MULTILINESTRING(${lines.map((coords) => `(${coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`).join(', ')})`
}
```

Inserted alongside the existing `Point`/`Polygon`/`MultiPolygon` cases in the same `switch`; the
`default: throw` fallthrough is unchanged, so any genuinely unsupported type still fails loudly
rather than being silently mis-stored (research.md §7).

## In-memory shapes

### `RoadRecord` (mirrors `PopulationRecord`, `shared/roadRecord.ts`)

```ts
export interface RoadRecord {
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: unknown }
  lengthMeters: number
  countryCode: string
  properties: { highway: string; name?: string; osmId: number }
}
```

### Validation rules (`validateRoadRecord.ts`, mirrors `validatePopulationRecord.ts`)

- `geometry` MUST convert via `geometryToWkt()` without throwing (valid, non-empty `LineString`/
  `MultiLineString`).
- `lengthMeters` MUST be a finite number `> 0` (a zero-length or degenerate way is rejected, not
  stored as a meaningless point-like segment).
- `countryCode` MUST be one of the currently served country codes (`getServedCountryCodes()`),
  identical rule to `validatePopulationRecord`.
- `properties.highway` MUST be one of the imported classification values (research.md §3) — a
  defense-in-depth check in case a future query change accidentally widens the Overpass filter.

## Writer: `writeExposureDataset()` (generalized from `writePopulationDataset`)

```ts
export async function writeExposureDataset(
  sourceName: string,
  countryCode: string,
  metricPropertyName: string,
  features: { geometry: GeoJSONGeometry; metricValue: number; properties: Record<string, unknown> }[],
): Promise<{ datasetId: string; featureCount: number }>
```

Same chunked-insert (2000 rows/chunk, per spec 038's PostgREST-size-limit finding), same
insert-then-roll-back-on-partial-failure, same supersede-only-after-success-on-(`source_name`,
`country_code`) behavior as `writePopulationDataset` today. `writePopulationDataset(countryCode,
records)` becomes a thin wrapper:

```ts
export function writePopulationDataset(countryCode: string, records: PopulationRecord[]) {
  return writeExposureDataset('kontur', countryCode, 'population',
    records.map(r => ({ geometry: r.geometry, metricValue: r.population, properties: r.properties })))
}
```

Behavior-preserving: spec 038's existing test suite for the population write path continues to
pass unmodified against this wrapper (verify during implementation, not assumed).

## Relationship to existing entities

- **`data_sources`** (spec 001) — one new row, `hazard_type = 'roads'`, tracked by the existing
  health state machine exactly like every other source.
- **`exposure_datasets` / `exposure_features`** (spec 008, extended spec 038) — reused as-is; road
  datasets are indistinguishable in schema from population or manually-uploaded datasets, only
  `source_name`/`metric_property_name`/geometry type differ.
- **`country_boundaries`** (spec, pre-038) — read indirectly via `getServedCountryCodes()`
  (spec 038 §4a) to determine which countries to query; not read directly by this feature (no
  polygon construction needed, research.md §2).
- **`rejected_payloads`** (spec 001) — reused for rejected road segments, `hazard_type = 'roads'`,
  identical mechanism to every other source's rejections.
