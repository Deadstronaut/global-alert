<script setup>
import { watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
const GlobeView = defineAsyncComponent(() => import('@/components/GlobeView.vue'))
const MapView = defineAsyncComponent(() => import('@/components/MapView.vue'))
import SidebarPanel from '@/components/SidebarPanel.vue'
import AlertPanel from '@/components/AlertPanel.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import EmergencyPopup from '@/components/EmergencyPopup.vue'
import { loadConfig } from '@/configs/index.js'
import { useAuthStore } from '@/stores/auth.js'

const route = useRoute()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const authStore = useAuthStore()
const { locale } = useI18n()

function applyCountryConfig(countryCode) {
  const config = loadConfig(countryCode)
  uiStore.setCountryConfig(config)
  // Super admin sees all data regardless of country URL
  disasterStore.activeBbox = (config && !authStore.isSuperAdmin) ? config.bbox : null
  if (config) {
    locale.value = config.defaultLocale
    uiStore.transitionToMap(config.centerLat, config.centerLng, config.defaultZoom)
  }
}

watch(
  () => route.params.countryCode,
  (code) => applyCountryConfig(code || null),
  { immediate: true }
)

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

// startWebSocket App.vue'da çağrılıyor
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
    <AlertPanel />

    <!-- Settings: on the map view, MapView.vue embeds this as a flip-card
         face inside its own impact-panel-dock instead of floating on top of
         it (same dock, same position/colors — see MapView.vue's dock-flip).
         Render the standalone version here only where that dock doesn't
         exist (globe view) — same panel styling, just a plain slide-in
         since there's no other face to flip to. -->
    <Transition name="standalone-settings-dock-slide">
      <div
        v-if="uiStore.settingsPanelOpen && uiStore.viewMode !== 'map'"
        class="standalone-settings-dock"
      >
        <SettingsPanel />
      </div>
    </Transition>

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

/* Same dock geometry/background as .impact-panel-dock + .impact-panel in
   MapView.vue — kept visually identical even though this instance has no
   flip partner (no impact-analysis dock exists outside the map view). */
.standalone-settings-dock {
  position: fixed;
  top: 0;
  right: 0;
  width: 320px;
  max-width: 90vw;
  height: 100vh;
  z-index: var(--z-alerts);
  background: rgba(15, 17, 23, 0.92);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.standalone-settings-dock-slide-enter-active,
.standalone-settings-dock-slide-leave-active {
  transition:
    transform var(--transition-slow),
    opacity var(--transition-slow);
}

.standalone-settings-dock-slide-enter-from,
.standalone-settings-dock-slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
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
