/**
 * Generic click-to-inspect popup HTML for an exposure map feature (spec 042).
 * Assembled entirely from the feature's own stored data — no per-source
 * (`source_name`/`hazard_type`) branching, per FR-004/research.md §3.
 */

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

/**
 * @param {{ name?: string, metric_property_name?: string, source_name?: string|null }} dataset
 * @param {number|null|undefined} metricValue
 * @param {Record<string, unknown>|null|undefined} properties
 */
export function buildFeaturePopupHtml(dataset, metricValue, properties) {
  const rows = []

  if (metricValue !== null && metricValue !== undefined && Number.isFinite(metricValue)) {
    const metricLabel = dataset?.metric_property_name ? formatPropertyKey(dataset.metric_property_name) : 'Value'
    rows.push(`<div class="exposure-popup-row"><strong>${escapeHtml(metricLabel)}:</strong> ${escapeHtml(metricValue)}</div>`)
  }

  if (properties && typeof properties === 'object') {
    for (const [key, value] of Object.entries(properties)) {
      if (value === null || value === undefined || value === '') continue
      rows.push(`<div class="exposure-popup-row"><strong>${escapeHtml(formatPropertyKey(key))}:</strong> ${escapeHtml(value)}</div>`)
    }
  }

  const title = dataset?.name ? escapeHtml(dataset.name) : ''
  const body = rows.length ? rows.join('') : '<div class="exposure-popup-row exposure-popup-empty">—</div>'

  return `<div class="exposure-popup">${title ? `<div class="exposure-popup-title">${title}</div>` : ''}${body}</div>`
}
