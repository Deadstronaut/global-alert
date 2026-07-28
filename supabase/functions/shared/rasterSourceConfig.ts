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
  // Every source until GDO anomaly (2026-07-26) had non-negative pixel
  // values, so isValidPixel() in rasterToHexagon.ts unconditionally
  // rejected value < 0 as presumed-invalid. GDO Soil Moisture/fAPAR
  // Anomaly values are legitimately negative ("below normal"), so this
  // flag opts a source out of that rejection. Optional and defaults to
  // false (undefined) — every pre-existing config below is untouched.
  allowNegativeValues?: boolean
}

// Resolution 6 (not 7) — live-testing finding: Turkey's WorldPop dataset at
// resolution 7 produced 138,932 hexagons, and get_dataset_features_geojson
// (one jsonb_agg of every row's simplified geometry, no pagination) hit both
// this project's Postgres statement_timeout AND the edge proxy in front of
// it (520/521, not just 500 — raising the function's own statement_timeout
// alone did not fix it, see 20260728091000's migration header). Matches
// GHSL's own resolution-6 choice and reasoning: WorldPop's ~100m pixel
// shouldn't be bucketed finer than a few pixels per hexagon anyway.
export const WORLDPOP_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'worldpop',
  h3Resolution: 6,
  pixelValueMeaning: 'count',
}

// Meta/HDX Population — same resolution-6 fix as WorldPop above (live-tested
// 2026-07-28: Turkey's dataset at resolution 7 was 126,118 hexagons, same
// get_dataset_features_geojson failure). Meta's own pixel is ~30m, even
// finer than WorldPop's, so resolution 6 is if anything more conservative
// here than for WorldPop.
export const META_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'meta_hdx',
  h3Resolution: 6,
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

// GDO Soil Moisture Anomaly (smand, 0.1°) + fAPAR Anomaly (fpanv, 0.0833°) —
// converted from a hand-drawn one-rectangle-per-pixel geometry to real H3
// hexagons (2026-07-26 consistency pass — see gdoAnomalyFetch.ts). Both are
// coarser than CHIRPS's 0.05° pixels, so a coarser hexagon (resolution 5,
// ~8.5km edge) matches their own scale rather than needlessly splitting one
// pixel across several small hexagons. pixelValueMeaning='mean' for the
// same non-additive reason as CHIRPS. allowNegativeValues=true — an anomaly
// value is legitimately negative (below-normal moisture/vegetation), unlike
// every other currently-configured source.
export const GDO_SOIL_MOISTURE_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'gdo_soil_moisture_anomaly',
  h3Resolution: 5,
  pixelValueMeaning: 'mean',
  allowNegativeValues: true,
}

export const GDO_FAPAR_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'gdo_fapar_anomaly',
  h3Resolution: 5,
  pixelValueMeaning: 'mean',
  allowNegativeValues: true,
}

// GloFAS river discharge — same consistency pass, same reasoning as GDO
// anomaly above (converted from import-glofas.ts's own hand-drawn
// rectangle-per-pixel geometry). Discharge (m³/s) is never negative, so
// allowNegativeValues stays false (the default) — listed explicitly here
// only for symmetry with the two GDO configs above.
export const GLOFAS_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'glofas_river_discharge',
  h3Resolution: 5,
  pixelValueMeaning: 'mean',
  allowNegativeValues: false,
}

// DEM-derived slope (landslide susceptibility), from Copernicus GLO-30
// (~30m) elevation tiles — see demSlopeFetch.ts. Unlike every other config
// here, the importer only ever writes hexagons whose mean slope already
// clears LANDSLIDE_SLOPE_THRESHOLD_DEG (demSlopeFetch.ts), so this dataset
// is deliberately much sparser than WorldPop/GHSL for the same country —
// "steep-terrain zones", not "slope everywhere". Resolution 7 (WorldPop's)
// because a 30m pixel is fine-grained enough to support a smaller hexagon
// than the ~1km-pixel sources above use.
export const DEM_SLOPE_SOURCE_CONFIG: RasterSourceConfig = {
  sourceName: 'dem_slope',
  h3Resolution: 7,
  pixelValueMeaning: 'mean',
  allowNegativeValues: false,
}

// Landslide susceptibility literature (e.g. USGS coseismic-landslide
// modeling, Nowicki Jessee et al. 2018) commonly treats slopes at/above
// this steepness as meaningfully more susceptible to seismically-triggered
// landsliding — a coarse, defensible cutoff, not a precise engineering
// threshold. Admin-configurable slope-based cascade_rules still apply their
// own min_magnitude/proximity_distance_km on top of this pre-filtered set.
export const LANDSLIDE_SLOPE_THRESHOLD_DEG = 20
