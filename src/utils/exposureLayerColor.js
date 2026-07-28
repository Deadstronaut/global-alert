/**
 * Per-dataset color assignment for exposure map layers (spec 042, styling
 * pass 2026-07-19; per-category ramp pass 2026-07-26). Sources with an
 * established real-world map convention get a fixed color (rivers=dark
 * blue, basins=light blue, roads=gray, critical facilities=violet);
 * population and other gridded-metric sources are graduated (choropleth)
 * by their metric value instead of a single flat color. Any other/future
 * source falls back to a deterministic hash-based pick from a
 * colorblind-safe categorical palette (Okabe-Ito), so a brand-new source
 * still renders distinguishably with zero code changes (matches this
 * project's existing "unknown source still works, just unstyled" i18n
 * fallback convention).
 *
 * 2026-07-26: previously every gridded-metric source (rainfall, drought,
 * vegetation anomaly, soil moisture anomaly, river discharge) shared ONE
 * blue ramp — they all looked identical on the map/layer panel despite
 * being conceptually unrelated quantities. Each now gets its own
 * thematically-appropriate ramp (see GRID_METRIC_RAMPS) instead.
 */

const PALETTE = [
  '#E69F00', // orange
  '#56B4E9', // sky blue
  '#009E73', // bluish green
  '#F0E442', // yellow
  '#0072B2', // blue
  '#D55E00', // vermillion
  '#CC79A7', // reddish purple
  '#999999', // grey (fallback/8th)
]

const FIXED_SOURCE_COLORS = {
  hydrorivers: '#08306b', // dark blue — literal river network
  hydrobasins: '#4a90a4', // slate teal — watershed boundary lines, distinct from both hydrorivers' blue and the soil-moisture ramp below
  osm: '#6c757d', // gray — road network, standard cartographic road color
  'osm-buildings': '#8e44ad', // violet — critical facilities/points of interest, distinct from every other category here
}

// Population sources are rendered as a graduated (choropleth) ramp instead
// of one flat color — see populationFillExpression() below. The swatch
// color (colorForDataset) uses a representative mid-ramp tone.
const POPULATION_SOURCES = new Set(['kontur', 'worldpop', 'ghsl', 'meta_hdx'])
// White -> red: the conventional population-density sequential ramp (low
// density reads as "empty"/white, not as a competing hue).
export const POPULATION_RAMP = ['#ffffff', '#fee5d9', '#fcae91', '#fb6a4a', '#cb181d']

// Other per-pixel gridded metrics (GDO drought/vegetation/soil-moisture
// anomalies, GloFAS river discharge, CHIRPS rainfall) are built the same
// way population rasters are — one small polygon per source pixel/hexagon,
// covering an entire country. Rendered with a graduated fill + a thin,
// low-opacity outline (see MapView.vue's isGridded branch) rather than the
// non-gridded default (meant for a handful of large features like roads/
// rivers) — thousands of adjacent same-color cells with solid borders
// otherwise read as a dense, illegible grid/moiré pattern instead of a
// heatmap.
const GRID_METRIC_SOURCES = new Set(['gdo_spi', 'gdo_fapar_anomaly', 'gdo_soil_moisture_anomaly', 'glofas_river_discharge', 'chirps', 'dem_slope', 'building_footprints'])

// One ramp per source, each chosen to match what the quantity actually is
// rather than a single shared "generic data" blue:
const GRID_METRIC_RAMPS = {
  chirps: ['#f0f9ff', '#bae6fd', '#38bdf8', '#0284c7', '#075985'], // rainfall — light -> dark blue
  gdo_fapar_anomaly: ['#f0fdf4', '#bbf7d0', '#4ade80', '#16a34a', '#14532d'], // vegetation anomaly — light -> dark green
  gdo_soil_moisture_anomaly: ['#ecfeff', '#a5f3fc', '#22d3ee', '#0891b2', '#164e63'], // soil moisture anomaly — light -> dark teal/cyan (water-adjacent but distinct from rainfall's blue)
  glofas_river_discharge: ['#eef2ff', '#c7d2fe', '#818cf8', '#4f46e5', '#312e81'], // river discharge — light -> dark indigo (also water-related, distinct hue from rainfall)
  gdo_spi: ['#fefce8', '#fde68a', '#f59e0b', '#c2410c', '#7c2d12'], // drought severity (SPI) — light tan -> dark brown, the conventional "dry earth" drought palette
  dem_slope: ['#fef9c3', '#fde047', '#f97316', '#dc2626', '#7f1d1d'], // landslide susceptibility (slope) — every cell here is already >= the 20deg threshold (rasterSourceConfig.ts), so this ramp is distinguishing steep-but-passable from genuinely severe terrain, not "flat vs hilly"
  // Building density (spec 050 US3) — user-reported: this rendered as one
  // flat categorical color (the hash-based PALETTE fallback) before being
  // registered here, same bug class as dem_slope's original miss. Same
  // white -> red sequential ramp as POPULATION_RAMP (a building-count-per-
  // hexagon density reads the same way a population density does).
  building_footprints: ['#ffffff', '#fee5d9', '#fcae91', '#fb6a4a', '#cb181d'],
}
// Fallback for any future gridded-metric source not yet given its own ramp
// above — keeps the old shared-blue behavior rather than erroring.
const DEFAULT_GRID_METRIC_RAMP = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b']

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

