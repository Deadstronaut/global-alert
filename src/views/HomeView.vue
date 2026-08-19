<script setup>
import { watch, computed, defineAsyncComponent, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
const GlobeView = defineAsyncComponent(() => import('@/components/GlobeView.vue'))
const MapView = defineAsyncComponent(() => import('@/components/MapView.vue'))
import AlertPanel from '@/components/AlertPanel.vue'
import StarfieldBackground from '@/components/StarfieldBackground.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import DashboardPlaceholder from '@/components/DashboardPlaceholder.vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'
import EmergencyPopup from '@/components/EmergencyPopup.vue'
import { loadConfig } from '@/configs/index.js'
import { useAuthStore } from '@/stores/auth.js'

const route = useRoute()
const router = useRouter()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const authStore = useAuthStore()
const { locale, t } = useI18n()

// spec 069 follow-up: moved from AppHeader.vue — same activeCountryConfig
// source, same clear action (navigate back to '/'), just repositioned to
// bottom-center over the map/globe (matches MapView.vue's own
// .country-badge visual position/style for a country picked by clicking
// the map, per request) instead of living in the header.
const activeCountryConfig = computed(() => uiStore.activeCountryConfig)

// 2026-08-19 bugfix — see MapView.vue's defineExpose comment: this reaches
// the REAL clearCountrySelection() (feature-state dimming reset, focus
// mode off, flyTo the actually-captured defaultCameraState) instead of
// re-implementing a simplified guess of it here.
const mapViewRef = ref(null)

function getFlagEmoji(code) {
  return code.toUpperCase().split('').map((c) => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('')
}

// 2026-08-19 user report: this badge sat centered on the FULL screen
// (left: 50%) — fine until the Etki Analizi dock (MapView.vue's
// .impact-panel-dock) got a wide-drawer mode, after which the badge no
// longer lined up with the map's actual visible center like the map's
// other floating controls (radar/forecast/basemap) already do via
// --map-control-offset. This badge lives in HomeView.vue though, a
// sibling of MapView.vue, so it can't inherit that scoped CSS variable —
// mirrors the same three width values (352px open / 48px collapsed /
// min(760px,70vw) expanded) from MapView.vue's own .map-view-wrapper
// instead. Keep these in sync if that panel's widths ever change.
const impactPanelWidthPx = computed(() => {
  if (uiStore.viewMode !== 'map') return 0
  if (uiStore.impactPanelCollapsed) return 48
  if (uiStore.impactPanelExpanded) return Math.min(760, window.innerWidth * 0.7)
  return 352
})
const countryBadgeStyle = computed(() => ({
  left: `calc(50% - ${impactPanelWidthPx.value / 2}px)`,
}))

// 2026-08-19 user report: clearing the country filter used to fly the
// camera back out to a default world view — lost somewhere along the way,
// since applyCountryConfig's null branch only ever clears state, it never
// resets the camera. router.push('/') alone doesn't move the map at all
// if the URL was already '/' in a non-country-scoped session. Restoring
// the same default world view AppHeader.vue's own 2D/3D toggle uses.
//
// 2026-08-19 bugfix (round 2): firing router.push('/') and
// transitionToMap() in the same tick raced two heavy operations (route
// navigation + re-render vs. a camera flyTo animation) against each other
// on the main thread — user-reported as "bazen rozet kapanmıyor, bazen
// zoom out sonuna kadar gitmiyor, takılmalar oluyor" (intermittent,
// jank-dependent — a real race, not a logic bug that fails every time).
// router.push() returns a Promise; awaiting it first guarantees the route
// change (and the badge-clearing watch(route.params.countryCode) it
// triggers) fully settles BEFORE the camera animation starts, instead of
// the two competing for the same frame.
//
// 2026-08-19 bugfix (round 3): a hardcoded transitionToMap(20, 30, 3)
// isn't the same as "the real starting position" and never resets the
// country-polygon dimming/highlight feature-state at all — that's exactly
// what MapView.vue's own clearCountrySelection() already does correctly
// (captured defaultCameraState + feature-state cleanup), reachable now via
// mapViewRef ("ülke hâlâ yeşilimsi duruyor" — user-reported). Falls back
// to the simplified version only when MapView isn't mounted (globe view).
async function clearCountryFilter() {
  if (mapViewRef.value?.clearCountrySelection) {
    mapViewRef.value.clearCountrySelection() // also does its own router.push('/') + real camera reset
    return
  }
  await router.push('/')
  uiStore.transitionToMap(20, 30, 3)
}

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
    <!-- Starry sky behind the 3D globe -->
    <StarfieldBackground
      class="starfield-container"
      v-if="uiStore.viewMode === 'globe' || uiStore.transitionState === 'transitioning'"
    />

    <!-- 3D Globe -->
    <div class="globe-container" :class="{ 'transitioning-out': uiStore.viewMode === 'map' }">
      <GlobeView
        v-if="uiStore.viewMode === 'globe' || uiStore.transitionState === 'transitioning'"
      />
    </div>

    <!-- 2D Map -->
    <div class="map-container" :class="{ active: uiStore.viewMode === 'map' }">
      <MapView v-if="uiStore.viewMode === 'map'" ref="mapViewRef" />
    </div>

    <!-- UI Overlays -->
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

    <DashboardPlaceholder />

    <EmergencyPopup />

    <Transition name="country-filter-badge">
      <div v-if="activeCountryConfig" class="country-filter-badge" :style="countryBadgeStyle">
        <span class="country-filter-badge-flag">{{ getFlagEmoji(activeCountryConfig.countryCode) }}</span>
        <div class="country-filter-badge-info">
          <span class="country-filter-badge-name">{{ activeCountryConfig.nameEn }}</span>
          <span class="country-filter-badge-label">{{ t('sidebar.countryFilterActive') }}</span>
        </div>
        <button class="country-filter-badge-clear" type="button" @click="clearCountryFilter" :title="t('sidebar.backToGlobal')">✕</button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.home-view {
  width: 100%;
  /* spec 069 follow-up: was 100% (of .main-layout-content, itself sized by
     flexbox) — live-testing showed the WebGL canvases nested inside this
     (globe.gl in GlobeView.vue, MapLibre in MapView.vue) keep an internal
     cached width/height that doesn't reliably stay in sync with that
     percentage chain (same root cause already fixed once via
     containerResizeObserver — this is the same class of bug surfacing
     again, one level up). Using the SAME measured pixel values that fixed
     the header/footer-anchored overlays (--shell-header-height /
     --shell-footer-height, set by MainLayout.vue's ResizeObserver) removes
     the percentage cascade from the equation entirely instead of trusting
     it to resolve the same as it does in isolation. */
  height: calc(100dvh - var(--shell-header-height, 0px) - var(--shell-footer-height, 0px));
  position: relative;
}

.starfield-container {
  position: absolute;
  inset: 0;
  z-index: 0;
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

/* spec 069 follow-up: same pill/position language as MapView.vue's own
   .country-badge (a different feature — a country clicked directly on the
   map — kept separate on purpose) so the two read as one consistent
   pattern: a route-level "country filter" indicator, bottom-center, above
   both the globe and the 2D map. */
.country-filter-badge {
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px 8px 18px;
  background: var(--glass-bg, rgba(15, 17, 23, 0.85));
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--glass-border);
  border-radius: 100px;
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.country-filter-badge-flag {
  font-size: 1.1rem;
  line-height: 1;
}

.country-filter-badge-info {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.country-filter-badge-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-primary);
}

.country-filter-badge-label {
  font-size: 0.6rem;
  opacity: 0.75;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.country-filter-badge-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid transparent;
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-secondary);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.country-filter-badge-clear:hover {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
  transform: rotate(90deg);
}

.country-filter-badge-enter-active,
.country-filter-badge-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.country-filter-badge-enter-from,
.country-filter-badge-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
