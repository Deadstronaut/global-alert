<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'
import { latLngToCell, cellToBoundary, gridDisk, polygonToCells, cellToParent } from 'h3-js'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-110m.json'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

const mapContainer = ref(null)
let map = null
let mapLoaded = false
let styleLoadVersion = 0
let markerObjects = []
let userMarkerObj = null
const styleCache = {}
// 0 = Açık (liberty), 1 = Koyu (dark), 2 = Uydu
const mapStyleIndex = ref(0)
const currentZoom = ref(3)

// ── Hex heatmap helpers ──────────────────────────────────────────────────────

/** Returns true if a polygon ring crosses the antimeridian — causes MapLibre artifact lines. */
function crossesAntimeridian(ring) {
  for (let i = 0; i < ring.length - 1; i++) {
    if (Math.abs(ring[i][0] - ring[i + 1][0]) > 180) return true
  }
  return false
}

// ── Land cell sets (computed once) ───────────────────────────────────────────
let landCellsRes3 = null   // Set of H3 res3 cells covering land
let worldHexBgCache = null // GeoJSON FeatureCollection for bg grid

/** Build Set of all H3 res3 cells that cover land using world-atlas TopoJSON. */
function getLandCells() {
  if (landCellsRes3) return landCellsRes3
  landCellsRes3 = new Set()
  const landGeo = feature(landTopo, landTopo.objects.land)
  for (const f of landGeo.features) {
    const geom = f.geometry
    // MultiPolygon: iterate each sub-polygon separately (polygonToCells only accepts Polygon)
    const polygonList = geom.type === 'MultiPolygon'
      ? geom.coordinates.map(coords => ({ type: 'Polygon', coordinates: coords }))
      : [{ type: 'Polygon', coordinates: geom.coordinates }]
    for (const poly of polygonList) {
      try {
        // containmentMode 2 = overlapping: include cells that partially overlap land (better coastal coverage)
        const cells = polygonToCells(poly, 3, 2)
        for (const c of cells) landCellsRes3.add(c)
      } catch (err) {
        console.warn('[Hex] polygonToCells error, skipping polygon:', err?.message ?? err)
      }
    }
  }
  console.log(`[Hex] Land cell set built: ${landCellsRes3.size} res3 cells`)
  return landCellsRes3
}

/**
 * Returns true if an H3 res4 cell is approximately on land.
 * Uses the parent res3 cell as a fast approximation.
 */
function isOnLand(cellRes4) {
  return getLandCells().has(cellToParent(cellRes4, 3))
}

/**
 * Build background hex grid — only land cells at res3.
 * Uses polygonToCells so oceans are never included.
 */
function buildWorldHexGrid() {
  if (worldHexBgCache) return worldHexBgCache
  const landCells = getLandCells()
  const features = []
  for (const cell of landCells) {
    const boundary = cellToBoundary(cell)
    const ring = boundary.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0])
    if (crossesAntimeridian(ring)) continue
    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} })
  }
  worldHexBgCache = { type: 'FeatureCollection', features }
  return worldHexBgCache
}

/**
 * Interpolate between two RGB arrays by t ∈ [0,1]
 */
function lerpRgb(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/**
 * Map intensity (0–1) to a hex color string using heatmap gradient.
 */
function intensityToHex(intensity) {
  const stops = [
    [0.0, [144, 164, 174]],  // gray-blue (minimal)
    [0.3, [0, 230, 118]],    // green
    [0.55, [255, 214, 0]],   // yellow
    [0.75, [255, 145, 0]],   // orange
    [1.0, [255, 23, 68]],    // red (critical)
  ]
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]
    const [t1, c1] = stops[i + 1]
    if (intensity <= t1) {
      const t = (intensity - t0) / (t1 - t0)
      const [r, g, b] = lerpRgb(c0, c1, t)
      return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
    }
  }
  return '#ff1744'
}

// ─────────────────────────────────────────────────────────────────────────────

const MAP_STYLES = [
  { label: 'Koyu', url: 'https://tiles.openfreemap.org/styles/dark', preview: 'preview-dark' },
  { label: 'Uydu', url: null, preview: 'preview-satellite' },
  { label: 'Açık', url: 'https://tiles.openfreemap.org/styles/liberty', preview: 'preview-street' },
]

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

const isSatellite = computed(() => mapStyleIndex.value === 1)

function getBaseStyle() {
  const s = MAP_STYLES[mapStyleIndex.value]
  return s.url ?? ESRI_SATELLITE_STYLE
}

function cycleMapStyle() {
  mapStyleIndex.value = (mapStyleIndex.value + 1) % MAP_STYLES.length
  if (!map) return
  map.setMaxZoom(isSatellite.value ? 17.4 : 20)
  applyBaseStyle()
}

