/**
 * Generic description of one GeoTIFF-based population raster source (spec
 * 043 FR-011). rasterToHexagon.ts's aggregation logic takes one of these
 * plus an already-downloaded raster buffer and does no source-specific
 * branching — adding a future raster source (Meta/HDX Population, GHSL)
 * means writing a new config entry + a thin fetch wrapper, not new
 * processing code.
 */

export interface RasterSourceConfig {
  sourceName: string
  h3Resolution: number
  // 'count' = each pixel value is an estimated number of people in that
  // pixel (summed across a hexagon's pixels to get the hexagon's
  // population). 'density' would require multiplying by pixel area before
  // summing — not needed by any currently-configured source, but the field
  // exists so a future density-based raster source doesn't require
  // rewriting the aggregation function's contract.
  // 'mean' (added for CHIRPS, spec-less follow-up 2026-07-26) = each pixel
  // value is a non-additive measurement (e.g. rainfall in mm) — summing a
  // hexagon's pixel values would produce a meaningless number, so this mode
  // averages them instead. Distinct from 'density': 'density' is still
  // headed toward a *count* (people), just via a pixel-area conversion
  // first; 'mean' never becomes a count at all.
  pixelValueMeaning: 'count' | 'density' | 'mean'
}

export const WORLDPOP_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'worldpop',
  h3Resolution: 7,
  pixelValueMeaning: 'count',
}

// Meta/HDX Population — NOT currently used by any fetch module (spec 044
// attempt abandoned: Meta's per-country GeoTIFFs are ~10-11GB uncompressed,
// too large for this pipeline's Edge Function-based download step — see
// 20260720160000_meta_hdx_population_exposure_source.sql for the full
// finding). Left here, resolution matching WorldPop's, for whoever
// eventually builds a working import path (likely needs disk-streaming or
// server-side processing this repo doesn't have yet, not just a fetch
// module).
export const META_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'meta_hdx',
  h3Resolution: 7,
  pixelValueMeaning: 'count',
}

// GHSL (GHS-POP), spec 044 — the 30-arcsecond (~1km) global product, not
// GHSL's 100m one: live-verified the 100m product is per-tile/much larger,
// while this one is a single ~461MB world file that decompresses to a very
// manageable 384MB GeoTIFF (see ghslFetch.ts). Resolution 6 (Kontur's,
// ~3km hexagons), one step coarser than WorldPop's 7 — a ~1km pixel
// shouldn't be bucketed into H3 cells smaller than a few pixels wide, or
// the hexagon count balloons for no real precision gain.
export const GHSL_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'ghsl',
  h3Resolution: 6,
  pixelValueMeaning: 'count',
}

// CHIRPS monthly rainfall — a single global 0.05° GeoTIFF (chirpsFetch.ts),
// no tiling/merge needed unlike GHSL. Resolution 6 (matches GHSL's
// coarser-than-WorldPop choice) — CHIRPS's ~5.5km pixels shouldn't be
// bucketed into H3 cells much smaller than that. pixelValueMeaning='mean'
// because rainfall mm is not additive across a hexagon's pixels.
export const CHIRPS_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'chirps',
  h3Resolution: 6,
  pixelValueMeaning: 'mean',
}
