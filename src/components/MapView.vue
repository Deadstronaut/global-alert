<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { latLngToCell, cellToBoundary } from 'h3-js'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

const mapContainer = ref(null)
let map = null
let markersLayer = null
let heatmapLayer = null
let hexbinsLayer = null
let userMarker = null
let baseTileLayer = null
let wheelTargetZoom = null
let wheelAnimFrame = null
let wheelFocusLatLng = null
let wheelListener = null
let canvasRenderer = null

function getTileConfig() {
  const useDarkTiles = uiStore.highContrast || uiStore.darkMode
  return useDarkTiles
    ? {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        opts: { subdomains: 'abcd', maxZoom: 19, noWrap: false },
      }
    : {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        opts: { subdomains: 'abcd', maxZoom: 19, noWrap: false },
      }
}

function applyBaseTiles() {
  if (!map) return
  const { url, opts } = getTileConfig()
  if (baseTileLayer) {
    map.removeLayer(baseTileLayer)
  }
  baseTileLayer = L.tileLayer(url, opts).addTo(map)
}

function initMap() {
  if (!mapContainer.value || map) return

  const maxBounds = [
    [-90, -180],
    [90, 180],
  ]

  map = L.map(mapContainer.value, {
    center: [20, 30],
    zoom: 3,
    minZoom: 1.55,
    maxZoom: 30,
    zoomSnap: 0,
    zoomDelta: 0.03,
    wheelPxPerZoomLevel: 520,
    wheelDebounceTime: 16,
    zoomAnimation: true,
    zoomAnimationThreshold: 1,
    markerZoomAnimation: true,
    maxBounds: maxBounds,
    maxBoundsViscosity: 1.0,
    worldCopyJump: true,
    zoomControl: false,
    attributionControl: false,
    preferCanvas: true,
  })

  map.scrollWheelZoom.disable()

  applyBaseTiles()

  L.control.zoom({ position: 'bottomright' }).addTo(map)

  markersLayer = L.layerGroup().addTo(map)
  hexbinsLayer = L.layerGroup().addTo(map)
  canvasRenderer = L.canvas({ padding: 0.5 })
  updateMarkers()
  updateHeatmap()
  updateHexbins()
  updateUserMarker()
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

function startSmoothWheelZoom() {
  if (!map || !mapContainer.value) return

  const step = () => {
    if (!map || wheelTargetZoom === null) {
      wheelAnimFrame = null
      return
    }

    const current = map.getZoom()
    const next = current + (wheelTargetZoom - current) * 0.22
    const done = Math.abs(wheelTargetZoom - current) < 0.002
    const zoomTo = done ? wheelTargetZoom : next

    if (wheelFocusLatLng) {
      map.setZoomAround(wheelFocusLatLng, zoomTo, { animate: false })
    } else {
      map.setZoom(zoomTo, { animate: false })
    }

    if (done) {
      wheelAnimFrame = null
      return
    }

    wheelAnimFrame = requestAnimationFrame(step)
  }

  wheelListener = (event) => {
    if (!map) return
    event.preventDefault()

    const current = map.getZoom()
    const deltaZoom = -event.deltaY * 0.0025
    const min = map.getMinZoom()
    const max = map.getMaxZoom()

    if (wheelTargetZoom === null) wheelTargetZoom = current
    wheelTargetZoom = clamp(wheelTargetZoom + deltaZoom, min, max)
    wheelFocusLatLng = map.containerPointToLatLng(map.mouseEventToContainerPoint(event))

    if (!wheelAnimFrame) {
      wheelAnimFrame = requestAnimationFrame(step)
    }
  }

  mapContainer.value.addEventListener('wheel', wheelListener, { passive: false })
}

function updateHexbins() {
  if (!map || !hexbinsLayer) return

  hexbinsLayer.clearLayers()
  if (!uiStore.showHexbins) return

  const events = disasterStore.allEvents
  const h3ActiveCells = {}

  // Aggregate by H3 cell
  events.forEach((e) => {
    const h3Index = latLngToCell(e.lat, e.lng, 4)
    if (!h3ActiveCells[h3Index]) {
      h3ActiveCells[h3Index] = {
        maxSeverity: e.severity,
        events: [],
      }
    }
    const severities = ['minimal', 'low', 'moderate', 'high', 'critical']
    if (severities.indexOf(e.severity) > severities.indexOf(h3ActiveCells[h3Index].maxSeverity)) {
      h3ActiveCells[h3Index].maxSeverity = e.severity
    }
    h3ActiveCells[h3Index].events.push(e)
  })

  // Render Active Cells
  Object.entries(h3ActiveCells).forEach(([h3Index, data]) => {
    const boundary = cellToBoundary(h3Index)
    const color = getSeverityHex(data.maxSeverity)

    const polygon = L.polygon(boundary, {
      color: color,
      fillColor: color,
      fillOpacity: 0.6,
      weight: 1.5,
      opacity: 0.9,
      renderer: canvasRenderer,
      className: 'hexbin-polygon active',
    })

    polygon.bindPopup(`
      <div class="disaster-popup">
        <h4>${data.events.length} ${t('alerts.events')}</h4>
        <p>${t('alerts.severity')}: ${data.maxSeverity.toUpperCase()}</p>
      </div>
    `)

    hexbinsLayer.addLayer(polygon)
  })
}

function updateHeatmap() {
  if (!map) return

  if (heatmapLayer) {
    map.removeLayer(heatmapLayer)
    heatmapLayer = null
  }

  if (!uiStore.showHeatmap) return

  const events = disasterStore.allEvents
  const intensityMap = {
    critical: 1.0,
    high: 0.8,
    moderate: 0.6,
    low: 0.3,
    minimal: 0.1,
  }

  const heatData = events.map((event) => {
    return [event.lat, event.lng, intensityMap[event.severity] || 0.1]
  })

  // We explicitly check if L.heatLayer exists, as dynamic import is async
  if (L.heatLayer) {
    heatmapLayer = L.heatLayer(heatData, {
      radius: 50, // Massive radius for continuous regional blending
      blur: 40, // High blur to merge discrete data points into continuous clouds
      maxZoom: 6, // Prevents intense clustering locally, keeps it macroscopic
      gradient: {
        0.2: '#90a4ae', // Gray (Minimal)
        0.4: '#00e676', // Green (Low)
        0.6: '#ffd600', // Yellow (Moderate)
        0.8: '#ff9100', // Orange (High)
        1.0: '#ff1744', // Red (Critical)
      },
      minOpacity: 0.4,
    }).addTo(map)
  }
}

function updateMarkers() {
  if (!markersLayer) return
  markersLayer.clearLayers()

  if (uiStore.showHeatmap || uiStore.showHexbins) return

  const events = disasterStore.allEvents

  events.forEach((event) => {
    const color = getSeverityHex(event.severity)
    const pulseClass = event.severity === 'critical' ? 'marker-pulse' : ''

    const icon = L.divIcon({
      className: `disaster-marker ${pulseClass}`,
      html: `
        <div class="marker-dot" style="background: ${color}; box-shadow: 0 0 10px ${color}; opacity: ${uiStore.showHeatmap ? '0.4' : '1'};">
          <span class="marker-icon" style="opacity: ${uiStore.showHeatmap ? '0' : '1'};">${event.icon}</span>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    })

    const marker = L.marker([event.lat, event.lng], { icon })

    marker.bindPopup(`
      <div class="disaster-popup">
        <h4>${event.title}</h4>
        <p>${event.description}</p>
        <div class="popup-meta">
          <span>${t('alerts.source')}: ${event.source}</span>
          <span>${t('alerts.time')}: ${new Date(event.time).toLocaleString('tr-TR')}</span>
        </div>
      </div>
    `)

    markersLayer.addLayer(marker)
  })
}

function updateUserMarker() {
  if (!map) return

  if (geoStore.hasLocation) {
    const coords = [geoStore.userLat, geoStore.userLng]
    if (userMarker) {
      userMarker.setLatLng(coords)
    } else {
      const userIcon = L.divIcon({
        className: 'user-location-marker',
        html: `
          <div class="user-pin">
            <div class="pin-head"></div>
            <div class="pin-pulse"></div>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      userMarker = L.marker(coords, { icon: userIcon, zIndexOffset: 1000 }).addTo(map)
      userMarker.bindTooltip('Konumunuz', { permanent: false, direction: 'top' })
    }
  } else if (userMarker) {
    map.removeLayer(userMarker)
    userMarker = null
  }
}

function flyToRegion(lat, lng, zoom) {
  if (map) {
    map.flyTo([lat, lng], zoom, {
      duration: 1.5,
      easeLinearity: 0.25,
    })
  }
}

watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && map) {
      flyToRegion(region.lat, region.lng, region.zoom)
    }
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
    applyBaseTiles()
  },
)

