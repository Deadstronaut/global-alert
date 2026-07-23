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
  hydrorivers: 'exposureLayers.sourceLabel.hydrorivers',
  hydrobasins: 'exposureLayers.sourceLabel.hydrobasins',
  worldpop: 'exposureLayers.sourceLabel.worldpop',
  gdo_spi: 'exposureLayers.sourceLabel.gdoSpi',
  gdo_fapar_anomaly: 'exposureLayers.sourceLabel.gdoFapar',
  gdo_soil_moisture_anomaly: 'exposureLayers.sourceLabel.gdoSoilMoisture',
  ghsl: 'exposureLayers.sourceLabel.ghsl',
  meta_hdx: 'exposureLayers.sourceLabel.metaHdx',
  glofas_river_discharge: 'exposureLayers.sourceLabel.glofasRiverDischarge',
  'osm-buildings': 'exposureLayers.sourceLabel.osmBuildings',
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

/**
 * Machine-readable dataset.source_metadata (resolution/baseline period/
 * update frequency — see gdoSpiFetch.ts) rendered as a short, localized
 * caveat line. Returns '' (nothing shown) for every dataset without
 * source_metadata — i.e. every source except GDO SPI today — so this is
 * additive and never affects existing dataset rows.
 *
 * @param {(key: string, params?: object) => string} t
 * @param {{ source_metadata?: Record<string, unknown>|null }} dataset
 */
export function coarseResolutionNote(t, dataset) {
  const meta = dataset?.source_metadata
  if (!meta) return ''
  const parts = []
  if (meta.resolutionDeg) parts.push(t('exposureLayers.metaNote.resolution', { deg: meta.resolutionDeg }))
  if (meta.baselinePeriod) parts.push(t('exposureLayers.metaNote.baseline', { period: meta.baselinePeriod }))
  if (meta.updateFrequency) parts.push(t(`exposureLayers.metaNote.frequency.${meta.updateFrequency}`))
  return parts.join(' • ')
}