function addBuildings3D() {
  if (isSatellite.value) return
  if (map.getLayer('buildings-3d')) return
  try {
    map.addLayer({
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 15,
      paint: {
        'fill-extrusion-color': '#c8d0da',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, ['coalesce', ['get', 'render_height'], ['get', 'height'], 5]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    })
  } catch { /* source may not exist in satellite mode */ }
}

/**
 * Returns the id of the first symbol (label) layer in the current style,
 * so we can insert hex/heat layers underneath country names.
 */
function firstSymbolLayerId() {
  const layers = map.getStyle()?.layers ?? []
  return layers.find((l) => l.type === 'symbol')?.id
}

/** In dark mode, boost all label text to near-white so they're readable over hex fills. */
function brightenDarkLabels() {
  if (mapStyleIndex.value !== 0) return  // only dark style (index 0)
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    try {
      map.setPaintProperty(layer.id, 'text-color', '#e8ecf0')
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0.6)')
      map.setPaintProperty(layer.id, 'text-halo-width', 1.2)
    } catch { /* layer may not support these properties */ }
  }
}

function addSourcesAndLayers() {
  // beforeId = first label layer → our layers render below labels
  const before = firstSymbolLayerId()

  map.addSource('disaster-heat', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('disaster-hex', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('hex-world-bg', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // Background world grid — faint strokes only, adapts to map style
  const isLight = mapStyleIndex.value === 2
  map.addLayer({
    id: 'hex-bg-stroke',
    type: 'line',
    source: 'hex-world-bg',
    paint: {
      'line-color': isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.18)',
      'line-width': 0.5,
    },
    layout: { visibility: 'none' },
  }, before)

  // Disaster heatmap fill — below labels
  map.addLayer({
    id: 'hex-fill',
    type: 'fill',
    source: 'disaster-hex',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'opacity'],
    },
    layout: { visibility: 'none' },
  }, before)

  map.addLayer({
    id: 'hex-stroke',
    type: 'line',
    source: 'disaster-hex',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 1,
      'line-opacity': 0.7,
    },
    layout: { visibility: 'none' },
  }, before)

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
  }, before)

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
    brightenDarkLabels()
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
            <h4>${t('alerts.severity')}: ${String(props.maxSeverity).toUpperCase()}</h4>
            <p>Yoğunluk: ${Math.round((props.intensity ?? 0) * 100)}%</p>
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
  const vis = showHex ? 'visible' : 'none'
  map.setLayoutProperty('hex-fill', 'visibility', vis)
  map.setLayoutProperty('hex-stroke', 'visibility', vis)
  map.setLayoutProperty('hex-bg-stroke', 'visibility', vis)

  if (!showHex) return

  // ── 1. Background grid — only land cells at res3, built once ────────────
  if (!worldHexBgCache) {
    // Build off the hot path so UI doesn't freeze
    setTimeout(() => {
      if (!map) return
      map.getSource('hex-world-bg')?.setData(buildWorldHexGrid())
    }, 0)
  } else {
    map.getSource('hex-world-bg')?.setData(worldHexBgCache)
  }

  // ── 2. Build intensity map with spreading (gridDisk) ─────────────────────
  // Land cell set must be ready — build it (blocks briefly once) then re-run
  if (!landCellsRes3) {
    setTimeout(() => { getLandCells(); updateHexbins() }, 0)
    return
  }

  const HEX_RES = 4
  const severityWeight = { critical: 1.0, high: 0.75, moderate: 0.5, low: 0.25, minimal: 0.1 }
  const intensityMap = {}

  for (const e of disasterStore.allEvents) {
    const center = latLngToCell(e.lat, e.lng, HEX_RES)
    const weight = severityWeight[e.severity] ?? 0.1

    // Ring 0 = full weight, ring 1 = 50%, ring 2 = 20%
    const decay = [1.0, 0.5, 0.2]
    for (let ring = 0; ring <= 2; ring++) {
      const inner = ring > 0 ? new Set(gridDisk(center, ring - 1)) : null
      for (const neighbor of gridDisk(center, ring).filter(c => !inner || !inner.has(c))) {
        intensityMap[neighbor] = Math.min(1.0, (intensityMap[neighbor] ?? 0) + weight * decay[ring])
      }
    }
  }

  // ── 3. Build GeoJSON features for colored cells ───────────────────────────
  const features = Object.entries(intensityMap).flatMap(([h3Index, intensity]) => {
    const boundary = cellToBoundary(h3Index)
    const ring = boundary.map(([lat, lng]) => [lng, lat])
    ring.push(ring[0])
    if (crossesAntimeridian(ring)) return []  // skip antimeridian artifact cells
    return [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        color: intensityToHex(intensity),
        opacity: Math.min(0.55, 0.12 + intensity * 0.43),
        intensity,
        count: 1,
        maxSeverity: intensity >= 0.75 ? 'critical' : intensity >= 0.5 ? 'high' : intensity >= 0.3 ? 'moderate' : 'low',
      },
    }]
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

async function resolveStyle() {
  const s = MAP_STYLES[mapStyleIndex.value]
  if (!s.url) return ESRI_SATELLITE_STYLE
  if (styleCache[s.url]) return styleCache[s.url]
  const res = await fetch(s.url)
  const json = await res.json()
  styleCache[s.url] = json
  return json
}

