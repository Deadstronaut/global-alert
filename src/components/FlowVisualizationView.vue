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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { useI18n } from 'vue-i18n'
import { SimpleWindLayer } from '@/vendor/simple-wind-layer.js'
import { fetchLatestFlowSnapshot, fetchLatestOverlaySnapshot } from '@/utils/windLayerData.js'
import { isFlowSnapshotStale } from '@/utils/flowSnapshotStaleness.js'

maplibregl.setWorkerUrl(maplibreWorkerUrl) // idempotent if MapView.vue already called this

const emit = defineEmits(['close'])
const { t } = useI18n()

const mapContainer = ref(null)
let map = null

const windEnabled = ref(true) // on by default here — this view's whole purpose is showing flow, unlike the main map's off-by-default toggle
const currentsEnabled = ref(false)
const wavesEnabled = ref(false)
const overlayEnabled = ref(false)

const status = ref({ wind: null, ocean_current: null, wave: null, air_quality_pm25: null })
const layerInstances = { wind: null, ocean_current: null, wave: null }
const LAYER_IDS = { wind: 'standalone-flow-wind', ocean_current: 'standalone-flow-currents', wave: 'standalone-flow-wave' }
const OVERLAY_LAYER_ID = 'standalone-overlay-pm25'

async function setFlowLayer(layerType, enabled) {
  if (!map) return
  const layerId = LAYER_IDS[layerType]
  if (!enabled) {
    if (map.getLayer(layerId)) map.removeLayer(layerId)
    layerInstances[layerType] = null
    return
  }
  if (layerInstances[layerType]) return

  const snapshot = layerType === 'wind' || layerType === 'ocean_current' || layerType === 'wave'
    ? await fetchLatestFlowSnapshot(layerType)
    : null
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
  })
  layerInstances[layerType] = layer
  map.addLayer(layer)
}

async function setOverlayLayer(enabled) {
  if (!map) return
  const sourceId = `${OVERLAY_LAYER_ID}-source`
  if (!enabled) {
    if (map.getLayer(OVERLAY_LAYER_ID)) map.removeLayer(OVERLAY_LAYER_ID)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    return
  }
  if (map.getLayer(OVERLAY_LAYER_ID)) return

  const snapshot = await fetchLatestOverlaySnapshot('air_quality_pm25')
  if (!snapshot) {
    status.value = { ...status.value, air_quality_pm25: 'unavailable' }
    return
  }
  status.value = { ...status.value, air_quality_pm25: snapshot }
  map.addSource(sourceId, { type: 'image', url: snapshot.textureUrl, coordinates: snapshot.coordinates })
  map.addLayer({ id: OVERLAY_LAYER_ID, type: 'raster', source: sourceId, paint: { 'raster-opacity': 0.65 } })
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
function toggleOverlay() {
  overlayEnabled.value = !overlayEnabled.value
  setOverlayLayer(overlayEnabled.value)
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
  // Root cause of this view showing literally nothing despite render()
  // running every frame with real, non-empty vertex data (live-debugged
  // 2026-08-05).
  resizeObserver = new ResizeObserver(() => map?.resize())
  resizeObserver.observe(mapContainer.value)

  map.on('load', () => {
    map.resize()
    if (windEnabled.value) setFlowLayer('wind', true)
    if (currentsEnabled.value) setFlowLayer('ocean_current', true)
    if (wavesEnabled.value) setFlowLayer('wave', true)
    if (overlayEnabled.value) setOverlayLayer(true)
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
      <h3>{{ t('windLayer.panelTitle') }}</h3>
      <label class="flow-view-row">
        <input type="checkbox" :checked="windEnabled" @change="toggleWind" />
        <span>{{ t('windLayer.toggleLabel') }}</span>
      </label>
      <label class="flow-view-row">
        <input type="checkbox" :checked="currentsEnabled" @change="toggleCurrents" />
        <span>{{ t('windLayer.currentsToggleLabel') }}</span>
      </label>
      <label class="flow-view-row">
        <input type="checkbox" :checked="wavesEnabled" @change="toggleWaves" />
        <span>{{ t('windLayer.wavesToggleLabel') }}</span>
      </label>
      <label class="flow-view-row">
        <input type="checkbox" :checked="overlayEnabled" @change="toggleOverlay" />
        <span>{{ t('windLayer.pm25ToggleLabel') }}</span>
      </label>
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
  left: 16px;
  z-index: 10;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 18, 26, 0.92);
  backdrop-filter: blur(10px);
  min-width: 180px;
}
.flow-view-controls h3 {
  margin: 0 0 10px;
  font-size: 0.85rem;
  color: #e2e8f0;
}
.flow-view-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: #e2e8f0;
  margin-bottom: 6px;
  cursor: pointer;
}
</style>
