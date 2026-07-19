# Research: HydroRIVERS/HydroBASINS River & Watershed Exposure Source

## §1. Download sources — verified live URLs

**Decision**: Fetch the continent-level shapefile ZIP directly by URL — no search/discovery API
needed (unlike Kontur's HDX package-search step), since HydroSHEDS' download URLs follow a fixed,
documented naming pattern.

- HydroRIVERS: `https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_{continent}_shp.zip`
- HydroBASINS: `https://data.hydrosheds.org/file/hydrobasins/standard/hybas_{continent}_lev01-12_v1c.zip`
  (all 12 levels bundled in one ZIP per continent — the level-6 `.shp`/`.dbf`/`.shx` triplet is
  extracted by filename pattern, e.g. `hybas_eu_lev06_v1c.shp`)

Continent codes: `af` (Africa), `eu` (Europe & Middle East), `as` (Asia), `au` (Australasia), `ar`
(Arctic), `gr` (Greenland), `na`/`sa` (North/South America), `si` (Siberia). **Turkey → `eu`**
(HydroSHEDS' "Europe & Middle East" region — Turkey's Mediterranean/Black Sea drainage basins are
part of that hydrological region, not `as`), **Madagascar → `af`** (unambiguous).

**Alternatives considered**: Querying HDX (like Kontur) — rejected, HydroSHEDS' own distribution
site is the canonical, authoritative source and doesn't require a search/disambiguation step at
all (unlike Kontur, which had 2 ambiguous packages per country, spec 040/042 session finding).

## §2. Parsing toolchain — live-verified in this project's actual Deno runtime

**Decision**: `jszip` (unzip) → `shapefile` (stream-parse `.shp`+`.dbf`) → per-feature clip (§3).
All three imports were smoke-tested directly in this project's Deno environment during planning
(not assumed from documentation):

```ts
import JSZip from 'https://esm.sh/jszip@3.10.1'          // requires --allow-env in addition to --allow-net
import * as shapefile from 'https://esm.sh/shapefile@0.6.6'
import bbox from 'https://esm.sh/@turf/bbox@7'
import booleanIntersects from 'https://esm.sh/@turf/boolean-intersects@7'
```

`jszip` is already a dependency of this codebase's frontend manual-upload path
(`src/utils/exposureFileParser.js`, via `shpjs` which itself wraps shapefile+zip parsing for
browser use) — this is a second, independent consumer confirming the library choice is sound, not
a new unknown dependency risk.

**Why streaming matters**: `shapefile`'s API yields one feature at a time (`source.read()` in a
loop) rather than requiring the whole file in memory as GeoJSON first — critical for HydroBASINS'
bundled-all-levels ZIP and HydroRIVERS' continent-scale files, where the vast majority of features
will be discarded by the country clip and should never need to exist as parsed JS objects
simultaneously.

**Alternatives considered**: GDAL/`ogr2ogr` via a native binary or WASM build — more
robust/standard in the GIS world, but either requires a native dependency (not available in Deno
Edge Functions) or a large WASM bundle; rejected for this MVP's scale (Complexity Tracking,
plan.md).

## §3. HydroBASINS level choice: level 6

**Decision**: Extract only the level-6 shapefile from each continent's bundled ZIP.

**Why**: HydroBASINS' 12 levels trade off granularity vs. count — level 1 is a handful of huge
continental-scale basins (too coarse to be useful on a country-scale map), level 12 is ~1M
polygons globally averaging ~130 km² each (too dense for a country-wide view, and disproportionate
to this MVP's needs). Level 6 is a commonly-used middle ground for regional/national-scale display
in third-party usage (e.g. Google Earth Engine's own catalog entry is literally named "HydroATLAS
Basins Level 06" as a general-purpose regional dataset) — chosen as a reasonable, documented
default per spec.md's Assumptions section, not a value discovered through this feature's own
testing (unlike the OSM highway-classification narrowing in spec 040, which *was* discovered via
live trial and error).

**Alternatives considered**: Importing all 12 levels — rejected as unnecessary complexity for an
MVP demo; a single level is sufficient to demonstrate the "click a basin, see its area" UX the
user asked for (spec 041's origin). Revisit if a specific level proves visually wrong once seen on
the actual map (flagged as a legitimate follow-up, not assumed correct forever).

## §4. Spatial clipping: bbox pre-filter + turf precise clip, not PostGIS staging

**Decision**: For each served country, compute its boundary's bounding box once (from the existing
`country_boundaries` table, via `@turf/bbox`), then for every parsed continent-scale feature: (a)
cheap bbox-overlap pre-filter, (b) for bbox-surviving candidates only, a precise
`@turf/boolean-intersects(feature, countryBoundary)` check. Only features passing both are kept.

**Why**: See plan.md's Complexity Tracking — this discards the vast majority of a continent's
features before any DB interaction, keeping network/storage cost proportional to the target
country's actual data volume, not the whole continent's.

**Risk, explicitly flagged**: `@turf/boolean-intersects` on complex multi-thousand-vertex country
boundary polygons (e.g. Turkey's, or Madagascar's simplified geoBoundaries ADM1 polygons already in
`country_boundaries`) could be slower per-check than a simpler bbox-only filter. Mitigation: the
bbox pre-filter already eliminates most candidates before this precise check ever runs; if the
precise check still proves too slow in practice, a documented fallback is to accept the (slightly
over-inclusive) bbox-only result — tracked as a live finding to confirm during implementation, not
assumed away.

## §5. Country-membership assignment: same generic table-driven config as everything else

**Decision**: `hydroshedsContinent.ts` exports a single `Record<string, string>` (served country
code → HydroSHEDS continent code), exactly mirroring `iso3166.ts`'s existing lookup-table
convention in this codebase. No `if (countryCode === 'tr')` branches anywhere — FR-010's
country-agnostic requirement is satisfied the same way spec 040 satisfies it for roads.

## §6. Reuse `writeExposureDataset` and existing exposure-layer UI unchanged

**Decision**: Both new fetch modules produce records in the same
`{ geometry, metricValue, properties }` shape spec 040's `writeExposureDataset()` already accepts
generically — no changes to that function, `exposure_datasets`/`exposure_features` schema, or
spec 042's map-visualization UI are needed. `metricValue` for rivers = length in meters (mirrors
roads' `length_m`); for basins = area in km² (from HydroBASINS' own `SUB_AREA` attribute, avoiding
recomputing area from geometry).

**Why this matters**: This is the direct payoff of spec 040/042's generic design — a third and
fourth exposure source type require zero changes to the write path or the map UI, only new
fetch/validate modules, confirming Constitution Principle I in practice, not just in intent.
