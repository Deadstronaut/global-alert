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
const POPULATION_SOURCES = new Set(['kontur', 'worldpop'])
const POPULATION_SWATCH_COLOR = '#fd8d3c'
export const POPULATION_RAMP = ['#ffffb2', '#fed976', '#fd8d3c', '#f03b20', '#bd0026']

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

/**
 * @param {{ id: string, source_name?: string|null }} dataset
 */
export function colorForDataset(dataset) {
  const sourceName = dataset?.source_name
  if (sourceName && FIXED_SOURCE_COLORS[sourceName]) return FIXED_SOURCE_COLORS[sourceName]
  if (sourceName && POPULATION_SOURCES.has(sourceName)) return POPULATION_SWATCH_COLOR

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
 * feature's fill by its __metricValue (population) using quantile
 * breakpoints — each color covers roughly the same NUMBER of hexes, not an
 * equal slice of the value range. Population density is heavily
 * right-skewed (a handful of extreme-density hexes, e.g. a city center,
 * next to a long tail of sparse ones); a linear min→max scale crushes that
 * whole tail into the palette's palest 1-2%, so nearly every hex renders
 * the same washed-out color and only the outliers stand out.
 * @param {GeoJSON.FeatureCollection} geojson
 */
export function populationFillExpression(geojson) {
  const values = (geojson?.features ?? [])
    .map((f) => f.properties?.__metricValue)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b)

  if (values.length === 0) return POPULATION_SWATCH_COLOR

  const min = values[0]
  const max = values[values.length - 1]
  if (min === max) return POPULATION_RAMP[Math.floor(POPULATION_RAMP.length / 2)]

  const steps = POPULATION_RAMP.length
  const rawBreaks = []
  for (let i = 1; i < steps; i++) rawBreaks.push(quantile(values, i / steps))

  // Low-density duplicate quantiles are common (many hexes share the same
  // sparse value) — MapLibre's `step` stops must be strictly ascending, so
  // collapse duplicates instead of erroring. A heavily-duplicated dataset
  // just ends up with fewer effective buckets.
  const breakpoints = []
  for (const b of rawBreaks) {
    if (breakpoints.length === 0 || b > breakpoints[breakpoints.length - 1]) breakpoints.push(b)
  }

  const expression = ['step', ['coalesce', ['get', '__metricValue'], min], POPULATION_RAMP[0]]
  breakpoints.forEach((bp, i) => expression.push(bp, POPULATION_RAMP[i + 1]))
  return expression
}
