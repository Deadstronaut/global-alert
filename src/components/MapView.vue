<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'
import { latLngToCell, cellToBoundary } from 'h3-js'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

const mapContainer = ref(null)
let map = null
let mapLoaded = false
let markerObjects = []
let userMarkerObj = null
const isSatellite = ref(false)
const currentZoom = ref(3)

const ESRI_SATELLITE_STYLE = {
  version: 8,
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: 'Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [{ id: 'esri-satellite-layer', type: 'raster', source: 'esri-satellite' }],
}

function getBaseStyle() {
  if (isSatellite.value) return ESRI_SATELLITE_STYLE
  if (uiStore.highContrast || uiStore.darkMode) {
    return 'https://tiles.openfreemap.org/styles/dark'
  }
  return 'https://tiles.openfreemap.org/styles/liberty'
}

function toggleSatellite() {
  isSatellite.value = !isSatellite.value
  if (!map) return
  map.setMaxZoom(isSatellite.value ? 17.4 : 20)
  mapLoaded = false
  map.setStyle(getBaseStyle())
  map.once('style.load', () => {
    mapLoaded = true
    addSourcesAndLayers()
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()
  })
}

function addTerrain() {
  if (map.getSource('terrain-dem')) return
  map.addSource('terrain-dem', {
    type: 'raster-dem',
    tiles: ['https://tiles.stadiamaps.com/data/terrarium/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 12,
    encoding: 'terrarium',
  })
  map.setTerrain({ source: 'terrain-dem', exaggeration: 1.2 })
}

function addBuildings3D() {
  if (isSatellite.value) return
  if (map.getSource('ofm-buildings')) return
  map.addSource('ofm-buildings', {
    type: 'vector',
    url: 'https://tiles.openfreemap.org/planet',
  })
  map.addLayer({
    id: 'buildings-3d',
    type: 'fill-extrusion',
    source: 'ofm-buildings',
    'source-layer': 'building',
    minzoom: 15,
    paint: {
      'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'render_height'],
        0, '#c8d0da',
        200, '#a0b8d0',
        400, '#80a0c0',
      ],
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'],
        15, 0,
        16, ['get', 'render_height'],
      ],
      'fill-extrusion-base': ['get', 'render_min_height'],
      'fill-extrusion-opacity': 0.85,
    },
  })
}

function addSourcesAndLayers() {
  map.addSource('disaster-heat', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('disaster-hex', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: 'hex-fill',
    type: 'fill',
    source: 'disaster-hex',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': 0.6,
    },
    layout: { visibility: 'none' },
  })

  map.addLayer({
    id: 'hex-stroke',
    type: 'line',
    source: 'disaster-hex',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1.5,
      'line-opacity': 0.9,
    },
    layout: { visibility: 'none' },
  })

  map.addLayer({
    id: 'heat-layer',
    type: 'heatmap',
    source: 'disaster-heat',
    paint: {
      'heatmap-weight': ['get', 'weight'],
      'heatmap-radius': 50,
      'heatmap-intensity': 1,
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0,
        'rgba(0,0,0,0)',
        0.2,
        '#90a4ae',
        0.4,
        '#00e676',
        0.6,
        '#ffd600',
        0.8,
        '#ff9100',
        1.0,
        '#ff1744',
      ],
      'heatmap-opacity': 0.8,
    },
    layout: { visibility: 'none' },
  })

  addTerrain()
  addBuildings3D()
}

function initMap() {
  if (!mapContainer.value || map) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: getBaseStyle(),
    center: [30, 20],
    zoom: 3,
    minZoom: 1.55,
    maxZoom: 20,
    attributionControl: false,
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

  map.on('error', (e) => {
    console.error('[MapLibre] Error:', e.error)
  })

  map.on('zoom', () => {
    currentZoom.value = Math.round(map.getZoom() * 10) / 10
  })

  map.on('load', () => {
    mapLoaded = true
    addSourcesAndLayers()
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()

    map.on('click', 'hex-fill', (e) => {
      if (!e.features || !e.features.length) return
      const props = e.features[0].properties
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(
          `
          <div class="disaster-popup">
            <h4>${props.count} ${t('alerts.events')}</h4>
            <p>${t('alerts.severity')}: ${String(props.maxSeverity).toUpperCase()}</p>
          </div>
        `,
        )
        .addTo(map)
    })

    map.on('mouseenter', 'hex-fill', () => {
      map.getCanvas().style.cursor = 'pointer'
    })
    map.on('mouseleave', 'hex-fill', () => {
      map.getCanvas().style.cursor = ''
    })
  })
}

