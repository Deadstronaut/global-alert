/**
 * Generic click-to-inspect popup HTML for an exposure map feature (spec 042).
 * Content is assembled entirely from the feature's own stored data — no
 * per-source (`source_name`/`hazard_type`) branching, per FR-004/research.md
 * §3. Styling reuses the disaster-marker popup's "modern" card skeleton
 * (.disaster-popup-modern / .popup-header / .popup-body / .popup-metrics /
 * .popup-footer, MapView.vue) so exposure popups look and behave the same
 * as event popups instead of the older plain `.exposure-popup` card.
 */

import { colorForDataset } from './exposureLayerColor.js'
import { friendlyDatasetLabel } from './exposureLayerLabel.js'

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

function hexToRgba(hex, alpha) {
  const h = String(hex).replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * @param {(key: string) => string} t - vue-i18n translate function
 * @param {{ name?: string, metric_property_name?: string, source_name?: string|null, country_code?: string|null }} dataset
 * @param {number|null|undefined} metricValue
 * @param {Record<string, unknown>|null|undefined} properties
 */
export function buildFeaturePopupHtml(t, dataset, metricValue, properties) {
  const color = colorForDataset(dataset)
  const label = friendlyDatasetLabel(t, dataset) || dataset?.name || ''

  const metrics = []
  if (metricValue !== null && metricValue !== undefined && Number.isFinite(metricValue)) {
    const metricLabel = dataset?.metric_property_name ? formatPropertyKey(dataset.metric_property_name) : 'Value'
    metrics.push(`<span><b>${escapeHtml(metricLabel)}:</b> ${escapeHtml(metricValue)}</span>`)
  }
  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined || value === '') continue
      metrics.push(`<span><b>${escapeHtml(formatPropertyKey(key))}:</b> ${escapeHtml(value)}</span>`)
    }
  }

  const metricsHtml = metrics.length
    ? `<div class="popup-metrics">${metrics.join('')}</div>`
    : '<div class="popup-metrics exposure-popup-empty">—</div>'

  const countryText = dataset?.country_code ? escapeHtml(dataset.country_code.toUpperCase()) : ''
  const sourceText = dataset?.source_name ? escapeHtml(dataset.source_name.toUpperCase()) : ''

  return `
    <div class="disaster-popup-modern" style="--severity-color: ${color}; --severity-rgba: ${hexToRgba(color, 0.18)};">
      <div class="popup-header">
        <span class="chip type-chip" style="background: ${color}; color: #000;">${escapeHtml(label).toUpperCase()}</span>
      </div>
      <div class="popup-body">
        ${metricsHtml}
      </div>
      <div class="popup-footer">
        <span class="popup-date">${countryText}</span>
        ${sourceText ? `<span class="chip source-chip">${sourceText}</span>` : ''}
      </div>
    </div>
  `
}
