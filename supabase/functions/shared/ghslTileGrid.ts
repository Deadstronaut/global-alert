/**
 * GHSL's 30-arcsecond tile grid (spec 044). The global GHS-POP raster
 * (~461MB zip, ~384MB GeoTIFF) is also published pre-cut into a fixed
 * 10-degree grid of small per-tile files (~1.5MB each) — live-verified
 * 2026-07-20 by downloading tile R2_C5 and reading its own GeoTIFF bounds:
 * lng [-140.008, -130.008], lat [69.0996, 79.0996], 1200x1200 pixels
 * (0.008333 deg/px, matching the global raster's own resolution exactly).
 *
 * This exists because downloading the whole global file per invocation
 * (ghslFetch.ts's first version) buffers the entire ~461MB zip in memory
 * before any cropping can happen — live-verified to exceed the deployed
 * Edge Function's memory budget (WORKER_RESOURCE_LIMIT, ~10s in). A
 * country's bbox almost always needs only a handful of these small tiles,
 * not the whole world.
 *
 * Grid origin: row 1 / col 1 tile covers the raster's own top-left corner
 * (lng xmin, lat ymax) — GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0's own
 * bounding box, read once from the same live raster used above.
 */

export const GHSL_TILE_SIZE_DEG = 10
export const GHSL_GRID_ORIGIN_LNG = -180.0079
export const GHSL_GRID_ORIGIN_LAT = 89.0996

export interface GhslTileIndex {
  row: number
  col: number
}

/**
 * Returns every (row, col) tile whose 10x10-degree cell overlaps the given
 * bbox. Not every returned index necessarily has a real file (ocean-only
 * tiles are omitted from GHSL's own publication — 348 of a possible ~792
 * grid cells) — the caller must treat a 404 for one tile as "no population
 * there", not an error (mirrors this codebase's per-unit "skip, don't
 * fail" convention).
 */
export function tileIndicesForBoundingBox(bbox: [number, number, number, number]): GhslTileIndex[] {
  const [minLng, minLat, maxLng, maxLat] = bbox
  const colStart = Math.floor((minLng - GHSL_GRID_ORIGIN_LNG) / GHSL_TILE_SIZE_DEG) + 1
  const colEnd = Math.floor((maxLng - GHSL_GRID_ORIGIN_LNG) / GHSL_TILE_SIZE_DEG) + 1
  const rowStart = Math.floor((GHSL_GRID_ORIGIN_LAT - maxLat) / GHSL_TILE_SIZE_DEG) + 1
  const rowEnd = Math.floor((GHSL_GRID_ORIGIN_LAT - minLat) / GHSL_TILE_SIZE_DEG) + 1

  const tiles: GhslTileIndex[] = []
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      tiles.push({ row, col })
    }
  }
  return tiles
}

export function tileZipUrl({ row, col }: GhslTileIndex): string {
  return `https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_POP_GLOBE_R2023A/GHS_POP_E2025_GLOBE_R2023A_4326_30ss/V1-0/tiles/GHS_POP_E2025_GLOBE_R2023A_4326_30ss_V1_0_R${row}_C${col}.zip`
}
