# Research: WorldPop Raster Population Exposure Source

## §1. WorldPop API — verified live, free, no key/waitlist

**Decision**: Use WorldPop's public per-country REST API to resolve each served country's latest
population GeoTIFF download URL — no HDX-style ambiguous package search (Kontur's own step),
no continent-scale bundle (HydroSHEDS' pattern).

- Discovery: `GET https://hub.worldpop.org/rest/data/pop/wpgp?iso3=<ISO3>` — returns a JSON list of
  dataset entries for that ISO3 country code, each with a `files[]` array of direct `.tif`
  download URLs (confirmed live via WebFetch during this session against `iso3=TUR`).
- Direct pattern also independently confirmed to exist:
  `https://data.worldpop.org/GIS/Population/Global_2000_2020/<year>/<ISO3>/<iso3_lower>_ppp_<year>.tif`
  (100m-resolution population-**count**, not density, per pixel — matters for aggregation, §4).
- No API key, no registration, no rate-limit gate encountered.

**Alternatives considered**: Meta/HDX Population, GHSL — both explicitly out of scope for this
feature (spec.md Assumptions); their own access patterns (registration, licensing, file format)
have not been independently confirmed the way WorldPop's have, so pulling them in now would mean
building against unverified assumptions rather than a live-checked API, unlike WorldPop.

## §2. Raster read toolchain — live-smoke-tested in this project's actual Deno runtime

**Decision**: `geotiff.js`, imported and exercised directly before this spec was written (not
assumed from documentation):

```ts
import { fromArrayBuffer } from 'https://esm.sh/geotiff@2.1.3'
```

Confirmed working, pure-JS/WASM, no native/GDAL dependency — directly satisfies Constitution
Principle VIII (no new backend service) the same way `shapefile`/`jszip` did for spec 041.

`geotiff.js` supports windowed reads (`image.readRasters({ window: [x0, y0, x1, y1] })`) and
exposes the raster's affine transform (`image.getBoundingBox()`, pixel-to-geo-coordinate
conversion) — both needed for the streaming aggregation approach in §4.

**Alternatives considered**: A native/GDAL-backed reader (e.g. via a WASM build of GDAL itself,
or shelling out to `gdal_translate`) — more standard in the GIS world and handles a wider range of
GeoTIFF variants, but either isn't available in Deno Edge Functions (no native binaries) or means
a much larger WASM bundle for marginal benefit at this MVP's scale (2 countries, one well-formed
WorldPop GeoTIFF each) — rejected, same reasoning as spec 041's GDAL rejection (plan.md Complexity
Tracking).

## §3. H3 aggregation resolution: resolution 7

**Decision**: Aggregate raster pixels into H3 resolution-7 hexagons (~5.2 km² average cell area).

**Why**: Kontur's own hexagons (this project's existing population layer) are also
approximately this scale for the country-wide views this project demos at (Kontur uses H3
resolution 8 internally per its own documentation, ~0.7 km² cells, but spec.md's Assumptions
explicitly state WorldPop's resolution does not need to match Kontur's exactly — they are shown
as separate, independently-toggleable layers, not merged). Resolution 7 balances two concerns:
fine enough to be visually meaningful at country scale, coarse enough that aggregating tens of
millions of 100m pixels per country completes in reasonable time without per-pixel H3 cell
lookups becoming the dominant cost.

**Alternatives considered**: Matching Kontur's resolution 8 exactly — rejected as unnecessary
precision-matching for two sources whose entire value (per US1) is being *independently sourced*,
not directly comparable cell-for-cell; a coarser, faster-to-compute resolution is preferable at
this MVP's scale. Revisit if a future requirement asks for cell-level side-by-side comparison
(not currently a requirement).

## §4. Pixel→hexagon aggregation strategy: windowed streaming, pixel-center-point assignment

