<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'
import { supabase } from '@/services/api/config.js'
import { useI18n } from 'vue-i18n'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const { t } = useI18n()

const globeContainer = ref(null)
let globeInstance = null
let animationId = null

// --- Live flight tracking (spec 072, real OpenSky data via fetch-live-flights) ---
const flightsData = ref({ fetchedAt: null, stale: false, states: [] })
let flightsTimer = null
async function fetchFlights() {
  const { data, error } = await supabase.functions.invoke('fetch-live-flights')
  if (error) {
    flightsData.value = { ...flightsData.value, stale: true }
    return
  }
  flightsData.value = data
}
function startFlightsPolling() {
  if (flightsTimer) return
  fetchFlights()
  flightsTimer = setInterval(fetchFlights, 60000)
}
function stopFlightsPolling() {
  clearInterval(flightsTimer)
  flightsTimer = null
  flightsData.value = { fetchedAt: null, stale: false, states: [] }
}
// Small shared cone standing in for an aircraft icon — cloned per-datum by
// three-globe automatically (see its objectThreeObject handling), so this
// only ever needs to be built once per globe instance.
function createAircraftObject(THREE) {
  const geometry = new THREE.ConeGeometry(0.8, 2.4, 6)
  const material = new THREE.MeshBasicMaterial({ color: '#7fd4ff' })
  const cone = new THREE.Mesh(geometry, material)
  cone.rotation.x = Math.PI / 2 // point the cone's tip along local +Y (heading direction)
  return cone
}

function flightHoverLabel(d) {
  if (!showHoverInfo.value) return ''
  const parts = [d.callsign || d.icao24, d.originCountry]
  if (d.altitudeM != null) parts.push(`${Math.round(d.altitudeM)} m`)
  if (d.velocityMs != null) parts.push(`${Math.round(d.velocityMs * 3.6)} km/h`)
  return `<div style="background:rgba(10,14,25,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;color:#fff;font-size:12px;">${parts.filter(Boolean).join(' · ')}</div>`
}
function updateFlightsLayer() {
  if (!globeInstance) return
  globeInstance.objectsData(uiStore.showFlights ? flightsData.value.states : [])
}

// --- Timeline playback (real event timestamps, last 72h) ---
const showTimeline = ref(false)
const timelineValue = ref(72) // 0 = window start (72h ago), 72 = now — fully revealed by default
const timelinePlaying = ref(false)
let timelinePlayTimer = null
const TIMELINE_WINDOW_HOURS = 72

function timelinePlayheadMs() {
  const windowStartMs = Date.now() - TIMELINE_WINDOW_HOURS * 3600000
  return windowStartMs + timelineValue.value * 3600000
}

function filterEventsByTimeline(events) {
  if (!showTimeline.value) return events
  const cutoff = timelinePlayheadMs()
  return events.filter((e) => new Date(e.time).getTime() <= cutoff)
}

const timelineLabel = computed(() => {
  const hoursAgo = Math.round(TIMELINE_WINDOW_HOURS - timelineValue.value)
  return hoursAgo <= 0 ? 'Şimdi' : `${hoursAgo} sa önce`
})

function toggleTimelinePlay() {
  if (timelinePlaying.value) {
    clearInterval(timelinePlayTimer)
    timelinePlaying.value = false
    return
  }
  if (timelineValue.value >= TIMELINE_WINDOW_HOURS) timelineValue.value = 0
  timelinePlaying.value = true
  // ~15s to sweep the full 72h window — fast enough to watch, slow enough to read.
  const stepMs = 200
  const stepValue = TIMELINE_WINDOW_HOURS / (15000 / stepMs)
  timelinePlayTimer = setInterval(() => {
    timelineValue.value = Math.min(TIMELINE_WINDOW_HOURS, timelineValue.value + stepValue)
    if (timelineValue.value >= TIMELINE_WINDOW_HOURS) {
      clearInterval(timelinePlayTimer)
      timelinePlaying.value = false
    }
  }, stepMs)
}