onMounted(async () => {
  window.L = L
  if (!L.heatLayer) {
    await import('leaflet.heat')
  }

  initMap()
  startSmoothWheelZoom()
  setTimeout(() => {
    if (map) map.invalidateSize()
  }, 100)
})

onBeforeUnmount(() => {
  if (wheelAnimFrame) {
    cancelAnimationFrame(wheelAnimFrame)
    wheelAnimFrame = null
  }
  if (mapContainer.value && wheelListener) {
    mapContainer.value.removeEventListener('wheel', wheelListener)
    wheelListener = null
  }
  if (map) {
    map.remove()
    map = null
    baseTileLayer = null
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
  z-index: 1; /* Creates a clean stacking context */
  isolation: isolate; /* Traps high z-index elements within Leaflet */
}

.map-leaflet {
  width: 100%;
  height: 100vh;
}
</style>

<style>
/* Global marker styles (not scoped) */

/* Override default Leaflet background which normally causes the "white space" flash when zooming out */
.leaflet-container {
  background: transparent !important;
}

.leaflet-popup-content-wrapper {
  background: #2b2f38 !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.leaflet-popup-tip {
  background: #2b2f38 !important;
}

.leaflet-popup-close-button {
  color: #ffffff !important;
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

html[data-theme='light'] .leaflet-popup-content-wrapper {
  background: #f4f7ff !important;
  color: #111a2c !important;
  border: 1px solid rgba(17, 26, 44, 0.2);
}

html[data-theme='light'] .leaflet-popup-tip {
  background: #f4f7ff !important;
}

html[data-theme='light'] .leaflet-popup-close-button {
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
