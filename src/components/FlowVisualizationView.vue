<script setup>
// Standalone, self-contained flow-visualization view — its own MapLibre
// instance, isolated from MapView.vue's much larger/more complex map
// (hex layers, resize observers, country-selection watchers, etc.).
// Built after live debugging inside the main map produced no visible
// particles despite confirmed-good data (texture URL reachable, layer
// added, no errors) and a mysteriously "flowing" console — rather than
// keep hunting for an interaction bug in a 3800+ line component, this
// gives the flow layers a minimal, easy-to-reason-about context of their
// own (explicit user request, 2026-08-05: "ayrı bir uygulama gibi... bu
// haritada göreceğiz diye bir derdimiz yok").
//
// Menu structure (Mode/Animate/Height/Overlay/Annotation rows, per-mode
// Overlay lists, Source lines) matches the reference tool's own layout
// exactly (live-testing ask, 2026-08-05: "önce bir menü olarak hazırla") —
// most entries are visible-but-disabled placeholders for data sources not
// wired up yet, same honesty pattern as Space/Bio in the main panel. Only
// entries with a `key` matching a real flow_snapshots/overlay_snapshots
// row are actually functional.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useI18n } from 'vue-i18n'
import { SimpleWindLayer } from '@/vendor/simple-wind-layer.js'
import { fetchLatestFlowSnapshot, fetchLatestOverlaySnapshot, buildWindSpeedOverlayDataUrl } from '@/utils/windLayerData.js'

maplibregl.setWorkerUrl(maplibreWorkerUrl) // idempotent if MapView.vue already called this

const emit = defineEmits(['close'])
const { t } = useI18n()

const mapContainer = ref(null)
let map = null

// ── Mode ─────────────────────────────────────────────────────────────────
const MODES = [
  { id: 'air', label: 'Air' },
  { id: 'ocean', label: 'Ocean' },
  { id: 'chem', label: 'Chem' },
  { id: 'particulates', label: 'Particulates' },
  { id: 'space', label: 'Space' },
  { id: 'bio', label: 'Bio' },
]
const selectedMode = ref('air')
const MODE_SOURCE = {
  air: 'GFS / NCEP / US National Weather Service',
  ocean: 'Global Ocean Physics Analysis and Forecast / CMEMS',
  chem: 'GEOS-5 / GMAO / NASA',
  particulates: 'CAMS / Copernicus / European Commission + ECMWF',
  space: 'OVATION / SWPC / NCEP / NWS / NOAA',
  bio: 'OVATION / SWPC / NCEP / NWS / NOAA',
}
// Reference tool's own HD-mode overlay list appends fire-hotspot
// attribution to every Source line — this app already ingests NASA FIRMS
// hotspot data elsewhere (server/.env's NASA_FIRMS_KEY), so this is a
// real, accurate attribution to show, even though FIRMS isn't wired as a
// toggle in THIS panel yet (it's already a full disaster-event layer in
// the main map).
const FIRE_SOURCE_SUFFIX = ' + VIIRS NRT / FIRMS / EOSDIS / NASA'

// Air mode's pressure-level selector — this app only has surface (Sfc)
// data for any GFS field today, so every other level is a disabled
// placeholder, same honesty pattern as the rest of this menu.
const HEIGHT_LEVELS = ['Sfc', '1000', '850', '700', '500', '250', '70', '10']
const selectedHeight = ref('Sfc')

// ── Animate (global — same three regardless of Mode, matching the
//    reference tool's own screenshots, which show the identical Animate
//    row in every Mode) ──────────────────────────────────────────────────
const windEnabled = ref(true) // on by default here — this view's whole purpose is showing flow, unlike the main map's off-by-default toggle
const currentsEnabled = ref(false)
const wavesEnabled = ref(false)

const status = ref({ wind: null, ocean_current: null, wave: null })
const layerInstances = { wind: null, ocean_current: null, wave: null }
const LAYER_IDS = { wind: 'standalone-flow-wind', ocean_current: 'standalone-flow-currents', wave: 'standalone-flow-wave' }

const SOURCE_LABELS = {
  wind: 'GFS / NCEP / US National Weather Service',
  ocean_current: 'CMEMS / Copernicus Marine',
  wave: 'WAVEWATCH III / NCEP / NWS',
}
const ANIMATE_LABELS = { wind: 'Rüzgar', ocean_current: 'Okyanus Akıntıları', wave: 'Dalgalar' }

