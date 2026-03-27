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
import { useI18n } from 'vue-i18n'
import EmergencyPopup from '@/components/EmergencyPopup.vue'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const { locale } = useI18n()

// Watch for locale changes to handle RTL and set lang attribute
watch(
  () => locale.value,
  (newLocale) => {
    document.documentElement.setAttribute('dir', newLocale === 'ar' ? 'rtl' : 'ltr')
    document.documentElement.setAttribute('lang', newLocale)
  },
  { immediate: true },
)

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

// Watch for critical threats nearby to trigger the emergency popup
watch(
  () => geoStore.nearbyThreats,
  (threats) => {
    if (threats && threats.length > 0) {
      const criticalThreat = threats.find((t) => t.severity === 'critical' || t.severity === 'high')
      if (criticalThreat && !uiStore.emergencyPopupOpen) {
        uiStore.activeEmergency = criticalThreat
        uiStore.emergencyPopupOpen = true
      }
    }
  },
  { immediate: true },
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
    <EmergencyPopup />

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

.globe-container {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.globe-container.transitioning-out {
  opacity: 0;
  pointer-events: none;
}

.map-container {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: none;
}

.map-container.active {
  display: block;
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
