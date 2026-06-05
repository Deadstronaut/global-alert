<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import { numericToAlpha2 } from '@/data/isoMapping.js'
import { getSeverityHex, getDisasterIcon } from '@/services/adapters/DisasterEvent.js'
import { polygonToCells, cellToParent, getResolution, latLngToCell } from 'h3-js'
import HexWorker from '@/workers/hexWorker.js?worker'
import { feature } from 'topojson-client'
import landTopo from 'world-atlas/land-10m.json'
import countriesTopo from 'world-atlas/countries-10m.json'
import { CUSTOM_TERRITORIES } from '@/data/customTerritories.js'
import { COUNTRY_NAMES } from '@/data/countryNames.js'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * Fixes antimeridian wrapping and winding order for GeoJSON features.
 * Prevents horizontal line artifacts (common in Russia/Fiji) and polygon gaps.
 */
function fixGeometry(geojson) {
  if (!geojson) return geojson

  const processFeature = (f) => {
    if (!f.geometry) return f
    const geom = f.geometry

    if (geom.type === 'Polygon') {
      geom.coordinates = geom.coordinates.map((ring) => fixRing(ring))
    } else if (geom.type === 'MultiPolygon') {
      geom.coordinates = geom.coordinates.map((poly) => poly.map((ring) => fixRing(ring)))
    }
    return f
  }

  const fixRing = (ring) => {
    if (!ring || ring.length < 3) return ring
    let lastLng = ring[0][0]
    const newRing = [ring[0]]

    for (let i = 1; i < ring.length; i++) {
      let lng = ring[i][0]
      const lat = ring[i][1]

      // Detect wrap-around jumps (> 180 degrees)
      if (lng - lastLng > 180) lng -= 360
      else if (lng - lastLng < -180) lng += 360

      newRing.push([lng, lat])
      lastLng = lng
    }

    // Ensure ring is closed and has minimal valid geometry
    if (newRing.length > 2) {
      const last = newRing[newRing.length - 1]
      const first = newRing[0]
      if (last[0] !== first[0] || last[1] !== first[1]) {
        newRing.push([first[0], first[1]])
      }
    }
    return newRing
  }

  if (geojson.type === 'FeatureCollection') {
    return { ...geojson, features: geojson.features.map(processFeature) }
  } else if (geojson.type === 'Feature') {
    return processFeature(geojson)
  }
  return geojson
}

const { t } = useI18n()
const router = useRouter()
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
let hexWorker = null
let interactionsSetUp = false

// ── Static Mesh cache: resolution → Feature[] ────────────────────────────────
const hexGridCache = new Map()

// Resolution stored in DB via backfill (res 7)
const DB_HEX_RES = 7

const SEVERITY_COLOR = {
  critical: '#7c3aed',
  high: '#ef4444',
  moderate: '#f97316',
  low: '#fbbf24',
  minimal: '#4ade80',
}
const SEVERITY_OPACITY = { critical: 0.72, high: 0.58, moderate: 0.42, low: 0.28, minimal: 0.18 }
const SEV_ORDER = ['minimal', 'low', 'moderate', 'high', 'critical']

// Country focus state
let selectedCountryBounds = null // LngLatBounds of selected country
let countryHexRes = null // resolution of country grid features
let countryHexFeatures = null // raw Feature[] from FILL_GRID (geometry only, for re-injection)

// 0 = Açık (liberty), 1 = Koyu (dark), 2 = Uydu
const mapStyleIndex = ref(0)
const currentZoom = ref(3)

// ── Country interaction state ────────────────────────────────────────────────
let hoveredFeatureId = null
let selectedFeatureId = null
let hoveredFeatureSource = 'world-countries'
let selectedFeatureSource = 'world-countries'
const hoveredCountryName = ref(null)
const selectedCountryName = ref(null)
const _symbolFilterCache = new Map()
// Pre-compute all country features once for geometry lookups
const _allCountryFeatures = [
  ...feature(countriesTopo, countriesTopo.objects.countries).features.map((f) => ({
    ...f,
    source: 'world-countries',
  })),
  ...CUSTOM_TERRITORIES.features.map((f) => ({ ...f, source: 'custom-territories' })),
]

