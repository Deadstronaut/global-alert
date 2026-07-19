/**
 * Friendly, localized display label for an exposure layer (spec 042 UX
 * polish). Presentation-only — does not affect geometry rendering or popup
 * content (still fully generic, FR-004). Unknown source/country codes fall
 * back to the raw dataset name, matching this project's i18n fallback
 * convention: a new exposure source still appears automatically with zero
 * code changes, just without a friendly label until one is added here.
 */

const SOURCE_LABEL_KEYS = {
  osm: 'exposureLayers.sourceLabel.osm',
  kontur: 'exposureLayers.sourceLabel.kontur',
}

const COUNTRY_LABEL_KEYS = {
  tr: 'exposureLayers.countryLabel.tr',
  mg: 'exposureLayers.countryLabel.mg',
  my: 'exposureLayers.countryLabel.my',
}

/**
 * @param {(key: string) => string} t - vue-i18n translate function
 * @param {{ name?: string, source_name?: string|null, country_code?: string|null }} dataset
 */
export function friendlyDatasetLabel(t, dataset) {
  if (!dataset) return ''

  const sourceKey = SOURCE_LABEL_KEYS[dataset.source_name]
  const countryKey = COUNTRY_LABEL_KEYS[dataset.country_code]

  if (!sourceKey) return dataset.name ?? ''

  const sourceLabel = t(sourceKey)
  const countryLabel = countryKey ? t(countryKey) : dataset.country_code?.toUpperCase()
  return countryLabel ? `${sourceLabel} (${countryLabel})` : sourceLabel
}
