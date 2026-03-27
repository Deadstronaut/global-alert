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
        0, 'rgba(0,0,0,0)',
        0.2, '#90a4ae',
        0.4, '#00e676',
        0.6, '#ffd600',
        0.8, '#ff9100',
        1.0, '#ff1744',
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
    maxZoom: 19,
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
        .setHTML(`
          <div class="disaster-popup">
            <h4>${props.count} ${t('alerts.events')}</h4>
            <p>${t('alerts.severity')}: ${String(props.maxSeverity).toUpperCase()}</p>
          </div>
        `)
        .addTo(map)
    })

    map.on('mouseenter', 'hex-fill', () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', 'hex-fill', () => { map.getCanvas().style.cursor = '' })
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
    const boundary = cellToBoundary(h3Index)
    const ring = boundary.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0])
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
  <div class="field-map-wrapper">
    <div ref="mapContainer" class="field-map-ol"></div>
  </div>
</template>

<style scoped>
.field-map-wrapper {
  width: 100%;
  height: 100vh;
  position: relative;
  z-index: 1;
  isolation: isolate;
}

.field-map-ol {
  width: 100%;
  height: 100vh;
}
</style>
