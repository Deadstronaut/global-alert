/**
 * Friendly, localized display label for an exposure layer (spec 042 UX
 * polish). Presentation-only — does not affect geometry rendering or popup
 * content (still fully generic, FR-004). Unknown source/country codes fall
 * back to the raw dataset name, matching this project's i18n fallback
 * convention: a new exposure source still appears automatically with zero
 * code changes, just without a friendly label until one is added here.
 *
 * dataset.display_name (20260727080000_exposure_datasets_display_name.sql)
 * takes priority over all of that — an admin-editable override (set from
 * ExposureDatasetManager.vue) for exactly the case this fallback convention
 * doesn't solve: a *future* automated source's raw auto-generated name
 * (`${sourceName} — ${countryCode} — ${yyyy-mm}`) with nobody available to
 * add a SOURCE_LABEL_KEYS + i18n entry for it. No per-locale translation —
 * whatever the admin typed, verbatim, in every language — which is still
 * strictly better than a debug-log-looking string in production forever.
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
  chirps: 'exposureLayers.sourceLabel.chirps',
  dem_slope: 'exposureLayers.sourceLabel.demSlope',
  building_footprints: 'exposureLayers.sourceLabel.buildingFootprints',
}

const COUNTRY_LABEL_KEYS = {
  tr: 'exposureLayers.countryLabel.tr',
  mg: 'exposureLayers.countryLabel.mg',
  my: 'exposureLayers.countryLabel.my',
}

/**
 * @param {(key: string) => string} t - vue-i18n translate function
 * @param {{ name?: string, display_name?: string|null, source_name?: string|null, country_code?: string|null }} dataset
 * @param {{ includeCountry?: boolean }} [opts] - includeCountry:false drops the
 *   "(Country)" suffix — useful in contexts already scoped to one country
 *   (e.g. a feature popup opened by clicking that country's own map), where
 *   the suffix is redundant rather than disambiguating (spec 042 UX polish,
 *   live-testing finding: "Bina Yoğunluğu (Türkiye)" in a popup that can
 *   only ever be about Türkiye reads as clutter, not information).
 */
export function friendlyDatasetLabel(t, dataset, opts = {}) {
  if (!dataset) return ''

  if (dataset.display_name?.trim()) return dataset.display_name.trim()

  const sourceKey = SOURCE_LABEL_KEYS[dataset.source_name]
  const countryKey = COUNTRY_LABEL_KEYS[dataset.country_code]

  if (!sourceKey) return dataset.name ?? ''

  const sourceLabel = t(sourceKey)
  if (opts.includeCountry === false) return sourceLabel

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