function formatIssuedAt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// One row per currently-enabled Animate layer with real snapshot data —
// reference tool's "Source"/"Date" rows, but for every active layer at
// once (this view supports several simultaneously).
const activeAnimateSources = computed(() => {
  const entries = []
  for (const [key, snap] of Object.entries(status.value)) {
    if (snap && snap !== 'unavailable') {
      entries.push({ key, label: ANIMATE_LABELS[key], source: SOURCE_LABELS[key], date: formatIssuedAt(snap.issuedAt) })
    }
  }
  return entries
})

function findLandLayerId() {
  const layers = map?.getStyle()?.layers ?? []
  const landLayer = layers.find((l) => /^landcover|^landuse|^land\b/i.test(l.id))
  return landLayer?.id
}

async function setFlowLayer(layerType, enabled) {
  if (!map) return
  const layerId = LAYER_IDS[layerType]
  if (!enabled) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    layerInstances[layerType] = null
    return
  }
  if (layerInstances[layerType]) return

  const snapshot = await fetchLatestFlowSnapshot(layerType)
  if (!snapshot) {
    status.value = { ...status.value, [layerType]: 'unavailable' }
    console.warn(`[FlowVisualizationView] No ${layerType} snapshot available`)
    return
  }
  status.value = { ...status.value, [layerType]: snapshot }

  const layer = new SimpleWindLayer(layerId, {
    textureUrl: snapshot.textureUrl,
    bounds: snapshot.bounds,
    dataRange: snapshot.dataRange,
    speedMultiplier: speedMultiplier.value,
    trailLength: trailLength.value,
  })
  layerInstances[layerType] = layer
  map.addLayer(layer, findLandLayerId())
}

function toggleWind() {
  windEnabled.value = !windEnabled.value
  setFlowLayer('wind', windEnabled.value)
}
function toggleCurrents() {
  currentsEnabled.value = !currentsEnabled.value
  setFlowLayer('ocean_current', currentsEnabled.value)
}
function toggleWaves() {
  wavesEnabled.value = !wavesEnabled.value
  setFlowLayer('wave', wavesEnabled.value)
}

// ── Overlay (per-mode lists) ────────────────────────────────────────────
// `key` present + one of the two generic setter functions below = working;
// no `key` = visible-but-disabled placeholder (spec 054's own honesty
// pattern for Space/Bio, applied here per-entry instead of per-mode).
const OVERLAY_OPTIONS = {
  air: [
    { key: 'wind', kind: 'speed', label: 'Wind' },
    { label: 'Temp' }, { label: 'RH' }, { label: 'Dew' }, { label: 'WBT' }, { label: '3HPA' },
    { label: 'CAPE' }, { label: 'TPW' }, { label: 'TCW' }, { label: 'MSLP' }, { label: 'MI' },
    { label: 'UVI' }, { label: 'WPD' }, { label: 'None' },
  ],
  ocean: [
    { key: 'ocean_current', kind: 'speed', label: 'Currents' },
    { key: 'wave', kind: 'speed', label: 'Waves' },
    { label: 'HTSGW' }, { label: 'SST' }, { label: 'SSTA' }, { label: 'BAA' }, { label: 'None' },
  ],
  chem: [{ label: 'COsc' }, { label: 'CO2sc' }, { label: 'SO2sm' }, { label: 'NO2' }],
  particulates: [
    { label: 'DUex' }, { label: 'PM1' },
    { key: 'air_quality_pm25', kind: 'overlay', label: 'PM2.5' },
    { label: 'PM10' }, { label: 'OMaot' }, { label: 'SO4ex' },
  ],
  space: [{ label: 'Aurora' }],
  bio: [{ label: 'BAA' }, { label: 'None' }],
}
const BIO_ANNOTATIONS = [{ label: 'Fires' }, { label: 'None' }]

// "speed" overlays (Wind/Currents/Waves) decode an existing flow_snapshots
// texture client-side (buildWindSpeedOverlayDataUrl — works for any of the
// three, not wind-specific despite the name). "overlay" kind reads an
// already-pre-colored overlay_snapshots row (PM2.5). Both share one
// enabled-state map and one MapLibre source/layer-id scheme so toggling
// works the same way regardless of which kind a given entry is.
const overlayEnabled = ref({}) // { [key]: boolean }
const overlayStatus = ref({}) // { [key]: snapshot | 'unavailable' | null }
function overlayLayerId(key) {
  return `standalone-overlay-${key}`
}

async function setSpeedOverlay(key, enabled) {
  if (!map) return
  const layerId = overlayLayerId(key)
  const sourceId = `${layerId}-source`
  if (!enabled) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  if (map.getLayer(layerId)) return

  const snapshot = await fetchLatestFlowSnapshot(key)
  if (!snapshot) {
    overlayStatus.value = { ...overlayStatus.value, [key]: 'unavailable' }
    return
  }
  overlayStatus.value = { ...overlayStatus.value, [key]: snapshot }
  const dataUrl = await buildWindSpeedOverlayDataUrl(snapshot)
  map.addSource(sourceId, { type: 'image', url: dataUrl, coordinates: snapshot.coordinates })
  map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.55 } })
}