// Each step = ~1.5 zoom levels = ~3× magnification → each hex splits into 7 children (H3 hierarchy)
function hexResForZoom(z) {
  if (z < 5)  return 3  // dünya / kıta
  if (z < 7)  return 4  // ülke
  if (z < 9)  return 5  // bölge
  return 6              // zoom 9+ donuk (şehir seviyesi)
}
const currentHexRes = computed(() => hexResForZoom(currentZoom.value))

watch(currentHexRes, (newRes) => {
  if (!mapLoaded) return
  // Clear cached grid for new resolution so worker recomputes
  hexGridCache.delete(newRes)
  updateHexbins()

  // Refresh country hex grid at new resolution if a country is selected
  if (selectedFeatureId && hexWorker) {
    const f = _allCountryFeatures.find((cf) => cf.id === selectedFeatureId)
    if (f) {
      const gridRes = Math.min(newRes, 6)
      countryHexRes = gridRes + 1
      hexWorker.postMessage({ type: 'FILL_GRID', geometry: f.geometry, resolution: gridRes })
    }
  }
})

watch(
  () => currentZoom.value,
  (newZoom, oldZoom) => {
    // Only re-run marker update if crossing the threshold (8)
    if ((oldZoom < 8 && newZoom >= 8) || (oldZoom >= 8 && newZoom < 8)) {
      updateMarkers()
    }
  },
)

// ── Static Mesh + Dynamic Signal helpers ─────────────────────────────────────

/**
 * Build a signal map keyed at min(displayRes, DB_HEX_RES).
 * Returns { sigMap, sigRes } where sigRes is the effective key resolution.
 */
function buildSignalMap(displayRes) {
  const sigRes = Math.min(displayRes, DB_HEX_RES)
  const sigMap = new Map()
  for (const ev of disasterStore.h3Events) {
    // Resolve h3_id: use stored value or compute from coordinates
    let h3id = ev.h3_id
    if (!h3id && ev.lat != null && ev.lng != null) {
      try {
        h3id = latLngToCell(Number(ev.lat), Number(ev.lng), DB_HEX_RES)
      } catch {
        continue
      }
    }
    if (!h3id) continue

    let key = h3id
    try {
      const evRes = getResolution(h3id)
      if (evRes > sigRes) key = cellToParent(h3id, sigRes)
      else if (evRes < sigRes) continue
    } catch {
      continue
    }

    const ex = sigMap.get(key)
    if (!ex) {
      sigMap.set(key, { count: ev.count || 1, maxSeverity: ev.maxSeverity || 'minimal' })
    } else {
      ex.count += ev.count || 1
      if (SEV_ORDER.indexOf(ev.maxSeverity) > SEV_ORDER.indexOf(ex.maxSeverity))
        ex.maxSeverity = ev.maxSeverity
    }
  }
  return { sigMap, sigRes }
}

/** Inject event signal colors into the cached viewport grid → update disaster-hex source. */
function applySignalToGrid() {
  if (!map || !mapLoaded) return
  const res = currentHexRes.value
  const cached = hexGridCache.get(res)
  if (!cached?.length) return

  const { sigMap, sigRes } = buildSignalMap(res)

  const features = []
  for (const f of cached) {
    let lookupId = f.properties.h3_id
    if (res > sigRes) {
      try {
        lookupId = cellToParent(f.properties.h3_id, sigRes)
      } catch {
        continue
      }
    }
    const sig = sigMap.get(lookupId)
    if (!sig) continue
    features.push({
      ...f,
      properties: {
        ...f.properties,
        color: SEVERITY_COLOR[sig.maxSeverity] || '#4ade80',
        opacity: SEVERITY_OPACITY[sig.maxSeverity] || 0.18,
        eventCount: sig.count,
        maxSeverity: sig.maxSeverity,
      },
    })
  }
  map.getSource('disaster-hex')?.setData({ type: 'FeatureCollection', features })
}

/** Inject signal colors into country grid features and update country-hex-grid source. */
function applySignalToCountryGrid(features) {
  if (!map || !mapLoaded || countryHexRes == null) return
  countryHexFeatures = features // cache raw geometry for future re-injection

  const { sigMap, sigRes } = buildSignalMap(countryHexRes)

  const colored = features.map((f) => {
    let lookupId = f.properties.h3_id
    if (countryHexRes > sigRes) {
      try {
        lookupId = cellToParent(f.properties.h3_id, sigRes)
      } catch {
        return f
      }
    }
    const sig = sigMap.get(lookupId)
    if (!sig) return f
    return {
      ...f,
      properties: {
        ...f.properties,
        color: SEVERITY_COLOR[sig.maxSeverity] || '#4ade80',
        opacity: SEVERITY_OPACITY[sig.maxSeverity] || 0.04,
        eventCount: sig.count,
        maxSeverity: sig.maxSeverity,
      },
    }
  })

  map.getSource('country-hex-grid')?.setData({ type: 'FeatureCollection', features: colored })
}