// Distance-based estimated-severity gradient for critical-infrastructure
// points inside a selected event's impact halo (spec 050 US2) — yellow (far/
// edge of halo) -> red (near epicenter). Deliberately a different, more
// saturated ramp than dem_slope's (which shades a whole country's terrain);
// this one only ever applies to a handful of points near one selected event,
// so it can afford to be bolder/higher-contrast.
export const HALO_SEVERITY_RAMP = ['#fde047', '#f97316', '#dc2626', '#7f1d1d']

export function isPopulationSource(sourceName) {
  return POPULATION_SOURCES.has(sourceName)
}

export function isGridMetricSource(sourceName) {
  return GRID_METRIC_SOURCES.has(sourceName)
}

/** The graduated ramp a given gridded-metric source_name should render with (falls back to a generic blue for anything not individually categorized). */
export function rampForGridMetric(sourceName) {
  return GRID_METRIC_RAMPS[sourceName] ?? DEFAULT_GRID_METRIC_RAMP
}

/**
 * @param {{ id: string, source_name?: string|null }} dataset
 */
export function colorForDataset(dataset) {
  const sourceName = dataset?.source_name
  if (sourceName && FIXED_SOURCE_COLORS[sourceName]) return FIXED_SOURCE_COLORS[sourceName]
  if (sourceName && POPULATION_SOURCES.has(sourceName)) return POPULATION_RAMP[Math.floor(POPULATION_RAMP.length / 2)]
  if (sourceName && GRID_METRIC_SOURCES.has(sourceName)) {
    const ramp = rampForGridMetric(sourceName)
    return ramp[Math.floor(ramp.length / 2)]
  }

  const id = String(dataset?.id ?? '')
  const index = hashString(id) % PALETTE.length
  return PALETTE[index]
}

function quantile(sortedValues, q) {
  const pos = (sortedValues.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  const next = sortedValues[base + 1]
  return next !== undefined ? sortedValues[base] + rest * (next - sortedValues[base]) : sortedValues[base]
}

/**
 * Builds a MapLibre data-driven fill-color expression that buckets each
 * feature's fill by its __metricValue using quantile breakpoints — each
 * color covers roughly the same NUMBER of cells, not an equal slice of the
 * value range. These gridded metrics (population, drought/vegetation/soil-
 * moisture anomalies, river discharge) are heavily right-skewed (a handful
 * of extreme cells, e.g. a city center or a flooded reach, next to a long
 * tail of ordinary ones); a linear min→max scale crushes that whole tail
 * into the ramp's palest 1-2%, so nearly every cell renders the same
 * washed-out color and only the outliers stand out.
 * @param {GeoJSON.FeatureCollection} geojson
 * @param {string[]} ramp
 */
export function gridMetricFillExpression(geojson, ramp) {
  const values = (geojson?.features ?? [])
    .map((f) => f.properties?.__metricValue)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b)

  if (values.length === 0) return ramp[Math.floor(ramp.length / 2)]

  const min = values[0]
  const max = values[values.length - 1]
  if (min === max) return ramp[Math.floor(ramp.length / 2)]

  // Breakpoints are quantiles of the DISTINCT values, not the raw
  // (duplicate-heavy) array. Some sources (e.g. soil moisture anomaly) have
  // a dominant repeated value across most cells — quantile-by-count then
  // puts most/all breakpoints inside that one repeated value, so after
  // de-duplication below almost everything collapses into 1-2 buckets and
  // the map reads as a flat, near-uniform color with only a couple of
  // outlier cells visible. Ranking by distinct value instead spreads the
  // breakpoints across the actual variety present, regardless of how many
  // cells happen to share the majority value.
  const uniqueValues = [...new Set(values)]
  const steps = ramp.length
  const rawBreaks = []
  for (let i = 1; i < steps; i++) rawBreaks.push(quantile(uniqueValues, i / steps))

  // Low-density duplicate quantiles are common (many cells share the same
  // ordinary value) — MapLibre's `step` stops must be strictly ascending, so
  // collapse duplicates instead of erroring. A heavily-duplicated dataset
  // just ends up with fewer effective buckets.
  const breakpoints = []
  for (const b of rawBreaks) {
    if (breakpoints.length === 0 || b > breakpoints[breakpoints.length - 1]) breakpoints.push(b)
  }

  const expression = ['step', ['coalesce', ['get', '__metricValue'], min], ramp[0]]
  breakpoints.forEach((bp, i) => expression.push(bp, ramp[i + 1]))
  return expression
}

/** @param {GeoJSON.FeatureCollection} geojson */
export function populationFillExpression(geojson) {
  return gridMetricFillExpression(geojson, POPULATION_RAMP)
}
