# Data Model: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

## Schema changes

### Migration: widen `hazard_type` CHECK constraints, seed rows

Mirrors spec 040's migration shape exactly.

```sql
-- data_sources.hazard_type and rejected_payloads.hazard_type CHECKs widened to add 'rivers', 'basins'
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('rivers', 'River Network', 'exposure', 'HydroRIVERS global river-network line features'),
  ('basins', 'Watershed Boundaries', 'exposure', 'HydroBASINS level-6 sub-basin polygon features');

INSERT INTO data_sources (name, hazard_type, endpoint_url, country_code, poll_interval_seconds, staleness_threshold_seconds) VALUES
  ('HydroRIVERS', 'rivers', 'https://data.hydrosheds.org/file/HydroRIVERS/', NULL, 2592000, 7776000),
  ('HydroBASINS', 'basins', 'https://data.hydrosheds.org/file/hydrobasins/standard/', NULL, 2592000, 7776000);
```

`poll_interval_seconds`/`staleness_threshold_seconds` set far longer than roads' weekly cadence
(30-day poll, 90-day staleness) — river/basin geometry changes on the order of years, not days;
matches spec.md's FR-010/Assumptions.

## In-memory shapes

```ts
// riverRecord.ts
export interface RiverRecord {
  geometry: { type: 'LineString' | 'MultiLineString'; coordinates: unknown }
  lengthMeters: number
  countryCode: string
  properties: { riverName?: string; strahlerOrder?: number; hybasId: number }
}

// basinRecord.ts
export interface BasinRecord {
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown }
  areaKm2: number
  countryCode: string
  properties: { hybasId: number; pfafId: number }
}
```

`hybasId`/`pfafId` come directly from HydroBASINS'/HydroRIVERS' own `HYBAS_ID`/`PFAF_ID` DBF
attributes — the same identifier family visible in Google Flood Hub's `hybas_<id>` gauge naming
the user originally pointed out (spec 041's origin), so a future cross-reference between this
project's basin data and any Flood Hub-derived data (if that API's waitlist ever clears) would use
the same IDs with no translation needed.

## Validation rules

`validateRiverRecord.ts` (mirrors `validateRoadRecord.ts`):
- Geometry parseable via `geometryToWkt()` (LineString/MultiLineString — already supported since
  spec 040, no `geometryToWkt.ts` change needed).
- `lengthMeters` finite, `> 0`.
- `countryCode` in served countries.

`validateBasinRecord.ts` (mirrors `validatePopulationRecord.ts`'s polygon shape):
- Geometry parseable via `geometryToWkt()` (Polygon/MultiPolygon — already supported).
- `areaKm2` finite, `> 0`.
- `countryCode` in served countries.

Neither validator restricts on a classification set the way `validateRoadRecord.ts` restricts
`highway` — HydroRIVERS/HydroBASINS don't have an equivalent "is this the right kind of feature"
scope question (every river reach that survives the country clip is in-scope; same for every
level-6 basin polygon).

## Shared clip module

```ts
// hydroshedsClip.ts
export function clipToCountryBoundary<T extends GeoJSON.Feature>(
  features: T[],
  countryBoundary: GeoJSON.Geometry,
): T[]
```

Pure function (no I/O) — takes already-parsed features and an already-fetched country boundary,
returns the subset surviving the bbox-prefilter + `@turf/boolean-intersects` check
(research.md §4). Unit-testable without a live shapefile download or DB connection.

## Country → continent lookup

```ts
// hydroshedsContinent.ts
export const HYDROSHEDS_CONTINENT_BY_COUNTRY: Record<string, string> = {
  tr: 'eu',
  mg: 'af',
  my: 'as',
}
```

Data table, not a branch — extending to a new served country (per FR-010/spec 040's established
convention) means adding one entry here, no logic change. (Malaysia's `my: 'as'` entry included
for completeness/consistency even though this MVP's success criteria are scoped to Turkey +
Madagascar only, spec.md's Assumptions — costs nothing to include and avoids a silent gap if
Malaysia is ever brought into scope for this source too.)

## Key relationships

```
HydroSHEDS continent ZIP (af/eu/...)
        │  download + unzip + stream-parse (jszip + shapefile)
        ▼
  parsed features (whole continent, in-memory one at a time)
        │  bbox-prefilter + turf boolean-intersects vs. country_boundaries row
        ▼
  country-clipped RiverRecord[] / BasinRecord[]
        │  validateRiverRecord / validateBasinRecord (per-record, reject with reason)
        ▼
  writeExposureDataset('hydrorivers'|'hydrobasins', countryCode, 'length_m'|'area_km2', ...)
        │  (spec 040's existing, unmodified generalized writer)
        ▼
  exposure_datasets / exposure_features  ──►  spec 042's map UI (unmodified, generic)
```
