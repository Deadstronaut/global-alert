<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useI18n } from 'vue-i18n'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()

const mapContainer = ref(null)
let map = null
let markersLayer = null

function initMap() {
  if (!mapContainer.value || map) return

  // Strict vertical bounds, infinite horizontal wraps
  const maxBounds = [
    [-90, -180],
    [90, 180],
  ]

  map = L.map(mapContainer.value, {
    center: [20, 30],
    zoom: 3,
    minZoom: 1.55,
    maxZoom: 30,
    zoomSnap: 0.1,
    zoomDelta: 0.1,
    wheelPxPerZoomLevel: 260,
    maxBounds: maxBounds,
    maxBoundsViscosity: 1.0,
    worldCopyJump: true,
    zoomControl: false,
    attributionControl: false,
  })

  // Dark tile layer
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    noWrap: false, // Allow horizontal wrap
  }).addTo(map)

  // Zoom control in custom position
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  // Markers layer group
  markersLayer = L.layerGroup().addTo(map)

  updateMarkers()
}

function updateMarkers() {
  if (!markersLayer) return
  markersLayer.clearLayers()

  const events = disasterStore.allEvents

  events.forEach((event) => {
    const color = getSeverityHex(event.severity)
    const pulseClass = event.severity === 'critical' ? 'marker-pulse' : ''

    const icon = L.divIcon({
      className: `disaster-marker ${pulseClass}`,
      html: `
        <div class="marker-dot" style="background: ${color}; box-shadow: 0 0 10px ${color};">
          <span class="marker-icon">${event.icon}</span>
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

function flyToRegion(lat, lng, zoom) {
  if (map) {
    map.flyTo([lat, lng], zoom, {
      duration: 1.5,
      easeLinearity: 0.25,
    })
  }
}

// Watch for region changes (from globe click)
watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && map) {
      flyToRegion(region.lat, region.lng, region.zoom)
    }
  },
)

// Watch for data updates
watch(
  () => disasterStore.allEvents,
  () => {
    updateMarkers()
  },
  { deep: true },
)

onMounted(() => {
  initMap()
  // Wait a tick for the container to fully expand to 100vh bounds
  setTimeout(() => {
    if (map) map.invalidateSize()
  }, 100)
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
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
  background: var(--color-bg) !important;
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
  top: -4px;
  left: -4px;
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
</style>
