<script setup>
import { computed } from 'vue'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useUIStore } from '@/stores/ui.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const geoStore = useGeolocationStore()
const uiStore = useUIStore()

const threats = computed(() => geoStore.nearbyThreats)

function viewOnMap(threat) {
  uiStore.transitionToMap(threat.lat, threat.lng, 10)
}

function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${Math.round(km)} km`
}

function getSeverityLabel(severity) {
  return t(`severity.${severity}`)
}
</script>

<template>
  <transition name="slide-right">
    <div v-if="uiStore.alertPanelOpen" class="alert-panel glass-panel">
      <div class="alert-header">
        <h3 class="alert-title">⚠️ {{ t('alerts.title') }}</h3>
        <button class="btn-icon btn-ghost" @click="uiStore.toggleAlertPanel()">✕</button>
      </div>

      <div class="alert-list" v-if="threats.length > 0">
        <div
          v-for="threat in threats"
          :key="threat.id"
          class="alert-card"
          :class="`alert-${threat.severity}`"
          @click="viewOnMap(threat)"
        >
          <div class="alert-card-header">
            <span class="severity-dot" :class="threat.severity"></span>
            <span class="alert-type-icon">{{ threat.icon }}</span>
            <span class="alert-distance">{{ formatDistance(threat.distance) }}</span>
          </div>

          <h4 class="alert-card-title">{{ threat.title }}</h4>
          <p class="alert-card-desc">{{ threat.description }}</p>

          <div class="alert-card-meta">
            <span class="meta-severity">{{ getSeverityLabel(threat.severity) }}</span>
            <span class="meta-source">{{ threat.source }}</span>
          </div>
        </div>
      </div>

      <div class="alert-empty" v-else>
        <p>✅ {{ t('alerts.noThreats') }}</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.alert-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 340px;
  max-width: 90%;
  height: 100vh;
  z-index: var(--z-alerts);
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  border-radius: 0;
  overflow-y: auto;
}

.alert-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--glass-border);
  margin-bottom: var(--space-md);
}

.alert-title {
  font-size: 1rem;
  font-weight: 700;
}

.alert-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.alert-card {
  padding: var(--space-md);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border);
  cursor: pointer;
  transition: all var(--transition-normal);
}

.alert-card:hover {
  background: rgba(255, 255, 255, 0.06);
  transform: translateX(-4px);
}

.alert-critical {
  border-left: 3px solid var(--color-critical);
}

.alert-high {
  border-left: 3px solid var(--color-high);
}

.alert-moderate {
  border-left: 3px solid var(--color-moderate);
}

.alert-low {
  border-left: 3px solid var(--color-low);
}

.alert-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: 6px;
}

.alert-type-icon {
  font-size: 1rem;
}

.alert-distance {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-info);
}

.alert-card-title {
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 4px;
}

.alert-card-desc {
  font-size: 0.7rem;
  color: var(--color-text-secondary);
  line-height: 1.4;
  margin-bottom: 8px;
}

.alert-card-meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: var(--color-text-muted);
}

.meta-severity {
  font-weight: 600;
  text-transform: uppercase;
}

.alert-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  color: var(--color-text-secondary);
  text-align: center;
}

/* Slide transition */
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    transform var(--transition-slow),
    opacity var(--transition-slow);
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

@media (max-width: 768px) {
  .alert-panel {
    width: 100%;
    max-width: 100%;
  }
}
</style>
