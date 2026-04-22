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

function getBaseStyle() {
  if (uiStore.highContrast || uiStore.darkMode) {
    return 'https://tiles.openfreemap.org/styles/dark'
  }
  return 'https://tiles.openfreemap.org/styles/liberty'
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

function formatPopupDetails(event) {
  const details = []
  if (event.lat != null && event.lng != null) {
    details.push(
      `<span><b>Konum:</b> ${Number(event.lat).toFixed(2)}, ${Number(event.lng).toFixed(2)}</span>`,
    )
  }
  if (event.magnitude != null && event.magnitude !== '' && !isNaN(event.magnitude)) {
    details.push(`<span><b>Büyüklük:</b> M${Number(event.magnitude).toFixed(1)}</span>`)
  }
  if (event.depth != null && event.depth !== '' && !isNaN(event.depth)) {
    details.push(`<span><b>Derinlik:</b> ${Math.round(Number(event.depth))} km</span>`)
  }
  return details.join('')
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16) || 0
  const g = parseInt(h.substring(2, 4), 16) || 0
  const b = parseInt(h.substring(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function updateMarkers() {
  if (!map || !mapLoaded) return
  clearMarkers()

  if (uiStore.showHeatmap || uiStore.showHexbins) return

  disasterStore.allEvents.slice(0, 2500).forEach((event) => {
    const color = getSeverityHex(event.severity)
    const rgbaColor = hexToRgba(color, 0.5)
    const isPulse = event.severity === 'critical'

    const el = document.createElement('div')
    el.className = `disaster-marker${isPulse ? ' marker-pulse' : ''}`
    el.innerHTML = `
      <div class="marker-dot" style="background:${color};box-shadow:0 0 10px ${color};">
        <span class="marker-icon">${event.icon}</span>
      </div>
    `

    const typeText = t(`disasters.${event.type}`) || event.type

    const popup = new maplibregl.Popup({ offset: 12, className: 'modern-popup-container' }).setHTML(
      `
      <div class="disaster-popup-modern" style="--severity-color: ${color}; --severity-rgba: ${rgbaColor};">
        <div class="popup-header">
          <span class="chip type-chip" style="background: ${color}; color: #000;">${typeText.toUpperCase()}</span>
        </div>
        <div class="popup-body">
          <h4 class="popup-title">${event.title}</h4>
          ${event.description && event.description !== '-' ? `<p class="popup-desc">${event.description}</p>` : ''}
          <div class="popup-metrics">
            ${formatPopupDetails(event)}
          </div>
        </div>
        <div class="popup-footer">
          <span class="popup-date">${new Date(event.time).toLocaleString('tr-TR')}</span>
          <span class="chip source-chip">${event.source || 'Bilinmiyor'}</span>
        </div>
      </div>
    `,
    )

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
</style>

<style>
/* Modern MapLibre Popup overrides */
.modern-popup-container .maplibregl-popup-content {
  background: transparent !important;
  padding: 0 !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 8px;
}

.modern-popup-container .maplibregl-popup-tip {
  border-top-color: var(--severity-color, #13161c) !important;
  border-bottom-color: var(--severity-color, #13161c) !important;
  opacity: 0.8;
  z-index: 10;
  position: relative;
}

.modern-popup-container .maplibregl-popup-close-button {
  color: #ffffff !important;
  font-size: 18px;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.3);
  transition: all 0.2s;
  z-index: 100;
}

.modern-popup-container .maplibregl-popup-close-button:hover {
  background: rgba(255, 255, 255, 0.2) !important;
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

/* Redesigned Card */
.disaster-popup-modern {
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: 'Inter', 'Segoe UI', sans-serif;
  color: #fff;
  min-width: 270px;
  max-width: 320px;
  background: #11141a;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--severity-color);
  box-shadow:
    inset 0 0 24px var(--severity-rgba),
    0 8px 32px rgba(0, 0, 0, 0.6);
  position: relative;
  z-index: 20;
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 24px; /* for close button */
}

.chip {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.5px;
}

.type-chip {
  font-weight: 800;
}

.severity-chip {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid transparent;
}

.source-chip {
  background: rgba(255, 255, 255, 0.1);
  color: #c4c4c4;
  border-radius: 12px;
  padding: 3px 8px;
  font-size: 9px;
  font-weight: 600;
}

.popup-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popup-title {
  font-size: 13.5px;
  font-weight: 600;
  margin: 0;
  color: #ffffff;
  line-height: 1.4;
  letter-spacing: 0.2px;
}

.popup-desc {
  font-size: 12px;
  color: #b0bac5;
  margin: 0;
  line-height: 1.45;
}

.popup-metrics {
  display: flex;
  flex-wrap: wrap;
  column-gap: 14px;
  row-gap: 8px;
  font-size: 11px;
  color: #a0aaba;
  background: rgba(0, 0, 0, 0.25);
  padding: 8px 10px;
  border-radius: 6px;
  margin-top: 4px;
}

.popup-metrics span b {
  color: #e2e8f0;
  font-weight: 600;
}

.popup-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 10px;
  margin-top: 4px;
}

.popup-date {
  font-size: 11px;
  color: #8c97a8;
  font-weight: 500;
}

html[data-theme='light'] .disaster-popup-modern {
  background: #ffffff;
  color: #111a2c;
  box-shadow:
    inset 0 0 24px var(--severity-rgba),
    0 8px 32px rgba(0, 0, 0, 0.15);
}

html[data-theme='light'] .modern-popup-container .maplibregl-popup-close-button {
  color: #111a2c !important;
  background: rgba(0, 0, 0, 0.05);
}

html[data-theme='light'] .popup-title {
  color: #111a2c;
}

html[data-theme='light'] .popup-desc,
html[data-theme='light'] .popup-date {
  color: #4a5568;
}

html[data-theme='light'] .popup-metrics {
  background: rgba(0, 0, 0, 0.03);
  color: #334155;
}

html[data-theme='light'] .popup-metrics span b {
  color: #0f172a;
}

html[data-theme='light'] .popup-footer {
  border-top: 1px solid rgba(0, 0, 0, 0.05);
}

html[data-theme='light'] .source-chip {
  background: rgba(0, 0, 0, 0.05);
  color: #475569;
}
</style>
