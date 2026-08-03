<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import countries from '@/configs/countries.json'

// Same worker-URL fix as MapView.vue (maplibre-gl's default relative lookup
// 404s under Vite) — harmless to call again if MapView has already set it.
maplibregl.setWorkerUrl(maplibreWorkerUrl)

const props = defineProps({
  lat: { type: [Number, String], default: null },
  lng: { type: [Number, String], default: null },
  countryCode: { type: String, default: '' },
})
const emit = defineEmits(['pick'])

const mapContainer = ref(null)
let map = null
let marker = null

// Same self-hosted-tiles-with-public-fallback logic as MapView.vue's
// getBaseStyle()/selfHostedStyleUrl() (docker-compose.yml's tile-builder/
// tileserver) — kept to the dark style only since this picker has no
// style-switcher UI. Falls back to the public API when the local
// tileserver isn't configured/reachable for this country.
const TILESERVER_URL = import.meta.env.VITE_TILESERVER_URL || null
const SELF_HOSTED_TILE_COUNTRIES = { tr: 'turkey-dark', mg: 'madagascar-dark' }
const PUBLIC_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark'

function baseStyleUrl() {
  const id = SELF_HOSTED_TILE_COUNTRIES[props.countryCode?.toLowerCase()]
  if (TILESERVER_URL && id) return `${TILESERVER_URL}/styles/${id}/style.json`
  return PUBLIC_DARK_STYLE
}

// Always the whole-world view (not the country's own defaultZoom, and not
// a tight zoom on an existing pin) — user-reported, 2026-08-03: opening
// already zoomed into a single point read as "just a plain ground/nothing"
// with ~country/street-level starting zoom, forcing a zoom-out every time
// before they could see where they even were. Starting wide and letting
// people zoom in themselves is the fix; only pans (never re-zooms) after
// that, so a deliberate zoom-in isn't fought on the next country/coord change.
const WORLD_ZOOM = 1

function countryCenterPoint() {
  const c = countries[props.countryCode?.toLowerCase()]
  return c ? [c.centerLng, c.centerLat] : [30, 20]
}

function hasValidCoords() {
  return Number.isFinite(Number(props.lat)) && Number.isFinite(Number(props.lng))
}

function placeMarker(lngLat) {
  if (marker) {
    marker.setLngLat(lngLat)
    return
  }
  const el = document.createElement('div')
  el.className = 'location-picker-marker'
  marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
    .setLngLat(lngLat)
    .addTo(map)
  marker.on('dragend', () => {
    const { lat, lng } = marker.getLngLat()
    emit('pick', { lat, lng })
  })
}

onMounted(() => {
  const initialCenter = hasValidCoords() ? [Number(props.lng), Number(props.lat)] : countryCenterPoint()

  map = new maplibregl.Map({
    container: mapContainer.value,
    style: baseStyleUrl(),
    center: initialCenter,
    zoom: WORLD_ZOOM,
    attributionControl: false,
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

  if (hasValidCoords()) placeMarker([Number(props.lng), Number(props.lat)])

  map.on('click', (e) => {
    placeMarker(e.lngLat)
    emit('pick', { lat: e.lngLat.lat, lng: e.lngLat.lng })
  })
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})

// External coordinate changes (typing directly into the lat/lng number
// inputs, or switching which shelter is being edited) move the marker/map
// to match — but skip while a click/drag on this same map is the source of
// those props, since the parent just echoes 'pick' straight back into
// them and re-centering mid-interaction would fight the user's own click.
watch(
  () => [props.lat, props.lng],
  ([newLat, newLng]) => {
    if (!map || !Number.isFinite(Number(newLat)) || !Number.isFinite(Number(newLng))) return
    const lngLat = [Number(newLng), Number(newLat)]
    placeMarker(lngLat)
    map.easeTo({ center: lngLat, duration: 300 })
  },
)

// Switching country (create mode, no coords yet) pans to that country's
// center — zoom is deliberately left untouched (see WORLD_ZOOM comment).
watch(
  () => props.countryCode,
  () => {
    if (!map || hasValidCoords()) return
    map.easeTo({ center: countryCenterPoint(), duration: 300 })
  },
)
</script>

<template>
  <div ref="mapContainer" class="location-picker-map"></div>
</template>

<style scoped>
.location-picker-map { width: 100%; height: 100%; border-radius: 10px; overflow: hidden; }
.location-picker-map :deep(.location-picker-marker) {
  width: 28px; height: 28px;
  background: #ef4444;
  border: 3px solid #fff;
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  box-shadow: 0 2px 6px rgba(0,0,0,.5);
  cursor: grab;
}
</style>