async function applyBaseStyle() {
  if (!map) return
  mapLoaded = false
  const version = ++styleLoadVersion

  let style
  try {
    style = await resolveStyle()
  } catch (e) {
    console.warn('[MapView] Failed to fetch style:', e)
    mapLoaded = true
    return
  }
  if (version !== styleLoadVersion) return // superseded while fetching

  map.setStyle(style)

  function onStyleReady() {
    if (version !== styleLoadVersion || mapLoaded) return
    mapLoaded = true
    addSourcesAndLayers()
    brightenDarkLabels()
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()
  }

  // Fallback: inline style objects (e.g. satellite) may not fire style.load
  const fallbackTimer = setTimeout(onStyleReady, 800)

  map.once('style.load', () => {
    clearTimeout(fallbackTimer)
    onStyleReady()
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
)

watch(
  () => uiStore.mapMode,
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

// Dark/light mode UI değişikliği harita stilini ETKİLEMEZ
// Harita stili sadece layer switcher butonuyla değişir

// ── Keyboard shortcuts: 1=Normal 2=Hexagon 3=Heatmap ────────────────────────
const MODES = ['normal', 'hexagon', 'heatmap']

function handleMapModeKey(e) {
  // Ignore when user is typing in an input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
  if (e.key === '1') uiStore.mapMode = 'normal'
  else if (e.key === '2') uiStore.mapMode = 'hexagon'
  else if (e.key === '3') uiStore.mapMode = 'heatmap'
  else if (e.key === 'Tab') {
    e.preventDefault()
    const idx = MODES.indexOf(uiStore.mapMode)
    uiStore.mapMode = MODES[(idx + 1) % MODES.length]
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleMapModeKey)
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
  window.removeEventListener('keydown', handleMapModeKey)
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

    <!-- Heatmap legend -->
    <div v-if="uiStore.showHeatmap" class="map-legend" :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }">
      <div class="legend-title">Yoğunluk</div>
      <div class="legend-gradient heat-gradient"></div>
      <div class="legend-labels">
        <span>Düşük</span>
        <span>Yüksek</span>
      </div>
    </div>

    <!-- Hexbin / marker severity legend -->
    <div v-else-if="uiStore.showHexbins || (!uiStore.showHeatmap && !uiStore.showHexbins)" class="map-legend" :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }">
      <div class="legend-title">Şiddet</div>
      <div class="legend-severity-rows">
        <div class="sev-row"><span class="sev-dot" style="background:#4ade80"></span><span>Minimal</span></div>
        <div class="sev-row"><span class="sev-dot" style="background:#fbbf24"></span><span>Düşük</span></div>
        <div class="sev-row"><span class="sev-dot" style="background:#f97316"></span><span>Orta</span></div>
        <div class="sev-row"><span class="sev-dot" style="background:#ef4444"></span><span>Yüksek</span></div>
        <div class="sev-row"><span class="sev-dot" style="background:#7c3aed"></span><span>Kritik</span></div>
      </div>
    </div>

    <div class="layer-switcher" @click="cycleMapStyle">
      <div class="layer-preview" :class="MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].preview">
        <span class="layer-label">{{ MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].label }}</span>
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

:deep(.maplibregl-ctrl-bottom-right) {
  right: 10px;
  bottom: 12px;
}

:deep(.maplibregl-ctrl-group) {
  background: rgba(20, 24, 33, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

:deep(.maplibregl-ctrl-group button) {
  color: #ffffff;
  background: transparent;
}

:deep(.maplibregl-ctrl-group button:hover) {
  background: rgba(255, 255, 255, 0.08);
}

:deep(.maplibregl-ctrl-group button span) {
  color: #ffffff;
}

:deep(.maplibregl-ctrl-zoom-in .maplibregl-ctrl-icon),
:deep(.maplibregl-ctrl-zoom-out .maplibregl-ctrl-icon) {
  filter: brightness(0) invert(1);
  opacity: 1;
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

.preview-dark {
  background: linear-gradient(135deg, #1a2030 0%, #252d3a 50%, #1e2535 100%);
}

.layer-label {
  font-size: 10px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.3px;
}

/* ── Map Legend ── */
.map-legend {
  position: fixed;
  bottom: 32px;
  left: calc(var(--sidebar-width, 280px) + 12px);
  transition: left 0.35s ease;
  z-index: 10;
  background: rgba(20, 24, 33, 0.82);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 110px;
  pointer-events: none;
}

.map-legend.legend-sidebar-collapsed {
  left: calc(var(--sidebar-collapsed, 56px) + 12px);
}

.legend-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 6px;
}

.legend-gradient {
  width: 100%;
  height: 10px;
  border-radius: 4px;
  margin-bottom: 4px;
}

.heat-gradient {
  background: linear-gradient(to right, #90a4ae, #00e676, #ffd600, #ff9100, #ff1744);
}

.legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  color: rgba(255, 255, 255, 0.5);
}

.legend-severity-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sev-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.8);
}

.sev-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
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