// ── Land cell sets (computed once) ───────────────────────────────────────────
let landCellsRes3 = null // Set of H3 res3 cells covering land

/** Build Set of all H3 res3 cells that cover land using world-atlas TopoJSON. */
function getLandCells() {
  if (landCellsRes3) return landCellsRes3
  landCellsRes3 = new Set()
  const landGeo = feature(landTopo, landTopo.objects.land)
  for (const f of landGeo.features) {
    const geom = f.geometry
    // MultiPolygon: iterate each sub-polygon separately (polygonToCells only accepts Polygon)
    const polygonList =
      geom.type === 'MultiPolygon'
        ? geom.coordinates.map((coords) => ({ type: 'Polygon', coordinates: coords }))
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
        'fill-extrusion-height': [
          'interpolate',
          ['linear'],
          ['zoom'],
          15,
          0,
          16,
          ['coalesce', ['get', 'render_height'], ['get', 'height'], 5],
        ],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    })
  } catch {
    /* source may not exist in satellite mode */
  }
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
  if (mapStyleIndex.value !== 0) return // only dark style (index 0)
  const layers = map.getStyle()?.layers ?? []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    try {
      map.setPaintProperty(layer.id, 'text-color', '#e8ecf0')
      map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(0,0,0,0.6)')
      map.setPaintProperty(layer.id, 'text-halo-width', 1.2)
    } catch {
      /* layer may not support these properties */
    }
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

  map.addSource('country-hex-grid', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addSource('world-countries', {
    type: 'geojson',
    data: fixGeometry(feature(countriesTopo, countriesTopo.objects.countries)),
  })

  map.addSource('custom-territories', {
    type: 'geojson',
    data: fixGeometry(CUSTOM_TERRITORIES),
  })

  // Background world grid — faint strokes only, adapts to map style
  const isLight = mapStyleIndex.value === 2
  map.addLayer(
    {
      id: 'hex-bg-stroke',
      type: 'line',
      source: 'hex-world-bg',
      paint: {
        'line-color': isLight ? 'rgba(30,30,30,0.18)' : 'rgba(255,255,255,0.18)',
        'line-width': 0.5,
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0.25, 12, 0.1],
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  // Country fills (invisible, for interaction — moved to top after all layers)
  map.addLayer(
    {
      id: 'country-fills',
      type: 'fill',
      source: 'world-countries',
      paint: {
        'fill-color': 'rgba(255, 255, 255, 0)',
      },
    },
    before,
  )

  // Hover fill — white highlight
  map.addLayer(
    {
      id: 'countries-hover-fill',
      type: 'fill',
      source: 'world-countries',
      paint: {
        'fill-color': '#ffffff',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.08, 0],
      },
    },
    before,
  )

  // Selected country hex grid — data-driven: shows signal colors when events exist
  map.addLayer(
    {
      id: 'country-hex-fill',
      type: 'fill',
      source: 'country-hex-grid',
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#4ade80'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.04],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'country-hex-stroke',
      type: 'line',
      source: 'country-hex-grid',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#4ade80'],
        'line-width': 0.6,
        'line-opacity': 0.35,
      },
    },
    before,
  )

  // Selected country highlight
  map.addLayer(
    {
      id: 'country-selected',
      type: 'fill',
      source: 'world-countries',
      paint: {
        'fill-color': '#4ade80',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.18, 0],
      },
    },
    before,
  )

  // Global country borders - green lines
  map.addLayer(
    {
      id: 'country-borders',
      type: 'line',
      source: 'world-countries',
      paint: {
        'line-color': '#4ade80',
        'line-width': 1.2,
        'line-opacity': 0.4,
      },
    },
    before,
  )

  // Custom territories interaction layers
  map.addLayer(
    {
      id: 'custom-territories-fills',
      type: 'fill',
      source: 'custom-territories',
      paint: { 'fill-color': 'rgba(255, 255, 255, 0)' },
    },
    before,
  )
  map.addLayer(
    {
      id: 'custom-hover-fill',
      type: 'fill',
      source: 'custom-territories',
      paint: {
        'fill-color': '#ffffff',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.08, 0],
      },
    },
    before,
  )
  map.addLayer(
    {
      id: 'custom-selected-fill',
      type: 'fill',
      source: 'custom-territories',
      paint: {
        'fill-color': '#4ade80',
        'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.18, 0],
      },
    },
    before,
  )
  map.addLayer({
    id: 'custom-dim',
    type: 'fill',
    source: 'custom-territories',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'dimmed'], false], 0.55, 0],
    },
  })

  // Disaster heatmap fill — below labels
  map.addLayer(
    {
      id: 'hex-fill',
      type: 'fill',
      source: 'disaster-hex',
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': ['get', 'opacity'],
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  map.addLayer(
    {
      id: 'hex-stroke',
      type: 'line',
      source: 'disaster-hex',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1,
        'line-opacity': 0.7,
      },
      layout: { visibility: 'none' },
    },
    before,
  )

  map.addLayer(
    {
      id: 'heat-layer',
      type: 'heatmap',
      source: 'disaster-heat',
      paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 60],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
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
    },
    before,
  )

  // Dim overlay for non-selected countries — no `before` so it renders above symbol layers
  map.addLayer({
    id: 'country-dim',
    type: 'fill',
    source: 'world-countries',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': ['case', ['boolean', ['feature-state', 'dimmed'], false], 0.55, 0],
    },
  })

  // interaction layers must be at absolute top to capture all mouse/click events
  map.moveLayer('country-fills')
  map.moveLayer('custom-territories-fills')

  addBuildings3D()
}

