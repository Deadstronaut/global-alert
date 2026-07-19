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