**Decision**: Read the raster in horizontal row-block windows (not the whole raster at once, per
plan.md's Performance Goals). For each pixel in a window: (a) skip if its value is the raster's
declared no-data sentinel or otherwise non-finite; (b) convert the pixel's center coordinate to
lat/lng using the raster's affine transform; (c) compute its H3 resolution-7 cell via
`h3-js`'s `latLngToCell`; (d) add the pixel's population-count value to a running per-cell sum in
an in-memory accumulator `Map<string, number>` (H3 cell ID → summed population). After all
windows are processed, each map entry becomes one `PopulationRasterRecord`.

**Why this is correct for population-*count* rasters (not density)**: WorldPop's `ppp_<year>.tif`
values are already "estimated persons in this pixel," so summing pixel values within a hexagon's
footprint directly yields the hexagon's estimated population — no area-weighting or density
multiplication needed (verified via WorldPop's own product documentation: "ppp" = "people per
pixel," a count, not "pph"/density).

**Why pixel-*center*-point assignment (not areal apportionment)**: A pixel is assigned entirely to
the single hexagon containing its center point, even though a 100m pixel near a hexagon boundary
technically straddles two cells. This is the same class of simplification Kontur's own
pre-aggregated hexagons already embody (their own H3 aggregation isn't independently auditable by
this project either) — acceptable because this feature's stated purpose (US1) is a second,
*independent estimate* for cross-checking, not a survey-grade precise areal statistic (plan.md
Complexity Tracking explains why exact areal apportionment was rejected as unneeded complexity).

**Alternatives considered**: Full areal-weighted apportionment (splitting a boundary pixel's value
proportionally across the hexagons it overlaps) — materially more complex (requires a
polygon-clipping step per boundary pixel) for a precision gain no FR/SC calls for; rejected as
premature per Constitution Principle VIII (YAGNI).

## §5. No-data / invalid pixel handling

**Decision**: WorldPop rasters declare a no-data sentinel value (typically a large negative
number or `NaN`, read from the GeoTIFF's own metadata via `geotiff.js`'s
`image.getGDALNoData()` when present, with a defensive `!Number.isFinite(value) || value < 0`
check as a fallback for any raster that omits the metadata field) — such pixels are excluded from
aggregation entirely, never treated as zero (US3, FR-008). A hexagon whose accumulator never
receives any valid pixel simply never appears in the output map — there is no "hexagon with value
0" to explicitly exclude; the exclusion is implicit in never having been added.

**Why not treat no-data as zero**: A "zero population" pixel and a "no data here" pixel mean
different things (e.g. ocean/water masked out vs. a genuinely uninhabited land pixel) — silently
converting no-data to 0 would systematically undercount border hexagons that mix real low-population
land pixels with masked water pixels, matching this system's general principle (spec 040/041) of
rejecting-with-reason rather than silently coercing invalid data into a valid-looking value.

## §6. Country-membership check: reuse `country_boundaries`, no new boundary source

**Decision**: After aggregation, each resulting hexagon's center point is checked against the
served country's boundary (existing `country_boundaries` table, same source spec 041 already
reads) via `h3-js`'s `cellToLatLng` + a point-in-polygon check — a hexagon whose center falls
outside the country is excluded (US3 edge case: WorldPop's raster tile may extend slightly beyond
a country's precise border). This reuses the exact same boundary data spec 041's clip step reads,
no new geodata source introduced.

**Alternatives considered**: Clipping the raster to the country boundary *before* aggregation
(e.g. masking pixels outside the boundary before summing) — more precise at the pixel level, but
WorldPop's per-country GeoTIFF is already clipped close to the country's extent by WorldPop
themselves (confirmed: the downloaded raster's bounding box is only marginally larger than the
country's own bounding box), so a hexagon-center-point post-filter is sufficient to catch the
small edge-fringe case without adding a pixel-level clip step.

## §7. Reuse `writeExposureDataset` and existing exposure-layer UI unchanged

**Decision**: `worldPopFetch.ts` (via `rasterToHexagon.ts`) produces records in the same
`{ geometry, metricValue, properties }` shape spec 040's `writeExposureDataset()` already accepts
generically (`geometry` = an H3 cell boundary polygon, computed via `h3-js`'s
`cellToBoundary`; `metricValue` = the summed population). No changes to that function, the
`exposure_datasets`/`exposure_features` schema, or spec 042's map-visualization UI are needed —
directly exercises FR-005/FR-012/SC-006.

**Why this matters**: This is the fifth consecutive exposure source (after osm, kontur,
hydrorivers, hydrobasins) requiring zero changes to the write path or the map UI — and the first
one derived from a fundamentally different input shape (raster, not vector) — the strongest
confirmation yet that spec 040/042's generic design decision was correct, not source-type-specific
by accident.