// ── Country label filtering: show only selected country's labels ─────────────
function setFocusMode(active, featureGeoJSON = null) {
  if (!map || !mapLoaded) return
  const layers = map.getStyle()?.layers ?? []
  if (active && featureGeoJSON) {
    _symbolFilterCache.clear()
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue
      try {
        const orig = map.getFilter(layer.id)
        _symbolFilterCache.set(layer.id, orig ?? null)
        map.setFilter(
          layer.id,
          orig ? ['all', orig, ['within', featureGeoJSON]] : ['within', featureGeoJSON],
        )
      } catch {
        /* */
      }
    }
  } else {
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue
      try {
        if (_symbolFilterCache.has(layer.id))
          map.setFilter(layer.id, _symbolFilterCache.get(layer.id))
      } catch {
        /* */
      }
    }
    _symbolFilterCache.clear()
    brightenDarkLabels()
  }
}

function zoomToCountry(f) {
  if (!map || !mapLoaded) return
  const fid = f.id

  // Get full feature geometry
  const fullFeature = _allCountryFeatures.find((cf) => String(cf.id) === String(fid)) ?? f
  const geom = fullFeature.geometry
  if (!geom) return

  const bounds = new maplibregl.LngLatBounds()
  const processCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      bounds.extend(coords)
    } else {
      coords.forEach(processCoords)
    }
  }
  processCoords(geom.coordinates)

  if (bounds.isEmpty()) return

  // Always fly to bounds
  const cameraOptions = map.cameraForBounds(bounds, {
    padding: { top: 100, bottom: 100, left: 100, right: 100 },
    maxZoom: 6,
  })

  if (cameraOptions) {
    map.flyTo({
      ...cameraOptions,
      duration: 3500,
      curve: 2.0,
      speed: 0.5,
      pitch: 15,
      bearing: -5,
      essential: true,
    })
  }
}