async function setPreColoredOverlay(key, enabled) {
  if (!map) return
  const layerId = overlayLayerId(key)
  const sourceId = `${layerId}-source`
  if (!enabled) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  if (map.getLayer(layerId)) return

  const snapshot = await fetchLatestOverlaySnapshot(key)
  if (!snapshot) {
    overlayStatus.value = { ...overlayStatus.value, [key]: 'unavailable' }
    return
  }
  overlayStatus.value = { ...overlayStatus.value, [key]: snapshot }
  map.addSource(sourceId, { type: 'image', url: snapshot.textureUrl, coordinates: snapshot.coordinates })
  map.addLayer({ id: layerId, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.65 } })
}

function toggleOverlayOption(option) {
  if (!option.key) return // disabled placeholder — no handler beyond this early return
  const enabled = !overlayEnabled.value[option.key]
  overlayEnabled.value = { ...overlayEnabled.value, [option.key]: enabled }
  if (option.kind === 'speed') setSpeedOverlay(option.key, enabled)
  else setPreColoredOverlay(option.key, enabled)
}

// ── Live tuning (gear icon) ─────────────────────────────────────────────
const showSettings = ref(false)
const speedMultiplier = ref(336) // live-testing result, 2026-08-05: this + trailLength=89 produced the actual nullschool-style flowing streamline look
function onSpeedInput(e) {
  speedMultiplier.value = Number(e.target.value)
  for (const layer of Object.values(layerInstances)) layer?.setSpeedMultiplier(speedMultiplier.value)
}
const trailLength = ref(89)
function onTrailInput(e) {
  trailLength.value = Number(e.target.value)
  for (const layer of Object.values(layerInstances)) layer?.setTrailLength(trailLength.value)
}

let resizeObserver = null

onMounted(() => {
  map = new maplibregl.Map({
    container: mapContainer.value,
    style: 'https://tiles.openfreemap.org/styles/dark',
    center: [0, 20],
    zoom: 1.3,
    attributionControl: false,
  })

  // Same fix MapView.vue's own initMap() needed (see that file's comment on
  // mapResizeObserver): a freshly-mounted modal's container can still be
  // 0x0 or mid-CSS-transition the instant `new Map()` reads its layout box
  // — nothing about the map "failing" (no console error, tiles load fine),
  // it just paints into a wrongly-sized/degenerate canvas forever after.
  resizeObserver = new ResizeObserver(() => map?.resize())
  resizeObserver.observe(mapContainer.value)

  map.on('load', () => {
    map.resize()
    if (windEnabled.value) setFlowLayer('wind', true)
    if (currentsEnabled.value) setFlowLayer('ocean_current', true)
    if (wavesEnabled.value) setFlowLayer('wave', true)
  })

  map.on('error', (e) => console.error('[FlowVisualizationView] map error', e))
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  map?.remove()
  map = null
})
</script>