function clearMarkers() {
  markerObjects.forEach((m) => m.remove())
  markerObjects = []
}

function updateMarkers() {
  if (!map || !mapLoaded) return
  clearMarkers()

  if (uiStore.showHeatmap || uiStore.showHexbins) return

  disasterStore.allEvents.forEach((event) => {
    const color = getSeverityHex(event.severity)
    const isPulse = event.severity === 'critical'

    const el = document.createElement('div')
    el.className = `disaster-marker${isPulse ? ' marker-pulse' : ''}`
    el.innerHTML = `
      <div class="marker-dot" style="background:${color};box-shadow:0 0 10px ${color};">
        <span class="marker-icon">${event.icon}</span>
      </div>
    `

    const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
      <div class="disaster-popup">
        <h4>${event.title}</h4>
        <p>${event.description}</p>
        <div class="popup-meta">
          <span>${t('alerts.source')}: ${event.source}</span>
          <span>${t('alerts.time')}: ${new Date(event.time).toLocaleString('tr-TR')}</span>
        </div>
      </div>
    `)

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([event.lng, event.lat])
      .setPopup(popup)
      .addTo(map)

    markerObjects.push(marker)
  })
}

function updateHeatmap() {
  if (!map || !mapLoaded) return

  const showHeat = uiStore.showHeatmap
  map.setLayoutProperty('heat-layer', 'visibility', showHeat ? 'visible' : 'none')

  if (!showHeat) return

  const intensityMap = { critical: 1.0, high: 0.8, moderate: 0.6, low: 0.3, minimal: 0.1 }
  const features = disasterStore.allEvents.map((e) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
    properties: { weight: intensityMap[e.severity] || 0.1 },
  }))

  map.getSource('disaster-heat').setData({ type: 'FeatureCollection', features })
}

function updateHexbins() {
  if (!map || !mapLoaded) return

  const showHex = uiStore.showHexbins
  map.setLayoutProperty('hex-fill', 'visibility', showHex ? 'visible' : 'none')
  map.setLayoutProperty('hex-stroke', 'visibility', showHex ? 'visible' : 'none')

  if (!showHex) return

  const events = disasterStore.allEvents
  const cells = {}
  const severities = ['minimal', 'low', 'moderate', 'high', 'critical']

  events.forEach((e) => {
    const h3Index = latLngToCell(e.lat, e.lng, 4)
    if (!cells[h3Index]) cells[h3Index] = { maxSeverity: e.severity, count: 0 }
    if (severities.indexOf(e.severity) > severities.indexOf(cells[h3Index].maxSeverity)) {
      cells[h3Index].maxSeverity = e.severity
    }
    cells[h3Index].count++
  })

  const features = Object.entries(cells).map(([h3Index, data]) => {
    const boundary = cellToBoundary(h3Index) // [[lat, lng], ...]
    const ring = boundary.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0]) // close ring
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        color: getSeverityHex(data.maxSeverity),
        maxSeverity: data.maxSeverity,
        count: data.count,
      },
    }
  })

  map.getSource('disaster-hex').setData({ type: 'FeatureCollection', features })
}

function updateUserMarker() {
  if (!map || !mapLoaded) return

  if (geoStore.hasLocation) {
    const coords = [geoStore.userLng, geoStore.userLat]
    if (userMarkerObj) {
      userMarkerObj.setLngLat(coords)
    } else {
      const el = document.createElement('div')
      el.className = 'user-location-marker'
      el.innerHTML = `
        <div class="user-pin">
          <div class="pin-head"></div>
          <div class="pin-pulse"></div>
        </div>
      `
      userMarkerObj = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .setPopup(new maplibregl.Popup({ offset: 12 }).setText('Konumunuz'))
        .addTo(map)
    }
  } else if (userMarkerObj) {
    userMarkerObj.remove()
    userMarkerObj = null
  }
}

function applyBaseStyle() {
  if (!map || !mapLoaded) return
  mapLoaded = false
  map.setStyle(getBaseStyle())
  map.once('style.load', () => {
    mapLoaded = true
    addSourcesAndLayers()
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()
  })
}

function flyToRegion(lat, lng, zoom) {
  if (!map) return
  map.flyTo({ center: [lng, lat], zoom, duration: 1500, essential: true })
}

watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && map) flyToRegion(region.lat, region.lng, region.zoom)
  },
)

watch(
  () => disasterStore.allEvents,
  () => {
    updateMarkers()
    updateHeatmap()
    updateHexbins()
  },
  { deep: true },
)

watch(
  () => [uiStore.showHeatmap, uiStore.showHexbins],
  () => {
    updateMarkers()
    updateHeatmap()
    updateHexbins()
  },
)

watch(
  () => geoStore.userCoords,
  () => {
    updateUserMarker()
  },
  { deep: true },
)

watch(
  () => [uiStore.darkMode, uiStore.highContrast],
  () => {
    applyBaseStyle()
  },
)

onMounted(() => {
  requestAnimationFrame(function tryInit() {
    if (!mapContainer.value) return
    const { offsetWidth, offsetHeight } = mapContainer.value
    if (!offsetWidth || !offsetHeight) {
      requestAnimationFrame(tryInit)
      return
    }
    initMap()
  })
})

onBeforeUnmount(() => {
  clearMarkers()
  if (userMarkerObj) {
    userMarkerObj.remove()
    userMarkerObj = null
  }
  if (map) {
    map.remove()
    map = null
    mapLoaded = false
  }
})
</script>

<template>
  <div class="map-view-wrapper">
    <div ref="mapContainer" class="map-leaflet"></div>
    <div class="zoom-indicator">x {{ currentZoom }}</div>
    <div class="layer-switcher" @click="toggleSatellite">
      <div class="layer-preview" :class="isSatellite ? 'preview-street' : 'preview-satellite'">
        <span class="layer-label">{{ isSatellite ? 'Harita' : 'Uydu' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-view-wrapper {
  width: 100%;
  height: 100vh;
  position: relative;
  z-index: 1;
  isolation: isolate;
}

.map-leaflet {
  width: 100%;
  height: 100vh;
}

.zoom-indicator {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  backdrop-filter: blur(4px);
  pointer-events: none;
  font-family: 'Inter', monospace;
}

.layer-switcher {
  position: absolute;
  bottom: 96px;
  right: 10px;
  z-index: 10;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  width: 64px;
  height: 64px;
}

.layer-preview {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 4px;
}

.preview-satellite {
  background-image: url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/4');
}

.preview-street {
  background: linear-gradient(135deg, #b8d4e8 0%, #d4e8b8 40%, #e8e8d4 70%, #c8d8e8 100%);
}

.layer-label {
  font-size: 10px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.3px;
}
</style>

<style>
/* MapLibre popup styles */
.maplibregl-popup-content {
  background: #2b2f38 !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.maplibregl-popup-tip {
  border-top-color: #2b2f38 !important;
  border-bottom-color: #2b2f38 !important;
}

.maplibregl-popup-close-button {
  color: #ffffff !important;
  font-size: 16px;
}

.maplibregl-popup-close-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff !important;
}

.maplibregl-ctrl-group {
  background: #2b2f38 !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.maplibregl-ctrl-group button {
  color: #ffffff !important;
}

.maplibregl-ctrl-group button:hover {
  background: rgba(255, 255, 255, 0.1) !important;
}

.maplibregl-ctrl-group button + button {
  border-top: 1px solid rgba(255, 255, 255, 0.15) !important;
}

.disaster-marker {
  background: none !important;
  border: none !important;
}

.marker-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.marker-icon {
  font-size: 10px;
}

.marker-pulse .marker-dot::after {
  content: '';
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid currentColor;
  animation: marker-pulse-ring 2s ease-out infinite;
}

@keyframes marker-pulse-ring {
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

.disaster-popup {
  font-family: 'Inter', sans-serif;
  color: #ffffff;
  min-width: 200px;
}

.disaster-popup h4 {
  font-size: 0.85rem;
  font-weight: 600;
  margin-bottom: 6px;
  color: #ffffff;
}

.disaster-popup p {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
  line-height: 1.4;
}

.popup-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.82);
}

html[data-theme='light'] .maplibregl-popup-content {
  background: #f4f7ff !important;
  color: #111a2c !important;
  border: 1px solid rgba(17, 26, 44, 0.2);
}

html[data-theme='light'] .maplibregl-popup-tip {
  border-top-color: #f4f7ff !important;
  border-bottom-color: #f4f7ff !important;
}

html[data-theme='light'] .maplibregl-popup-close-button {
  color: #111a2c !important;
}

html[data-theme='light'] .disaster-popup {
  color: #111a2c;
}

html[data-theme='light'] .disaster-popup h4 {
  color: #111a2c;
}

html[data-theme='light'] .disaster-popup p {
  color: #243655;
}

html[data-theme='light'] .popup-meta {
  color: #32496f;
}
</style>