// --- Dynamic atmosphere color (real data: critical/high event count) ---
const dynamicAtmosphere = ref(false)
const STATIC_ATMOSPHERE_COLOR = '#3a7bd5'
function computeAtmosphereColor(events) {
  const score = events.reduce((sum, e) => {
    if (e.severity === 'critical') return sum + 2
    if (e.severity === 'high') return sum + 1
    return sum
  }, 0)
  const t = Math.min(1, score / 20)
  const from = [0x3a, 0x7b, 0xd5]
  const to = [0xd5, 0x42, 0x3a]
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
function updateAtmosphereColor() {
  if (!globeInstance) return
  globeInstance.atmosphereColor(
    dynamicAtmosphere.value ? computeAtmosphereColor(disasterStore.allEvents) : STATIC_ATMOSPHERE_COLOR,
  )
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function stableHash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// --- Hover info cards (real event/country data, native globe.gl tooltip) ---
const showHoverInfo = ref(false)
function pointHoverLabel(d) {
  if (!showHoverInfo.value) return ''
  const time = new Date(d.time).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })
  return `<div style="background:rgba(10,14,25,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;color:#fff;font-size:12px;max-width:220px;">
    <strong>${d.title || d.type}</strong><br/>
    <span style="color:${getSeverityHex(d.severity)}">${d.severity}</span> · ${time}
  </div>`
}
function polygonHoverLabel(feat) {
  if (!showHoverInfo.value) return ''
  const name = feat.properties?.ADMIN || feat.properties?.NAME
  if (!name) return ''
  return `<div style="background:rgba(10,14,25,0.92);border:1px solid rgba(255,255,255,0.15);border-radius:6px;padding:6px 10px;color:#fff;font-size:12px;">${name}</div>`
}
function setHoverCursor(isHovering) {
  if (!globeContainer.value) return
  globeContainer.value.style.cursor = isHovering ? 'pointer' : ''
}

// Dynamic texture selection based on device
function getTextureUrl() {
  const isMobile = window.innerWidth <= 768 || navigator.hardwareConcurrency <= 4
  // Use free NASA Blue Marble textures
  if (isMobile) {
    return '/textures/earth-blue-marble.jpg'
  }
  return '/textures/earth-blue-marble.jpg'
}

// --- Day/night terminator (real subsolar-point astronomy, not decorative) ---
// Standard low-precision solar position algorithm (same one used by
// leaflet.terminator / NOAA's solar calculator), good to well under a degree
// — plenty for a globe-scale line. Computed from the actual current time,
// not a fixed/fake position.
function getSubsolarPoint(date) {
  const rad = Math.PI / 180
  const J2000 = Date.UTC(2000, 0, 1, 12, 0, 0)
  const n = (date.getTime() - J2000) / 86400000
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * rad
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const epsilon = (23.439 - 0.0000004 * n) * rad
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / rad
  const alpha = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / rad
  const gmst = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360
  let lng = alpha - gmst
  lng = ((lng + 540) % 360) - 180
  return { lat: declination, lng }
}

// Terminator = great circle perpendicular to the subsolar vector. Built via
// vector math (not the tan(lat)=... formula) so it stays well-defined near
// the equinoxes when the subsolar latitude is ~0.
function computeTerminatorPath({ lat, lng }, steps = 180) {
  const rad = Math.PI / 180
  const latR = lat * rad
  const lngR = lng * rad
  const s = [Math.cos(latR) * Math.cos(lngR), Math.cos(latR) * Math.sin(lngR), Math.sin(latR)]
  const ref = Math.abs(s[2]) < 0.99 ? [0, 0, 1] : [1, 0, 0]
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
  const norm = (a) => {
    const m = Math.hypot(a[0], a[1], a[2])
    return [a[0] / m, a[1] / m, a[2] / m]
  }
  const u = norm(cross(ref, s))
  const v = norm(cross(s, u))
  const points = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const p = [
      Math.cos(t) * u[0] + Math.sin(t) * v[0],
      Math.cos(t) * u[1] + Math.sin(t) * v[1],
      Math.cos(t) * u[2] + Math.sin(t) * v[2],
    ]
    points.push([Math.asin(p[2]) / rad, Math.atan2(p[1], p[0]) / rad])
  }
  return points
}