function selectCountry(f) {
  if (!map || !mapLoaded) return
  const fid = f.id
  const source = f.layer?.source || f.source || 'world-countries'
  if (fid == null) return

  const alreadySelected = selectedFeatureId === fid && selectedFeatureSource === source

  // Get full feature geometry
  const fullFeature = _allCountryFeatures.find((cf) => String(cf.id) === String(fid)) ?? f
  const geom = fullFeature.geometry
  if (!geom) {
    console.warn('[Map] No geometry for feature:', fid)
    return
  }

  const bounds = new maplibregl.LngLatBounds()
  const processCoords = (coords) => {
    if (typeof coords[0] === 'number') {
      bounds.extend(coords)
    } else {
      coords.forEach(processCoords)
    }
  }
  processCoords(geom.coordinates)

  if (bounds.isEmpty()) return
  selectedCountryBounds = bounds

  // We do not flyTo here anymore. Single click only selects the country and shows hexes.
  // Double click handles the zoom/flyTo (in zoomToCountry).
  // Visual state only needs updating when selecting a different country
  if (alreadySelected) return

  uiStore.mapMode = 'hexagon'

  if (selectedFeatureId !== null) {
    map.setFeatureState(
      { source: selectedFeatureSource, id: selectedFeatureId },
      { selected: false, dimmed: false },
    )
  }

  selectedFeatureId = fid
  selectedFeatureSource = source

  if (source === 'custom-territories') {
    selectedCountryName.value = f.properties?.name || f.id
  } else {
    const nameKey = String(fid).padStart(3, '0')
    selectedCountryName.value = COUNTRY_NAMES[nameKey] ?? `#${fid}`
    const alpha2 = numericToAlpha2(fid)
    if (alpha2) router.push(`/${alpha2}`)
  }

  map.setFeatureState({ source, id: fid }, { selected: true, dimmed: false })

  if (hexWorker) {
    const gridRes = Math.min(currentHexRes.value, 8)
    countryHexRes = gridRes + 1
    hexWorker.postMessage({
      type: 'FILL_GRID',
      geometry: geom,
      resolution: gridRes,
    })
  }

  _allCountryFeatures.forEach((cf) => {
    if (cf.id != null && cf.id !== fid) {
      map.setFeatureState({ source: cf.source, id: cf.id }, { dimmed: true })
    }
  })

  setFocusMode(true, fullFeature)
}

function clearCountrySelection() {
  selectedCountryName.value = null
  selectedCountryBounds = null
  countryHexRes = null
  countryHexFeatures = null
  uiStore.mapMode = 'normal'
  if (!map || !mapLoaded) return

  map.getSource('country-hex-grid')?.setData({ type: 'FeatureCollection', features: [] })

  if (selectedFeatureId !== null) {
    map.setFeatureState(
      { source: selectedFeatureSource, id: selectedFeatureId },
      { selected: false },
    )
  }
  selectedFeatureId = null
  _allCountryFeatures.forEach((cf) => {
    if (cf.id != null) {
      map.setFeatureState({ source: cf.source, id: cf.id }, { dimmed: false })
    }
  })
  setFocusMode(false)

  // Restore full heatmap
  updateHeatmap()

  router.push('/')
}

function initMap() {
  if (!mapContainer.value || map) return

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: getBaseStyle(),
    center: [30, 20],
    maxZoom: 20,
    attributionControl: false,
    doubleClickZoom: false, // Disable default so we can handle it for zoom-to-fit
    preserveDrawingBuffer: true, // PNG download için gerekli
  })

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')

  map.on('error', (e) => {
    console.error('[MapLibre] Error:', e.error)
  })

  let _hexZoomTimer = null
  map.on('zoom', () => {
    currentZoom.value = Math.round(map.getZoom() * 10) / 10
    // Debounced viewport hex refresh during scroll (150ms after last scroll tick)
    if (uiStore.mapMode === 'hexagon') {
      clearTimeout(_hexZoomTimer)
      _hexZoomTimer = setTimeout(() => {
        hexGridCache.delete(currentHexRes.value)
        updateViewportGrid()
      }, 150)
    }
  })

  map.on('load', () => {
    mapLoaded = true
    addSourcesAndLayers()
    brightenDarkLabels()
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    updateUserMarker()

    setupMapInteractions()

    // Viewport grid refresh after pan or zoom ends (clear cache so new bounds are used)
    map.on('moveend', () => {
      if (uiStore.mapMode === 'hexagon') {
        clearTimeout(_hexZoomTimer)
        hexGridCache.delete(currentHexRes.value)
        updateViewportGrid()
      }
    })
  })
}

