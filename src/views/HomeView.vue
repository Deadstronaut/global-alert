<script setup>
import { onMounted, watch } from 'vue'
import GlobeView from '@/components/GlobeView.vue'
import MapView from '@/components/MapView.vue'
import SidebarPanel from '@/components/SidebarPanel.vue'
import AlertPanel from '@/components/AlertPanel.vue'
import StatsOverlay from '@/components/StatsOverlay.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

// Recalculate nearby threats when data or location changes
watch(
  () => [disasterStore.allEvents, geoStore.userLat],
  () => {
    if (geoStore.hasLocation) {
      geoStore.calculateNearbyThreats(disasterStore.allEvents)
    }
  },
  { deep: true },
)

onMounted(() => {
  // Load cached data first for instant display
  disasterStore.loadFromCache()

  // Then fetch fresh data
  disasterStore.fetchAll()

  // Start polling
  disasterStore.startPolling()
})
</script>

<template>
  <div class="home-view">
    <!-- 3D Globe -->
    <div class="globe-container" :class="{ 'transitioning-out': uiStore.viewMode === 'map' }">
      <GlobeView
        v-if="uiStore.viewMode === 'globe' || uiStore.transitionState === 'transitioning'"
      />
    </div>

    <!-- 2D Map -->
    <div class="map-container" :class="{ active: uiStore.viewMode === 'map' }">
      <MapView v-if="uiStore.viewMode === 'map'" />
    </div>

    <!-- UI Overlays -->
    <SidebarPanel />
    <StatsOverlay />
    <AlertPanel />
    <SettingsPanel />

    <!-- Mobile sidebar toggle button -->
    <button
      class="mobile-menu-btn glass-panel btn-icon"
      @click="uiStore.toggleSidebar()"
      v-if="!uiStore.sidebarOpen"
    >
      ☰
    </button>
  </div>
</template>

<style scoped>
.home-view {
  width: 100%;
  height: 100%;
  position: relative;
}

.mobile-menu-btn {
  position: fixed;
  bottom: var(--space-lg);
  left: var(--space-md);
  z-index: 95;
  width: 48px;
  height: 48px;
  font-size: 1.5rem;
  color: var(--color-text-primary);
  display: none;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}
</style>
