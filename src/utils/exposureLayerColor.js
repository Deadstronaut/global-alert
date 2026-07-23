/**
 * Per-dataset color assignment for exposure map layers (spec 042, styling
 * pass 2026-07-19). Sources with an established real-world map convention
 * get a fixed color (rivers=dark blue, basins=light blue, roads=gray);
 * population sources are graduated (choropleth) by their metric value
 * instead of a single flat color. Any other/future source falls back to a
 * deterministic hash-based pick from a colorblind-safe categorical palette
 * (Okabe-Ito), so a brand-new source still renders distinguishably with
 * zero code changes (matches this project's existing "unknown source still
 * works, just unstyled" i18n fallback convention).
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
  hydrorivers: '#08306b', // dark blue
  hydrobasins: '#a8d8f0', // light blue
  osm: '#6c757d', // gray
}

// Population sources are rendered as a graduated (choropleth) ramp instead
// of one flat color — see populationFillExpression() below. This swatch
// color is only used for the panel's small color-dot preview and the
// opacity slider's accent color, a representative mid-ramp tone.
const POPULATION_SOURCES = new Set(['kontur', 'worldpop', 'ghsl', 'meta_hdx'])
const POPULATION_SWATCH_COLOR = '#fd8d3c'
export const POPULATION_RAMP = ['#ffffb2', '#fed976', '#fd8d3c', '#f03b20', '#bd0026']

// Other per-pixel gridded metrics (GDO drought/vegetation/soil-moisture
// anomalies, GloFAS river discharge) are built the same way population
// rasters are — one small polygon per source pixel, covering an entire
// country at ~0.08-0.1° resolution. Rendered with a single flat fill color
// and a full-opacity 2px outline (the non-gridded default, meant for a
// handful of large features like roads/rivers), thousands of adjacent
// same-color cells with solid borders read as a dense, illegible grid/moiré
// pattern instead of a heatmap. These need the same graduated-ramp +
// thin/low-opacity outline treatment as population, just a visually
// distinct ramp so the two categories don't look identical on the map.
const GRID_METRIC_SOURCES = new Set(['gdo_spi', 'gdo_fapar_anomaly', 'gdo_soil_moisture_anomaly', 'glofas_river_discharge'])
const GRID_METRIC_SWATCH_COLOR = '#2171b5'
export const GRID_METRIC_RAMP = ['#f7fbff', '#c6dbef', '#6baed6', '#2171b5', '#08306b']

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function isPopulationSource(sourceName) {
  return POPULATION_SOURCES.has(sourceName)
}

export function isGridMetricSource(sourceName) {
  return GRID_METRIC_SOURCES.has(sourceName)
}

/**
 * @param {{ id: string, source_name?: string|null }} dataset
 */
export function colorForDataset(dataset) {
  const sourceName = dataset?.source_name
  if (sourceName && FIXED_SOURCE_COLORS[sourceName]) return FIXED_SOURCE_COLORS[sourceName]
  if (sourceName && POPULATION_SOURCES.has(sourceName)) return POPULATION_SWATCH_COLOR
  if (sourceName && GRID_METRIC_SOURCES.has(sourceName)) return GRID_METRIC_SWATCH_COLOR

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