function setupMapInteractions() {
  if (!map || interactionsSetUp) return
  interactionsSetUp = true

  const interactionLayers = ['country-fills', 'custom-territories-fills']

  // ── Country hover tracking ──
  map.on('mousemove', interactionLayers, (e) => {
    if (!e.features?.length) return
    const f = e.features[0]
    const source = f.source

    if (
      hoveredFeatureId !== null &&
      (hoveredFeatureId !== f.id || hoveredFeatureSource !== source)
    ) {
      map.setFeatureState({ source: hoveredFeatureSource, id: hoveredFeatureId }, { hover: false })
    }

    hoveredFeatureId = f.id
    hoveredFeatureSource = source
    map.setFeatureState({ source, id: f.id }, { hover: true })

    if (source === 'custom-territories') {
      hoveredCountryName.value = f.properties.name || f.id
    } else {
      hoveredCountryName.value = COUNTRY_NAMES[String(f.id).padStart(3, '0')] ?? null
    }
    map.getCanvas().style.cursor = 'default'
  })

  map.on('mouseleave', interactionLayers, () => {
    if (hoveredFeatureId !== null) {
      map.setFeatureState({ source: hoveredFeatureSource, id: hoveredFeatureId }, { hover: false })
    }
    hoveredFeatureId = null
    hoveredCountryName.value = null
    map.getCanvas().style.cursor = ''
  })

  // ── Single-click: select country ──
  map.on('click', interactionLayers, (e) => {
    // Don't trigger country select if clicking on an event hex popup target
    const hexFeats = map.queryRenderedFeatures(e.point, { layers: ['hex-fill'] })
    if (hexFeats.length > 0) return

    if (e.features.length > 0) {
      selectCountry(e.features[0])
    }
  })

  // ── Empty click: clear selection ──
  map.on('click', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: interactionLayers })
    const hexFeats = map.queryRenderedFeatures(e.point, { layers: ['hex-fill'] })
    if (features.length === 0 && hexFeats.length === 0) {
      clearCountrySelection()
    }
  })

  // ── Double-click on country → zoom to fit, empty area → zoom in ──
  map.on('dblclick', interactionLayers, (e) => {
    e.preventDefault()
    if (e.features.length > 0) {
      zoomToCountry(e.features[0])
    }
  })

  map.on('dblclick', (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: interactionLayers })
    if (features.length === 0) {
      map.zoomIn({ around: e.lngLat })
    }
  })

  // Hex-fill click handling
  map.on('click', 'hex-fill', (e) => {
    if (!e.features || !e.features.length) return
    const props = e.features[0].properties
    const h3Id = props.h3_id
    const count = props.eventCount || 1

    // Parse topEvents if it exists
    let eventsHtml = ''
    if (props.topEvents) {
      try {
        const events = JSON.parse(props.topEvents)
        eventsHtml = `
          <div class="hex-events-list">
            ${events
              .map(
                (ev) => `
              <div class="hex-event-item">
                <div class="hex-event-dot" style="background: ${getSeverityHex(ev.severity)}"></div>
                <div class="hex-event-content">
                  <div class="hex-event-title">${ev.title}</div>
                  <div class="hex-event-meta-row">
                    <span class="hex-event-time">${new Date(ev.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span class="hex-event-details">
                      ${ev.magnitude ? `M${Number(ev.magnitude).toFixed(1)}` : ''}
                      ${ev.depth ? `• ${Math.round(ev.depth)}km` : ''}
                      ${ev.source ? `• ${ev.source}` : ''}
                    </span>
                  </div>
                </div>
              </div>
            `,
              )
              .join('')}
          </div>
        `
      } catch (err) {
        console.error('Error parsing topEvents:', err)
      }
    }

    const popupHtml = `
      <div class="hex-popup" style="--severity-color: ${getSeverityHex(props.maxSeverity)}">
        <div class="hex-popup-header">
          <span class="hex-id">${h3Id}</span>
          <span class="hex-count">${count} Olay</span>
        </div>
        ${eventsHtml}
        <div class="hex-popup-footer">
          <span>Yoğunluk: %${Math.round((props.intensity ?? 0) * 100)}</span>
        </div>
      </div>
    `

    new maplibregl.Popup({ className: 'hex-popup-container', offset: 10 })
      .setLngLat(e.lngLat)
      .setHTML(popupHtml)
      .addTo(map)
  })

  map.on('mouseenter', 'hex-fill', () => {
    map.getCanvas().style.cursor = 'default'
  })
  map.on('mouseleave', 'hex-fill', () => {
    map.getCanvas().style.cursor = ''
  })
}

function updateViewportGrid() {
  if (!map || !mapLoaded || !hexWorker) return
  if (uiStore.mapMode !== 'hexagon') return

  const res = currentHexRes.value

  // Cache hit → reuse geometry, just re-inject signal
  if (hexGridCache.has(res)) {
    map.getSource('hex-world-bg')?.setData({
      type: 'FeatureCollection',
      features: hexGridCache.get(res),
    })
    applySignalToGrid()
    return
  }

  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()

  let minLng = sw.lng
  let maxLng = ne.lng
  while (minLng < -180) minLng += 360
  while (minLng > 180) minLng -= 360
  while (maxLng < -180) maxLng += 360
  while (maxLng > 180) maxLng -= 360

  hexWorker.postMessage({
    type: 'FILL_VIEWPORT',
    bounds: [
      [minLng, sw.lat],
      [maxLng, ne.lat],
    ],
    resolution: res,
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

  // In aggregated mode at low zoom: markers are hidden — only clear if some exist
  if ((uiStore.showHeatmap || uiStore.showHexbins) && currentZoom.value < 8) {
    if (markerObjects.length > 0) clearMarkers()
    return
  }

  clearMarkers()

  disasterStore.allEvents.slice(0, 2500).forEach((event) => {
    const color = getSeverityHex(event.severity)
    const rgbaColor = hexToRgba(color, 0.5)
    const isPulse = event.severity === 'critical'

    const el = document.createElement('div')
    el.className = `disaster-marker${isPulse ? ' marker-pulse' : ''}`
    el.innerHTML = `
      <div class="marker-dot" style="background:${color};box-shadow:0 0 10px ${color};">
        <span class="marker-icon">${event.icon || getDisasterIcon(event.type)}</span>
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

  let events = disasterStore.allEvents

  // Filter to selected country's bounding box when focused
  if (selectedFeatureId && selectedCountryBounds) {
    events = events.filter(
      (e) => e.lat != null && e.lng != null && selectedCountryBounds.contains([e.lng, e.lat]),
    )
  }

  const intensityMap = { critical: 1.0, high: 0.8, moderate: 0.6, low: 0.3, minimal: 0.1 }
  const features = events.map((e) => ({
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

  if (!showHex) {
    map.getSource('disaster-hex')?.setData({ type: 'FeatureCollection', features: [] })
    return
  }

  // Create worker if not yet initialized
  if (!hexWorker) {
    hexWorker = new HexWorker()
    hexWorker.onmessage = ({ data }) => {
      if (!map || !mapLoaded) return

      if (data.type === 'FILL_GRID') {
        // Country grid: apply signal colors then render
        applySignalToCountryGrid(data.features)
      } else if (data.type === 'FILL_VIEWPORT') {
        // Cache static mesh for this resolution
        const res = data.res ?? currentHexRes.value
        hexGridCache.set(res, data.features)
        map.getSource('hex-world-bg')?.setData({
          type: 'FeatureCollection',
          features: data.features,
        })
        // Inject signal onto the cached mesh
        applySignalToGrid()
      }
    }
    const landCells = Array.from(getLandCells())
    hexWorker.postMessage({ type: 'INIT_LAND', landCells })
  }

  updateViewportGrid()
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
  interactionsSetUp = false
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
    map.doubleClickZoom.disable()
    addSourcesAndLayers()
    setupMapInteractions()
    brightenDarkLabels()
    if (selectedFeatureId !== null) {
      map.setFeatureState({ source: 'world-countries', id: selectedFeatureId }, { selected: true })
      _allCountryFeatures.forEach((cf) => {
        if (cf.id !== selectedFeatureId)
          map.setFeatureState({ source: 'world-countries', id: cf.id }, { dimmed: true })
      })
      const selF = _allCountryFeatures.find((cf) => cf.id === selectedFeatureId)
      if (selF) setFocusMode(true, selF)
    }
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

function downloadMap() {
  if (!map || !mapLoaded) return
  map.getCanvas().toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gews-map-${new Date().toISOString().slice(0,19).replace(/[:T]/g, '-')}.png`
    a.click()
    URL.revokeObjectURL(url)
  })
}

watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && map) flyToRegion(region.lat, region.lng, region.zoom)
  },
)

