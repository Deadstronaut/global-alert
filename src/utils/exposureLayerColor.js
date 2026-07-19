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

/**
 * Builds a MapLibre data-driven fill-color expression that grades each
 * feature's fill from light to dark by its __metricValue (population),
 * scaled to the actual min/max present in this dataset's fetched features
 * — a fixed color scale would either wash out a sparse country or clip a
 * dense one, so the range is computed per-dataset at render time.
 * @param {GeoJSON.FeatureCollection} geojson
 */
export function populationFillExpression(geojson) {
  const values = (geojson?.features ?? [])
    .map((f) => f.properties?.__metricValue)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))

  if (values.length === 0) return POPULATION_SWATCH_COLOR

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return POPULATION_RAMP[Math.floor(POPULATION_RAMP.length / 2)]

  const steps = POPULATION_RAMP.length
  const expression = ['interpolate', ['linear'], ['coalesce', ['get', '__metricValue'], min]]
  for (let i = 0; i < steps; i++) {
    const stop = min + ((max - min) * i) / (steps - 1)
    expression.push(stop, POPULATION_RAMP[i])
  }
  return expression
}
