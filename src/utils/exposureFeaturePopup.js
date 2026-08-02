/**
 * Click-to-inspect popup HTML for an exposure map feature (spec 042).
 * `buildFeaturePopupHtml` is a dispatcher: building_footprints gets a
 * bespoke card because its data literally doesn't fit the generic one
 * (one-hex-per-N-buildings, no facility identity at all) — everything
 * else, including osm-buildings, goes through the fully generic builder
 * (FR-004/research.md §3: no per-source branching by default).
 */

import { colorForDataset } from './exposureLayerColor.js'
import { friendlyDatasetLabel } from './exposureLayerLabel.js'
import { POPUP_CLOSE_BTN_HTML } from './popupCloseButton.js'

// Rounds a raw metric value (population count, rainfall mm, slope deg...) to
// 2 decimals and inserts ',' thousands separators — fixed formatting, not
// toLocaleString() (runtime-locale-dependent, so the exact same value can
// render differently per user/environment and made this function's own
// tests non-deterministic).
function formatMetricNumber(value) {
  const rounded = Math.round(value * 100) / 100
  const [intPart, decPart] = String(Math.abs(rounded)).split('.')
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = rounded < 0 ? '-' : ''
  return decPart ? `${sign}${withSeparators}.${decPart}` : `${sign}${withSeparators}`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPropertyKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

// Internal/technical fields that ride along in a feature's raw properties
// but mean nothing to an end user looking at a popup (an H3 spatial-index
// cell id, a duplicate of the dataset's own source_name already shown as
// the card's title chip, a raw row id, raw OSM node/way bookkeeping) —
// live-testing finding, 2026-07-31.
const HIDDEN_PROPERTY_KEYS = new Set(['h3_cell', 'h3cell', 'source', 'id', 'osmid', 'osmtype'])

// osm-buildings' `beds` tag comes straight from OSM (buildingRecord.ts)
// with no per-facility-type filter server-side, so a school or fire
// station that happens to carry a stray `beds` tag (e.g. a boarding
// school's dormitory count) shows a nonsensical "Beds: N" row next to
// "Type: School" — live-testing finding, 2026-07-31 ("okulların yatak
// bilgisi kartta görünüyor"). Only hospitals/clinics get a bed count.
const HEALTH_FACILITY_TYPES = new Set(['hospital', 'clinic'])

// A handful of property KEYS hold a raw, untranslated enum VALUE rather than
// free text — e.g. critical-infrastructure buildings' facilityType is a raw
// OSM tag ('university', 'hospital', 'fire_station'...), which reads as
// unlocalized English in every other language's UI (live-testing finding:
// "Type: university" in an otherwise-Turkish popup). Keyed lowercase,
// mapped to the i18n namespace holding that value's translations.
const VALUE_I18N_NAMESPACE = { facilitytype: 'facilityType' }

function formatPropertyValue(t, key, value) {
  const namespace = VALUE_I18N_NAMESPACE[key.toLowerCase()]
  if (!namespace || typeof value !== 'string') return value
  return t(`${namespace}.${value}`, value)
}

// Matches the facilityType i18n dictionary — a small glyph per facility
// kind reads faster than the text alone (live-testing ask, 2026-07-31).
const FACILITY_ICONS = {
  hospital: '🏥',
  clinic: '⚕️',
  school: '🏫',
  university: '🎓',
  college: '🎓',
  fire_station: '🚒',
  police: '👮',
  townhall: '🏛️',
  government_office: '🏛️',
  unknown: '🏢',
}

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * building_footprints (spec 050): one row per H3 hex, aggregating N nearby
 * buildings into a single density count — there's no facility identity to
 * show (properties only ever carry h3Cell/source, both already hidden by
 * the generic builder). Leads with the count itself as the headline.
 */
function buildBuildingDensityPopupHtml(t, dataset, metricValue, countryText) {
  const color = colorForDataset(dataset)
  const count = Number.isFinite(metricValue) ? metricValue.toLocaleString() : '—'
  const label = friendlyDatasetLabel(t, dataset, { includeCountry: false }) || dataset?.name || ''

  return `
    <div class="disaster-popup-modern density-popup" style="--severity-color: ${color}; --severity-rgba: ${hexToRgba(color, 0.18)};">
      ${POPUP_CLOSE_BTN_HTML}
      <div class="popup-header">
        <span class="facility-popup-icon">🏘️</span>
        <span class="chip type-chip" style="background: ${color}; color: #000;">${escapeHtml(label).toUpperCase()}</span>
      </div>
      <div class="popup-body density-popup-body">
        <div class="density-popup-count">${count}</div>
        <div class="density-popup-label">${escapeHtml(t('exposureLayers.buildingCountLabel', 'buildings in this area'))}</div>
      </div>
      <div class="popup-footer">
        <span class="popup-date">${countryText}</span>
      </div>
    </div>
  `
}

/**
 * @param {(key: string) => string} t - vue-i18n translate function
 * @param {{ name?: string, metric_property_name?: string, source_name?: string|null, country_code?: string|null }} dataset
 * @param {number|null|undefined} metricValue
 * @param {Record<string, unknown>|null|undefined} properties
 * @param {number|null|undefined} haloSeverity - spec 050 US2: 0-1 distance-based
 *   estimate when this point is inside a selected event's impact halo, else
 *   null/undefined. When present, an explicit FR-005 disclaimer is shown —
 *   this is never a confirmed damage assessment.
 */
export function buildFeaturePopupHtml(t, dataset, metricValue, properties, haloSeverity) {
  const countryText = dataset?.country_code ? escapeHtml(dataset.country_code.toUpperCase()) : ''

  if (dataset?.source_name === 'building_footprints') {
    return buildBuildingDensityPopupHtml(t, dataset, metricValue, countryText)
  }

  const color = colorForDataset(dataset)
  // No country suffix here (unlike the exposure-layers list panel): a popup
  // only ever opens inside the already-selected country's own map, so
  // "(Türkiye)" on every single feature card is redundant, not disambiguating.
  const label = friendlyDatasetLabel(t, dataset, { includeCountry: false }) || dataset?.name || ''
  const isOsmBuilding = dataset?.source_name === 'osm-buildings'
  // A small facility-kind glyph, same dictionary as the value-translation
  // above — purely decorative, doesn't change what data is shown.
  const icon = isOsmBuilding
    ? `<span class="facility-popup-icon">${FACILITY_ICONS[properties?.facilityType] ?? FACILITY_ICONS.unknown}</span>`
    : ''

  const metrics = []
  // osm-buildings' metric_value is always 1 (writeExposureDataset writes it
  // that way — one row per facility, nothing to count), so the generic
  // "Count: 1" row here is pure noise, not real information — matches the
  // same reasoning MapView.vue's own isCriticalInfra already applies to
  // this source's map-label text (live-testing finding, 2026-07-31).
  if (!isOsmBuilding && metricValue !== null && metricValue !== undefined && Number.isFinite(metricValue)) {
    const metricLabel = dataset?.metric_property_name ? formatPropertyKey(dataset.metric_property_name) : 'Value'
    // Raw metric_value came straight from a raster pixel sum/mean (population
    // count, rainfall mm, slope deg...) and can carry a dozen meaningless
    // float digits (e.g. "61.3960660119994") — round to 2 decimals and add
    // thousands separators, matching the abbreviated formatting the same
    // value already gets on the hexagon's own map label (live-testing
    // finding, 2026-08-03).
    const displayValue = formatMetricNumber(metricValue)
    metrics.push(`<span><b>${escapeHtml(metricLabel)}:</b> ${escapeHtml(displayValue)}</span>`)
  }
  if (properties && typeof properties === 'object') {
    const facilityType = typeof properties.facilityType === 'string' ? properties.facilityType : null
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined || value === '') continue
      if (HIDDEN_PROPERTY_KEYS.has(key.toLowerCase())) continue
      if (key.toLowerCase() === 'beds' && !HEALTH_FACILITY_TYPES.has(facilityType)) continue
      const displayValue = formatPropertyValue(t, key, value)
      metrics.push(`<span><b>${escapeHtml(formatPropertyKey(key))}:</b> ${escapeHtml(displayValue)}</span>`)
    }
  }

  const metricsHtml = metrics.length
    ? `<div class="popup-metrics">${metrics.join('')}</div>`
    : '<div class="popup-metrics exposure-popup-empty">—</div>'

  const haloDisclaimerHtml = haloSeverity !== null && haloSeverity !== undefined
    ? `<p class="popup-halo-disclaimer">${escapeHtml(t('exposureLayers.haloSeverityDisclaimer'))}</p>`
    : ''

  return `
    <div class="disaster-popup-modern" style="--severity-color: ${color}; --severity-rgba: ${hexToRgba(color, 0.18)};">
      ${POPUP_CLOSE_BTN_HTML}
      <div class="popup-header">
        ${icon}
        <span class="chip type-chip" style="background: ${color}; color: #000;">${escapeHtml(label).toUpperCase()}</span>
      </div>
      <div class="popup-body">
        ${metricsHtml}
        ${haloDisclaimerHtml}
      </div>
      <div class="popup-footer">
        <span class="popup-date">${countryText}</span>
      </div>
    </div>
  `
}
