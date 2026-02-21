<script setup>
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { getSeverityHex } from '@/services/adapters/DisasterEvent.js'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

const globeContainer = ref(null)
let globeInstance = null
let animationId = null

// Dynamic texture selection based on device
function getTextureUrl() {
  const isMobile = window.innerWidth <= 768 || navigator.hardwareConcurrency <= 4
  // Use free NASA Blue Marble textures
  if (isMobile) {
    return '/textures/earth-blue-marble.jpg'
  }
  return '/textures/earth-blue-marble.jpg'
}

async function initGlobe() {
  if (!globeContainer.value) return

  const Globe = (await import('globe.gl')).default

  globeInstance = Globe()
    .globeImageUrl(getTextureUrl())
    .bumpImageUrl('/textures/earth-topology.png')
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
    .ringRepeatPeriod(2000)
    .ringColor((d) => () => getSeverityHex(d.severity))
    // Labels
    .labelLat((d) => d.lat)
    .labelLng((d) => d.lng)
    .labelText((d) => d.title)
    .labelSize(0.5)
    .labelColor(() => 'rgba(255, 255, 255, 0.75)')
    .labelResolution(2)
    .labelsData([])
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

  const events = disasterStore.allEvents

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
    // Clear normal markers
    globeInstance.pointsData([])
    globeInstance.ringsData([])
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

    // Rings only for critical/high severity
    const criticalEvents = events.filter((e) => e.severity === 'critical' || e.severity === 'high')
    globeInstance.ringsData(criticalEvents)

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

function handleResize() {
  if (globeInstance && globeContainer.value) {
    globeInstance.width(globeContainer.value.clientWidth).height(globeContainer.value.clientHeight)
  }
}

// Watch for data changes
watch(
  () => disasterStore.allEvents,
  () => {
    updateGlobeData()
  },
  { deep: true },
)

// Watch for location changes
watch(
  () => geoStore.userCoords,
  () => {
    updateGlobeData()
  },
  { deep: true },
)

// Watch for heatmap/hexbin toggle
watch(
  () => [uiStore.showHeatmap, uiStore.showHexbins],
  () => {
    updateGlobeData()
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

onMounted(async () => {
  await nextTick()
  await initGlobe()
  updateGlobeData()

  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (animationId) cancelAnimationFrame(animationId)
  if (globeInstance) {
    if (typeof globeInstance._destructor === 'function') {
      globeInstance._destructor()
    }
  }
})
</script>

<template>
  <div ref="globeContainer" class="globe-view" :class="{ 'safe-mode': uiStore.safeMode }"></div>
</template>

<style scoped>
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
</style>