let _mapUpdateTimer = null
watch(
  () => [disasterStore.allEvents, disasterStore.aggregatedH3Data],
  () => {
    clearTimeout(_mapUpdateTimer)
    _mapUpdateTimer = setTimeout(() => {
      updateMarkers()
      updateHeatmap()
      // Signal injection: re-inject colors without recomputing geometry
      if (mapLoaded && uiStore.showHexbins) {
        applySignalToGrid()
        if (selectedFeatureId && countryHexFeatures?.length) {
          applySignalToCountryGrid(countryHexFeatures)
        }
      } else {
        updateHexbins()
      }
    }, 400)
  },
)

watch(
  () => uiStore.mapMode,
  () => {
    updateMarkers()
    updateHeatmap()
    updateHexbins()
    // When switching to heatmap on a focused country, filter immediately
    if (uiStore.showHeatmap && selectedFeatureId) updateHeatmap()
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
    <div
      v-if="uiStore.showHeatmap"
      class="map-legend"
      :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }"
    >
      <div class="legend-title">Yoğunluk</div>
      <div class="legend-gradient heat-gradient"></div>
      <div class="legend-labels">
        <span>Düşük</span>
        <span>Yüksek</span>
      </div>
    </div>

    <!-- Hexbin / marker severity legend — only shown when sidebar legend is hidden -->
    <div
      v-else-if="
        (uiStore.showHexbins || (!uiStore.showHeatmap && !uiStore.showHexbins)) &&
        (uiStore.sidebarCollapsed || !uiStore.sidebarOpen)
      "
      class="map-legend"
      :class="{ 'legend-sidebar-collapsed': uiStore.sidebarCollapsed }"
    >
      <div class="legend-title">Şiddet</div>
      <div class="legend-severity-rows">
        <div class="sev-row">
          <span class="sev-dot" style="background: #4ade80"></span><span>Minimal</span>
        </div>
        <div class="sev-row">
          <span class="sev-dot" style="background: #fbbf24"></span><span>Düşük</span>
        </div>
        <div class="sev-row">
          <span class="sev-dot" style="background: #f97316"></span><span>Orta</span>
        </div>
        <div class="sev-row">
          <span class="sev-dot" style="background: #ef4444"></span><span>Yüksek</span>
        </div>
        <div class="sev-row">
          <span class="sev-dot" style="background: #7c3aed"></span><span>Kritik</span>
        </div>
      </div>
    </div>

    <button class="map-download-btn" @click="downloadMap" title="Haritayı PNG olarak indir">⬇</button>

    <div class="layer-switcher" @click="cycleMapStyle">
      <div
        class="layer-preview"
        :class="MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].preview"
      >
        <span class="layer-label">{{
          MAP_STYLES[(mapStyleIndex + 1) % MAP_STYLES.length].label
        }}</span>
      </div>
    </div>

    <!-- Country hover tooltip -->
    <Transition name="hover-label">
      <div v-if="hoveredCountryName" class="country-hover-label">{{ hoveredCountryName }}</div>
    </Transition>

    <!-- Selected country badge -->
    <Transition name="country-badge">
      <div v-if="selectedCountryName" class="country-badge">
        <span class="country-badge-name">{{ selectedCountryName }}</span>
        <div class="country-badge-close" @click="clearCountrySelection" title="Temizle">✕</div>
      </div>
    </Transition>
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

.map-download-btn {
  position: absolute;
  bottom: 160px;
  right: 10px;
  z-index: 10;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(20, 24, 33, 0.88);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.map-download-btn:hover {
  background: rgba(77, 163, 255, 0.3);
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

/* ── Country hover label ── */
.country-hover-label {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(20, 24, 33, 0.88);
  color: #e8ecf0;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 14px;
  border-radius: 20px;
  border: 1px solid rgba(74, 222, 128, 0.35);
  pointer-events: none;
  backdrop-filter: blur(6px);
  white-space: nowrap;
  z-index: 20;
}

.hover-label-enter-active,
.hover-label-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.hover-label-enter-from,
.hover-label-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}

/* ── Selected country badge ── */
.country-badge {
  position: absolute;
  top: 24px;
  right: 24px;
  background: var(--glass-bg);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  padding: 8px 14px 8px 18px;
  border-radius: 100px;
  border: 1px solid var(--glass-border);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  cursor: default;
  animation: badgeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  pointer-events: auto;
}

@keyframes badgeIn {
  from {
    opacity: 0;
    transform: translateY(-10px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.country-badge-name {
  font-family: var(--font-primary);
  font-weight: 700;
  font-size: 0.9rem;
  color: #4ade80;
  letter-spacing: -0.01em;
  text-shadow: 0 0 12px rgba(74, 222, 128, 0.3);
}

.country-badge-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}

.country-badge-close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  transform: rotate(90deg);
}

.country-badge-enter-active,
.country-badge-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.country-badge-enter-from,
.country-badge-leave-to {
  opacity: 0;
  transform: translateY(-8px);
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
  font-size: 16px;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
  transition: all 0.2s;
  z-index: 100;
  border: none;
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
