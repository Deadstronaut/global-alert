# Data Model: WorldPop Raster Population Exposure Source

## Schema changes

### Migration: widen `hazard_type` CHECK constraints, seed rows

Mirrors spec 040/041's migration shape exactly.

```sql
-- data_sources.hazard_type and rejected_payloads.hazard_type CHECKs widened to add 'population_raster'
INSERT INTO hazard_types (code, display_name, category, description) VALUES
  ('population_raster', 'Population (Raster-Derived)', 'exposure',
   'Population exposure aggregated from raster/GeoTIFF sources into H3 hexagons (distinct from Kontur''s pre-aggregated population)');

INSERT INTO data_sources (name, hazard_type, endpoint_url, country_code, poll_interval_seconds, staleness_threshold_seconds) VALUES
  ('WorldPop', 'population_raster', 'https://hub.worldpop.org/rest/data/pop/wpgp', NULL, 2592000, 7776000);
```

`'population_raster'` kept distinct from Kontur's existing `'population'` hazard type so the two
sources' health/config rows never collide — they are independently toggleable layers (US1/US2),
not variants of one source. `poll_interval_seconds`/`staleness_threshold_seconds` set to a 30-day
poll / 90-day staleness window, matching spec 041's rivers/basins cadence — WorldPop republishes
rasters roughly annually, not on a short cycle.

## In-memory shapes

```ts
// rasterSourceConfig.ts — the generic mechanism FR-011 requires
export interface RasterSourceConfig {
  sourceName: string                 // e.g. 'worldpop'
  resolveDownloadUrl: (countryCode: string, iso3: string) => Promise<string | null>
  h3Resolution: number                // 7 for WorldPop (research.md §3)
  pixelValueMeaning: 'count' | 'density'   // 'count' for WorldPop (research.md §4)
}

export const WORLDPOP_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'worldpop',
  resolveDownloadUrl: resolveWorldPopDownloadUrl,   // worldPopFetch.ts's API-lookup function
  h3Resolution: 7,
  pixelValueMeaning: 'count',
}

// populationRasterRecord.ts
export interface PopulationRasterRecord {
  geometry: { type: 'Polygon'; coordinates: unknown }   // H3 cell boundary, via cellToBoundary
  populationCount: number
  countryCode: string
  properties: { h3Cell: string; source: 'worldpop' }
}
```

A future GeoTIFF source (Meta/HDX Population, GHSL) is added by writing a new
`RasterSourceConfig` entry (its own `resolveDownloadUrl` + `pixelValueMeaning`) and a thin
`*Fetch.ts` wrapper around it — `rasterToHexagon.ts`'s aggregation logic itself takes a config +
a raster buffer and needs no per-source branching (FR-011).

## Validation rules

`validatePopulationRasterRecord.ts` (mirrors `validateRiverRecord.ts`/`validateBasinRecord.ts`):
- Geometry parseable via `geometryToWkt()` (Polygon — already supported since spec 040).
- `populationCount` finite, `>= 0` (population *can* legitimately be zero for an uninhabited
  hexagon that still received at least one valid, non-no-data pixel — distinct from a hexagon
  that received zero valid pixels at all, which never becomes a record per research.md §5).
- `countryCode` in served countries.
- Hexagon center point falls within the country's boundary (research.md §6) — enforced in
  `rasterToHexagon.ts`'s aggregation step itself (a hexagon outside the boundary is dropped before
  ever becoming a candidate record), not re-checked in the validator; the validator's
  `countryCode` check covers the record-shape contract, the geometric boundary check covers the
  spatial contract, matching spec 041's split between `hydroshedsClip.ts` (spatial) and
  `validateRiverRecord.ts` (shape).

## Aggregation function shape

```ts
// rasterToHexagon.ts
export function aggregateRasterToHexagons(
  rasterBuffer: ArrayBuffer,
  config: RasterSourceConfig,
  countryBoundary: GeoJSON.Geometry,
  countryCode: string,
): Promise<PopulationRasterRecord[]>
```

Internally: opens the raster via `geotiff.js`'s `fromArrayBuffer`, iterates row-block windows,
folds valid pixels into a `Map<string, number>` accumulator keyed by H3 cell ID (research.md §4),
then for each accumulated cell: converts to a boundary polygon (`cellToBoundary`), checks the
cell's center against `countryBoundary` (research.md §6, point-in-polygon via the same turf
utilities spec 041 already uses), and emits a `PopulationRasterRecord` for cells that pass.

## Key relationships

```
WorldPop per-country API (hub.worldpop.org/rest/data/pop/wpgp?iso3=<ISO3>)
        │  resolve download URL (worldPopFetch.ts, via RasterSourceConfig.resolveDownloadUrl)
        ▼
  GeoTIFF download (data.worldpop.org/.../<iso3>_ppp_<year>.tif)
        │  windowed read (geotiff.js) + pixel->H3-cell aggregation (h3-js)      [rasterToHexagon.ts]
        ▼
  in-memory Map<h3CellId, summedPopulation>
        │  cellToBoundary + country-boundary point-in-polygon filter
        ▼
  PopulationRasterRecord[]
        │  validatePopulationRasterRecord (per-record, reject with reason)
        ▼
  writeExposureDataset('worldpop', countryCode, 'population_count', ...)
        │  (spec 040's existing, unmodified generalized writer)
        ▼
  exposure_datasets / exposure_features  ──►  spec 042's map UI (unmodified, generic)
```