// Same lat/lng -> xyz convention three-globe itself uses internally
// (polar2Cartesian: phi from north pole, theta from lng=90 as in three.js's
// sphere UV layout) — has to match or the sun-light direction and the night
// lights texture drift out of alignment with the day texture underneath.
function subsolarToVector3(lat, lng, r) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((90 - lng) * Math.PI) / 180
  const phiSin = Math.sin(phi)
  return {
    x: r * phiSin * Math.cos(theta),
    y: r * Math.cos(phi),
    z: r * phiSin * Math.sin(theta),
  }
}

let sunTimer = null
let ambientLight = null
let sunLight = null
let nightLightsMesh = null

// Toggling "Gece Işıkları" also reverts to three-globe's own flat default
// lighting (ambient-only, no shading contrast) rather than just zeroing our
// added light — matches how the globe looked before this feature existed.
const FLAT_AMBIENT_INTENSITY = Math.PI
function applyNightLightsToggle() {
  if (!globeInstance || !ambientLight || !sunLight) return
  const on = uiStore.showNightLights
  ambientLight.intensity = on ? 1.9 : FLAT_AMBIENT_INTENSITY
  sunLight.intensity = on ? 1.3 : 0
  if (nightLightsMesh) nightLightsMesh.visible = on
}
function updateSunPosition() {
  if (!globeInstance) return
  const subsolar = getSubsolarPoint(new Date())
  globeInstance.pathsData(uiStore.showTerminator ? [computeTerminatorPath(subsolar)] : [])
  if (sunLight) {
    const r = globeInstance.getGlobeRadius() * 5
    const v = subsolarToVector3(subsolar.lat, subsolar.lng, r)
    sunLight.position.set(v.x, v.y, v.z)
  }
}

// --- Choropleth (country_code-driven, spec: only real data, no decoration) ---
let countriesGeoJson = null
async function loadCountriesGeoJson() {
  if (countriesGeoJson) return countriesGeoJson
  const res = await fetch('/geo/countries-110m.geojson')
  countriesGeoJson = (await res.json()).features
  return countriesGeoJson
}

const CHOROPLETH_WEIGHT = { critical: 5, high: 3, moderate: 2, low: 1, minimal: 0.5 }
function choroplethCapColor(weightByCountry) {
  return (feat) => {
    const code = feat.properties?.ISO_A2
    const w = weightByCountry.get(code) || 0
    if (w > 8) return 'rgba(255,0,51,0.55)'
    if (w > 4) return 'rgba(255,153,0,0.45)'
    if (w > 0) return 'rgba(255,214,0,0.32)'
    return 'rgba(255,255,255,0.025)'
  }
}

