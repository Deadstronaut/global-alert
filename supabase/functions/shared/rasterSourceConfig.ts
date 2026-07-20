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
  pixelValueMeaning: 'count' | 'density'
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