<template>
  <div class="flow-view-overlay">
    <button type="button" class="flow-view-close" :aria-label="t('windLayer.panelCollapse')" @click="emit('close')">✕</button>

    <div class="flow-view-controls">
      <div class="flow-view-bar-row">
        <span class="flow-view-bar-label">Source</span>
        <span class="flow-view-source-text">{{ MODE_SOURCE[selectedMode] }}{{ FIRE_SOURCE_SUFFIX }}</span>
      </div>

      <div class="flow-view-legend">
        <span class="flow-view-bar-label">Scale</span>
        <div class="flow-view-legend-gradient"></div>
      </div>

      <div class="flow-view-bar-row">
        <span class="flow-view-bar-label">Mode</span>
        <button
          v-for="mode in MODES"
          :key="mode.id"
          type="button"
          class="flow-view-chip flow-view-mode-btn"
          :class="{ 'flow-view-mode-btn--active': selectedMode === mode.id }"
          @click="selectedMode = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>

      <div class="flow-view-bar-row">
        <span class="flow-view-bar-label">Animate</span>
        <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': windEnabled }" @click="toggleWind">{{ t('windLayer.toggleLabel') }}</button>
        <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': currentsEnabled }" @click="toggleCurrents">{{ t('windLayer.currentsToggleLabel') }}</button>
        <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': wavesEnabled }" @click="toggleWaves">{{ t('windLayer.wavesToggleLabel') }}</button>
      </div>

      <div v-if="selectedMode === 'air'" class="flow-view-bar-row">
        <span class="flow-view-bar-label">Height</span>
        <button
          v-for="level in HEIGHT_LEVELS"
          :key="level"
          type="button"
          class="flow-view-chip"
          :class="level === 'Sfc' ? ['flow-view-mode-btn', { 'flow-view-mode-btn--active': selectedHeight === level }] : 'flow-view-chip--disabled'"
          :title="level === 'Sfc' ? '' : 'Yakında — sadece yüzey verisi var'"
          @click="level === 'Sfc' && (selectedHeight = level)"
        >{{ level }}</button>
      </div>

      <div class="flow-view-bar-row">
        <span class="flow-view-bar-label">Overlay</span>
        <button
          v-for="option in OVERLAY_OPTIONS[selectedMode]"
          :key="option.label"
          type="button"
          class="flow-view-chip"
          :class="option.key ? ['flow-view-mode-btn', { 'flow-view-mode-btn--active': !!overlayEnabled[option.key] }] : 'flow-view-chip--disabled'"
          :title="option.key ? '' : 'Yakında — veri kaynağı henüz eklenmedi'"
          @click="toggleOverlayOption(option)"
        >{{ option.label }}</button>
      </div>

      <div v-if="selectedMode === 'bio'" class="flow-view-bar-row">
        <span class="flow-view-bar-label">Annotation</span>
        <span v-for="a in BIO_ANNOTATIONS" :key="a.label" class="flow-view-chip flow-view-chip--disabled" title="Yakında">{{ a.label }}</span>
      </div>

      <!-- Real per-Animate-layer Source/Date, matching the reference
           tool's own rows but for every active layer at once. -->
      <div v-if="activeAnimateSources.length" class="flow-view-source-block">
        <div v-for="s in activeAnimateSources" :key="s.key" class="flow-view-source-row">
          <span class="flow-view-bar-label">{{ s.label }}</span>
          <span class="flow-view-source-text">{{ s.source }}<template v-if="s.date"> — {{ s.date }}</template></span>
        </div>
      </div>

      <button type="button" class="flow-view-gear" @click="showSettings = !showSettings">⚙️</button>
      <div v-if="showSettings" class="flow-view-settings">
        <label class="flow-view-settings-label">
          Hız çarpanı: {{ speedMultiplier.toFixed(1) }}x
          <input type="range" min="0.5" max="1000" step="0.5" :value="speedMultiplier" @input="onSpeedInput" />
        </label>
        <label class="flow-view-settings-label">
          İz uzunluğu: {{ trailLength }}
          <input type="range" min="2" max="2000" step="1" :value="trailLength" @input="onTrailInput" />
        </label>
      </div>
    </div>

    <div ref="mapContainer" class="flow-view-map"></div>
  </div>
</template>

<style scoped>
.flow-view-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: #0b0f16;
}

.flow-view-map {
  position: absolute;
  inset: 0;
}

.flow-view-close {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(20, 24, 33, 0.9);
  color: #e2e8f0;
  font-size: 16px;
  cursor: pointer;
}

.flow-view-controls {
  position: absolute;
  top: 16px;
  left: 90px; /* live-testing ask, 2026-08-05: 16px overlapped something underneath */
  z-index: 10;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 18, 26, 0.92);
  backdrop-filter: blur(10px);
  min-width: 320px;
  max-width: 420px;
}

.flow-view-bar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.flow-view-bar-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  min-width: 60px;
}
.flow-view-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: #e2e8f0;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.flow-view-chip--disabled {
  color: rgba(255, 255, 255, 0.32);
  cursor: not-allowed;
}

.flow-view-mode-btn {
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}
.flow-view-mode-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}
.flow-view-mode-btn--active {
  background: #d4a94a;
  border-color: #d4a94a;
  color: #0b1220;
  font-weight: 700;
  box-shadow: 0 0 8px 1px rgba(212, 169, 74, 0.6);
}

.flow-view-source-block {
  margin-bottom: 8px;
  padding: 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.flow-view-source-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 5px;
}
.flow-view-source-row:last-child {
  margin-bottom: 0;
}
.flow-view-source-text {
  font-size: 0.7rem;
  color: #8c97a8;
}

.flow-view-legend {
  margin-bottom: 8px;
}
.flow-view-legend-gradient {
  margin-top: 4px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgb(64, 140, 242), rgb(242, 89, 38));
}

.flow-view-gear {
  margin-top: 8px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 0.85rem;
}
.flow-view-gear:hover {
  background: rgba(255, 255, 255, 0.14);
}

.flow-view-settings {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.flow-view-settings-label {
  display: block;
  font-size: 0.75rem;
  color: #cbd5e1;
}
.flow-view-settings-label input[type='range'] {
  display: block;
  width: 100%;
  margin-top: 6px;
}
</style>