async function initGlobe() {
  if (!globeContainer.value) return

  const Globe = (await import('globe.gl')).default
  const THREE = await import('three')

  globeInstance = Globe()
    .globeImageUrl(getTextureUrl())
    .bumpImageUrl('/textures/earth-topology.png')
    .backgroundColor('rgba(0,0,0,0)')
    .showAtmosphere(true)
    .atmosphereColor('#3a7bd5')
    .atmosphereAltitude(0.25)
    .width(globeContainer.value.clientWidth)
    .height(globeContainer.value.clientHeight)
    // Points layer for disasters
    .pointsData([])
    .pointLat((d) => d.lat)
    .pointLng((d) => d.lng)
    .pointAltitude((d) => {
      if (d.severity === 'critical') return 0.12
      if (d.severity === 'high') return 0.08
      return 0.04
    })
    .pointRadius((d) => {
      if (d.severity === 'critical') return 0.6
      if (d.severity === 'high') return 0.45
      if (d.severity === 'moderate') return 0.35
      return 0.25
    })
    .pointColor((d) => getSeverityHex(d.severity))
    .pointLabel((d) => pointHoverLabel(d))
    .pointResolution(12)
    // Rings layer for impact zones
    .ringsData([])
    .ringLat((d) => d.lat)
    .ringLng((d) => d.lng)
    .ringMaxRadius((d) => {
      if (d.severity === 'critical') return 5
      if (d.severity === 'high') return 3
      return 2
    })
    .ringPropagationSpeed(1.5)
    // ~3s cadence per user request, jittered per-event (stable hash of the
    // event id) so critical rings don't all pulse in lockstep — three-globe
    // cycles each ring on `elapsed % repeatPeriod`, so a different period
    // per event is enough to drift them out of phase from each other.
    .ringRepeatPeriod((d) => 3000 + (stableHash(String(d.id)) % 1200))
    // Fading out over the last 35% of each ring's growth instead of a flat
    // color — three-globe just deletes the ring the instant t hits 1, so a
    // constant-alpha color made it vanish mid-frame with no warning ("bir
    // anda siliniyor, komik oluyor" feedback).
    .ringColor((d) => (t) => {
      const alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1
      return hexToRgba(getSeverityHex(d.severity), alpha)
    })
    // Labels
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lng)
    .labelText((d) => d.title)
    .labelSize(0.5)
    .labelColor(() => 'rgba(255, 255, 255, 0.75)')
    .labelResolution(2)
    .labelsData([])
    // Hex bin layer (Isı/Petek toggle) tuning: three-globe defaults to one
    // separate Mesh per hexagon (hexBinMerge=false) plus a 1000ms tween on
    // every hex whenever hexBinPointsData() is called again — with a
    // world's worth of hex bins, repeatedly toggling Isı/Petek stacks up
    // overlapping per-hex tweens across hundreds of meshes each time,
    // which is what actually caused the reported "gets unbearably janky
    // after switching a few times in a row". Merging into a single mesh
    // (three-globe's own recommendation for this exact case) and shortening
    // the tween both cut per-toggle cost and stop it from compounding.
    .hexBinMerge(true)
    .hexTransitionDuration(300)
    // Day/night terminator line (real subsolar-point calc, see computeTerminatorPath)
    .pathsData([])
    .pathColor(() => 'rgba(255,255,255,0.35)')
    .pathStroke(0.6)
    .pathDashLength(0.4)
    .pathDashGap(0.2)
    .pathTransitionDuration(0)
    // Country choropleth (spec 072 Phase 1) — off until uiStore.showChoropleth
    .polygonsData([])
    .polygonAltitude(0.006)
    .polygonSideColor(() => 'rgba(0,0,0,0)')
    .polygonStrokeColor(() => 'rgba(255,255,255,0.15)')
    .polygonLabel((feat) => polygonHoverLabel(feat))
    .polygonsTransitionDuration(300)
    // Live flight tracking (spec 072) — separate custom-object layer, not
    // merged into pointsData, so it can't regress the disaster-marker click/
    // color/altitude behavior above (research.md §3).
    .objectsData([])
    .objectLat((d) => d.lat)
    .objectLng((d) => d.lng)
    .objectAltitude(0.02)
    .objectFacesSurface(false)
    .objectRotation((d) => ({ y: d.headingDeg || 0 }))
    .objectThreeObject(() => createAircraftObject(THREE))
    .objectLabel((d) => flightHoverLabel(d))
    // Click handler
    .onPointClick((point) => {
      if (point) {
        uiStore.selectDisaster(point)
        uiStore.transitionToMap(point.lat, point.lng, getZoomForSeverity(point.severity))
      }
    })
    .onGlobeClick(({ lat, lng }) => {
      uiStore.transitionToMap(lat, lng, 6)
    })
    // Swap the drag-grab cursor for a pointer while hovering something
    // hoverable — otherwise the constant "grab" hand gives no visual sign
    // a hover card is even available (reported as "info cards don't work").
    .onPointHover((d) => setHoverCursor(!!d))
    .onPolygonHover((d) => setHoverCursor(!!d))
    .htmlElementsData([])
    .htmlLat((d) => d.lat)
    .htmlLng((d) => d.lng)
    .htmlElement(() => {
      const el = document.createElement('div')
      el.style.transform = 'translate(-50%, -50%)' // Center exactly on lat/lng
      el.innerHTML = `
        <div class="user-globe-marker">
          <div class="pin-head"></div>
          <div class="pin-pulse"></div>
        </div>
      `
      return el
    })(globeContainer.value)

  // Real day/night shading: dim the flat default lighting and add a single
  // directional light coming from the actual subsolar direction, so the
  // Phong-shaded day texture goes dark on the night side on its own.
  // Point/ring/hex layers use Lambert materials that also react to these
  // lights — the first version here (ambient 1.1 + directional 2.4) blew
  // the disaster markers out into harsh, oversaturated blocks under direct
  // sun. Keeping total light energy close to three-globe's own flat default
  // (ambient ~3.14) but shifting more of it into the directional component
  // still gives a real day/night difference without that glare.
  ambientLight = new THREE.AmbientLight(0xffffff, 1.9)
  sunLight = new THREE.DirectionalLight(0xffffff, 1.3)
  globeInstance.lights([ambientLight, sunLight])

  // Real NASA night-lights texture (public/textures/earth-night-lights.png),
  // additive-blended just above the day globe — city lights read through on
  // the dark side without needing a custom shader; on the lit side they're
  // washed out by the much brighter day texture, same technique used in
  // three.js's own earth demos.
  const nightTexture = new THREE.TextureLoader().load('/textures/earth-night-lights.png')
  const radius = globeInstance.getGlobeRadius()
  nightLightsMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.001, 96, 48),
    new THREE.MeshBasicMaterial({
      map: nightTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    }),
  )
  // three-globe rotates its own globe mesh -90° on Y to line up the prime
  // meridian (see its polar2Cartesian convention) — our overlay needs the
  // exact same rotation or its texture drifts off the real coastlines
  // (this was the "landed on the ocean" bug).
  nightLightsMesh.rotation.y = -Math.PI / 2
  globeInstance.scene().add(nightLightsMesh)
  applyNightLightsToggle()

  // Auto-rotate
  if (!uiStore.safeMode) {
    globeInstance.controls().autoRotate = true
    globeInstance.controls().autoRotateSpeed = 0.5
    globeInstance.controls().enableDamping = true
    globeInstance.controls().dampingFactor = 0.1
  }

  // Set initial POV
  globeInstance.pointOfView({ lat: 20, lng: 30, altitude: 2.5 })
}

function getZoomForSeverity(severity) {
  if (severity === 'critical') return 10
  if (severity === 'high') return 8
  return 6
}

function updateGlobeData() {
  if (!globeInstance) return

  const events = filterEventsByTimeline(disasterStore.allEvents)

  // Critical/high-severity pulse rings — shown regardless of display mode
  // (previously the Petek/hexbin branch cleared ringsData and never set it
  // again, so the pulse never appeared at all in the app's default 3D view).
  const criticalEvents = events.filter((e) => e.severity === 'critical' || e.severity === 'high')
  globeInstance.ringsData(criticalEvents)

  if (uiStore.showHeatmap) {
    globeInstance.labelsData([])

    // Define weight map
    const weightMap = {
      critical: 5,
      high: 3,
      moderate: 2,
      low: 1,
      minimal: 0.5,
    }

    const heatData = events.map((e) => ({
      lat: e.lat,
      lng: e.lng,
      weight: weightMap[e.severity] || 1,
    }))

    if (uiStore.showHexbins) {
      // CLEAR HEATMAP (HexBins can be both, but we differentiate)
      globeInstance
        .hexBinPointsData(heatData)
        .hexBinPointWeight('weight')
        .hexBinResolution(4)
        .hexMargin(0.05) // Tighter honeycomb look
        .hexTopColor((d) => (d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffd600'))
        .hexSideColor((d) =>
          d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffd600',
        )
        .hexAltitude(0.01) // Flatter "petek" look as per drought.uk
    } else {
      globeInstance
        .hexBinPointsData(heatData)
        .hexBinPointWeight('weight')
        .hexBinResolution(4)
        .hexMargin(0.2)
        .hexTopColor((d) => (d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffff00'))
        .hexSideColor((d) =>
          d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffff00',
        )
        .hexAltitude((d) => Math.min(0.25, d.sumWeight * 0.02))
    }
  } else if (uiStore.showHexbins) {
    // Clear normal markers (rings stay on — set above, independent of mode)
    globeInstance.pointsData([])
    globeInstance.labelsData([])

    const weightMap = {
      critical: 5,
      high: 3,
      moderate: 2,
      low: 1,
      minimal: 0.5,
    }

    const heatData = events.map((e) => ({
      lat: e.lat,
      lng: e.lng,
      weight: weightMap[e.severity] || 1,
    }))

    globeInstance
      .hexBinPointsData(heatData)
      .hexBinPointWeight('weight')
      .hexBinResolution(uiStore.safeMode ? 3 : 4)
      .hexMargin(0.05)
      .hexTopColor((d) => (d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffd600'))
      .hexSideColor((d) => (d.sumWeight > 8 ? '#ff0033' : d.sumWeight > 4 ? '#ff9900' : '#ffd600'))
      .hexAltitude(0.01)
  } else {
    // Clear 3D Heatmap
    globeInstance.hexBinPointsData([])

    // Normal Markers
    globeInstance.pointsData(events)

    // Labels only for critical events
    const labeled = events.filter((e) => e.severity === 'critical').slice(0, 20)
    globeInstance.labelsData(labeled)
  }

  // Always update user marker if available
  if (geoStore.hasLocation) {
    globeInstance.htmlElementsData([{ lat: geoStore.userLat, lng: geoStore.userLng }])
  } else {
    globeInstance.htmlElementsData([])
  }
}

async function updateChoropleth() {
  if (!globeInstance) return
  if (!uiStore.showChoropleth) {
    globeInstance.polygonsData([])
    return
  }

  const features = await loadCountriesGeoJson()
  const weightByCountry = new Map()
  for (const e of filterEventsByTimeline(disasterStore.allEvents)) {
    const code = e.country_code?.toUpperCase()
    if (!code) continue
    const w = CHOROPLETH_WEIGHT[e.severity] || 1
    weightByCountry.set(code, (weightByCountry.get(code) || 0) + w)
  }

  globeInstance.polygonsData(features).polygonCapColor(choroplethCapColor(weightByCountry))
}

function handleResize() {
  if (globeInstance && globeContainer.value) {
    globeInstance.width(globeContainer.value.clientWidth).height(globeContainer.value.clientHeight)
  }
}

// Same shared-debounce fix as MapView.vue's scheduleUpdateMarkers() —
// clicking Isı/Petek repeatedly fired updateGlobeData() once per click,
// each one rebuilding the hex bin layer from scratch; back-to-back calls
// piled up faster than the globe could finish the previous rebuild.
// Routing every caller through one shared timer means only the last state
// within a short window actually triggers a rebuild.
let _globeUpdateTimer = null
function scheduleUpdateGlobeData(delay = 150) {
  clearTimeout(_globeUpdateTimer)
  _globeUpdateTimer = setTimeout(updateGlobeData, delay)
}

// Watch for data changes
watch(
  () => disasterStore.allEvents,
  () => {
    scheduleUpdateGlobeData()
  },
  { deep: true },
)

// Watch for location changes
watch(
  () => geoStore.userCoords,
  () => {
    scheduleUpdateGlobeData()
  },
  { deep: true },
)

// Watch for heatmap/hexbin toggle
watch(
  () => [uiStore.showHeatmap, uiStore.showHexbins],
  () => {
    scheduleUpdateGlobeData()
  },
)

// Choropleth: rebuild on toggle and whenever the underlying events change
watch(
  () => uiStore.showChoropleth,
  () => updateChoropleth(),
)
watch(
  () => disasterStore.allEvents,
  () => {
    if (uiStore.showChoropleth) updateChoropleth()
  },
  { deep: true },
)

// Terminator / night-lights layer toggles
watch(
  () => uiStore.showTerminator,
  () => updateSunPosition(),
)
watch(
  () => uiStore.showNightLights,
  () => applyNightLightsToggle(),
)

// Live flight tracking: start/stop polling on toggle, push new data whenever it arrives
watch(
  () => uiStore.showFlights,
  (on) => {
    if (on) startFlightsPolling()
    else stopFlightsPolling()
    updateFlightsLayer()
  },
)
watch(
  () => flightsData.value,
  () => updateFlightsLayer(),
)

// Timeline: scrubbing/toggling re-filters every layer that reads `events`
watch(
  () => [showTimeline.value, timelineValue.value],
  () => scheduleUpdateGlobeData(0),
)

// Dynamic atmosphere: recompute on toggle and whenever events change
watch(
  () => dynamicAtmosphere.value,
  () => updateAtmosphereColor(),
)
watch(
  () => disasterStore.allEvents,
  () => updateAtmosphereColor(),
  { deep: true },
)

// Fly-to on search/hazard-chip selection (uiStore.selectedRegion) — reuses
// the existing 800ms transitionToMap() window (see AppHeader.vue's
// onLocationSelected) so the globe visibly flies to the picked point during
// the same delay that already elapses before switching to the 2D map,
// instead of just cutting away. No visible toggle for this one — it's a
// transition polish, not a layer.
watch(
  () => uiStore.selectedRegion,
  (region) => {
    if (region && globeInstance && uiStore.transitionState === 'transitioning') {
      globeInstance.pointOfView({ lat: region.lat, lng: region.lng, altitude: 1.2 }, 750)
    }
  },
)

// Watch for safe mode
watch(
  () => uiStore.safeMode,
  (isSafe) => {
    if (globeInstance) {
      globeInstance.controls().autoRotate = !isSafe
    }
  },
)

// spec 069 follow-up: window 'resize' alone only fires when the browser
// window itself changes size — it never fired when the header/footer shell
// was added around this container (window stayed the same size, only the
// globe's own box got shorter), so the globe kept rendering at its stale
// initial width/height and looked vertically off-center. Same class of bug
// already fixed for MapView.vue's canvas (containerResizeObserver) — a
// ResizeObserver on the actual container catches layout-only size changes
// a window listener can't.
let globeResizeObserver = null

onMounted(async () => {
  await nextTick()
  await initGlobe()
  updateGlobeData()
  updateSunPosition()
  // Real solar position barely moves minute-to-minute; a 60s refresh keeps
  // the terminator/light accurate without adding meaningful render cost.
  sunTimer = setInterval(updateSunPosition, 60000)
  if (uiStore.showChoropleth) updateChoropleth()
  updateAtmosphereColor()
  if (uiStore.showFlights) startFlightsPolling()

  window.addEventListener('resize', handleResize)
  if (globeContainer.value) {
    globeResizeObserver = new ResizeObserver(handleResize)
    globeResizeObserver.observe(globeContainer.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  globeResizeObserver?.disconnect()
  clearTimeout(_globeUpdateTimer)
  clearInterval(sunTimer)
  clearInterval(timelinePlayTimer)
  clearInterval(flightsTimer)
  if (animationId) cancelAnimationFrame(animationId)
  if (nightLightsMesh) {
    globeInstance?.scene()?.remove(nightLightsMesh)
    nightLightsMesh.geometry?.dispose()
    nightLightsMesh.material?.map?.dispose()
    nightLightsMesh.material?.dispose()
    nightLightsMesh = null
  }
  if (globeInstance) {
    if (typeof globeInstance._destructor === 'function') {
      globeInstance._destructor()
    }
  }
})
</script>

<template>
  <div class="globe-view-wrapper">
    <div ref="globeContainer" class="globe-view" :class="{ 'safe-mode': uiStore.safeMode }"></div>
    <!-- spec 072 follow-up (2026-08-20): no separate top-left radar toggle
         on the 3D globe — the right-side dock's 🛩 button below already
         toggles the exact same uiStore.showFlights, a second one would be
         pure duplication ("ikisi de aynı işe yarıyor"). Screenshot/shelters
         quick-access stays 2D-only (MapView.vue's QuickAccessGrid). -->
    <div class="globe-layer-dock" role="group" :aria-label="t('sidebar.globeLayersGroup')">
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: uiStore.showTerminator }"
        @click="uiStore.toggleTerminator()"
        :title="t('sidebar.modeTerminator')"
      >
        🌗
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: uiStore.showNightLights }"
        @click="uiStore.toggleNightLights()"
        :title="t('sidebar.modeNightLights')"
      >
        🌃
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: uiStore.showChoropleth }"
        @click="uiStore.toggleChoropleth()"
        :title="t('sidebar.modeChoropleth')"
      >
        🗺️
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: showTimeline }"
        @click="showTimeline = !showTimeline"
        :title="t('sidebar.modeTimeline')"
      >
        🕐
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: dynamicAtmosphere }"
        @click="dynamicAtmosphere = !dynamicAtmosphere"
        :title="t('sidebar.modeDynamicAtmosphere')"
      >
        🌡️
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: showHoverInfo }"
        @click="showHoverInfo = !showHoverInfo"
        :title="t('sidebar.modeHoverCards')"
      >
        🏷️
      </button>
      <button
        type="button"
        class="globe-layer-btn"
        :class="{ active: uiStore.showFlights, stale: uiStore.showFlights && flightsData.stale }"
        @click="uiStore.toggleFlights()"
        :title="uiStore.showFlights && flightsData.stale ? t('sidebar.modeFlightsStale') : t('sidebar.modeFlights')"
      >
        🛩️
      </button>
    </div>

    <div v-if="showTimeline" class="globe-timeline-bar">
      <button type="button" class="timeline-play-btn" @click="toggleTimelinePlay">
        {{ timelinePlaying ? '⏸' : '▶' }}
      </button>
      <input
        type="range"
        min="0"
        :max="TIMELINE_WINDOW_HOURS"
        step="1"
        v-model.number="timelineValue"
        class="timeline-slider"
      />
      <span class="timeline-label">{{ timelineLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.globe-view-wrapper {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
}

.globe-view {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  cursor: grab;
}

.globe-view:active {
  cursor: grabbing;
}

.globe-view.safe-mode {
  filter: contrast(0.95);
}

.globe-layer-dock {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.globe-layer-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(10, 14, 25, 0.55);
  color: rgba(255, 255, 255, 0.55);
  font-size: 15px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
  opacity: 0.75;
}

.globe-layer-btn:hover {
  opacity: 1;
}

.globe-layer-btn.active {
  background: rgba(58, 123, 213, 0.5);
  border-color: rgba(120, 180, 255, 0.6);
  opacity: 1;
}

.globe-layer-btn.stale {
  position: relative;
}

.globe-layer-btn.stale::after {
  content: '';
  position: absolute;
  top: -1px;
  right: -1px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff9900;
  border: 1px solid rgba(10, 14, 25, 0.85);
}

.globe-timeline-bar {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 14px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(10, 14, 25, 0.65);
  backdrop-filter: blur(4px);
  width: min(420px, 80%);
}

.timeline-play-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: none;
  background: rgba(58, 123, 213, 0.6);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.timeline-slider {
  flex: 1;
  accent-color: #3a7bd5;
  cursor: pointer;
}

.timeline-label {
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  white-space: nowrap;
  min-width: 62px;
  text-align: right;
}
</style>
