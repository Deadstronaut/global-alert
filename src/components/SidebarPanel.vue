<script setup>
import { computed } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const isGlobeMode = computed(() => uiStore.viewMode === 'globe')

const disasterTypes = [
  { key: 'earthquake', icon: '🔴', cssClass: 'btn-earthquake' },
  { key: 'wildfire', icon: '🔥', cssClass: 'btn-wildfire' },
  { key: 'flood', icon: '🌊', cssClass: 'btn-flood' },
  { key: 'drought', icon: '☀️', cssClass: 'btn-drought' },
]

function handleLocate() {
  geoStore.requestLocation().then(() => {
    if (geoStore.hasLocation) {
      geoStore.calculateNearbyThreats(disasterStore.allEvents)
      uiStore.toggleAlertPanel()
    }
  })
}

function handleViewModeSwitch(event) {
  const wantsGlobe = event.target.checked
  if (wantsGlobe) {
    uiStore.transitionToGlobe()
    return
  }
  uiStore.transitionToMap(20, 30, 3)
}
</script>

<template>
  <aside
    class="sidebar glass-panel"
    :class="{
      'sidebar-open': uiStore.sidebarOpen,
      'sidebar-collapsed': uiStore.sidebarCollapsed,
    }"
  >
    <!-- Header -->
    <div class="sidebar-header">
      <div class="sidebar-brand">
        <span class="brand-icon">🌍</span>
        <div class="brand-text" v-if="!uiStore.sidebarCollapsed">
          <h1 class="brand-title">GEWS</h1>
          <p class="brand-subtitle">{{ t('app.subtitle') }}</p>
        </div>
      </div>

      <button
        class="btn-icon btn-ghost sidebar-toggle"
        @click="uiStore.toggleSidebar()"
        :title="uiStore.sidebarCollapsed ? 'Expand' : 'Collapse'"
      >
        {{ uiStore.sidebarCollapsed ? '→' : '←' }}
      </button>
    </div>

    <!-- Disaster Toggles -->
    <div class="sidebar-section" v-if="!uiStore.sidebarCollapsed">
      <h3 class="section-title">{{ t('sidebar.disasterToggles') }}</h3>

      <div class="disaster-toggles">
        <button
          v-for="dtype in disasterTypes"
          :key="dtype.key"
          class="btn disaster-toggle"
          :class="[dtype.cssClass, { active: disasterStore.isLayerActive(dtype.key) }]"
          @click="disasterStore.toggleLayer(dtype.key)"
        >
          <span class="toggle-icon">{{ dtype.icon }}</span>
          <span class="toggle-label">{{ t(`disasters.${dtype.key}`) }}</span>
          <span
            class="badge"
            :class="{
              'badge-critical': disasterStore.totalCount[dtype.key] > 50,
              'badge-warning': disasterStore.totalCount[dtype.key] > 10,
              'badge-info': disasterStore.totalCount[dtype.key] <= 10,
            }"
          >
            {{ disasterStore.totalCount[dtype.key] }}
          </span>
        </button>
      </div>
    </div>

    <!-- Collapsed icons only -->
    <div class="sidebar-icons-only" v-if="uiStore.sidebarCollapsed">
      <button
        v-for="dtype in disasterTypes"
        :key="dtype.key"
        class="btn-icon"
        :class="[dtype.cssClass, { active: disasterStore.isLayerActive(dtype.key) }]"
        @click="disasterStore.toggleLayer(dtype.key)"
        :title="t(`disasters.${dtype.key}`)"
      >
        {{ dtype.icon }}
      </button>
    </div>

    <!-- Severity Legend -->
    <div class="sidebar-section" v-if="!uiStore.sidebarCollapsed">
      <h3 class="section-title">{{ t('sidebar.legend') }}</h3>
      <div class="legend">
        <div class="legend-item">
          <span class="severity-dot critical"></span>
          <span>{{ t('severity.critical') }}</span>
        </div>
        <div class="legend-item">
          <span class="severity-dot high"></span>
          <span>{{ t('severity.high') }}</span>
        </div>
        <div class="legend-item">
          <span class="severity-dot moderate"></span>
          <span>{{ t('severity.moderate') }}</span>
        </div>
        <div class="legend-item">
          <span class="severity-dot low"></span>
          <span>{{ t('severity.low') }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="sidebar-actions" v-if="!uiStore.sidebarCollapsed">
      <label class="switch-3d-cyan">
        <input
          type="checkbox"
          class="switch-input"
          :checked="isGlobeMode"
          @change="handleViewModeSwitch"
        />
        <div class="switch-track">
          <span class="track-text text-3d">View 3D</span>
          <span class="track-text text-2d">View 2D</span>
          <div class="switch-knob">
            <div class="cube">
              <div class="face front"></div>
              <div class="face back"></div>
              <div class="face right"></div>
              <div class="face left"></div>
              <div class="face top"></div>
              <div class="face bottom"></div>
            </div>
          </div>
        </div>
      </label>

      <button class="btn btn-primary sidebar-action-btn" @click="handleLocate">
        📍 {{ geoStore.isTracking ? t('sidebar.myLocation') : t('sidebar.locating') }}
      </button>

      <button
        class="btn btn-ghost sidebar-action-btn"
        @click="disasterStore.fetchAll()"
        :disabled="disasterStore.isLoading"
      >
        🔄 {{ t('app.refreshAll') }}
      </button>

      <button class="btn btn-ghost sidebar-action-btn" @click="uiStore.toggleSettings()">
        ⚙️ {{ t('app.settings') }}
      </button>
    </div>

    <!-- Last Updated -->
    <div class="sidebar-footer" v-if="!uiStore.sidebarCollapsed && disasterStore.lastUpdated">
      <span class="footer-text">
        {{ t('app.lastUpdated') }}:
        {{ new Date(disasterStore.lastUpdated).toLocaleTimeString('tr-TR') }}
      </span>
      <span class="footer-sources">
        {{ disasterStore.sourcesOnline }}/4 {{ t('stats.sourcesOnline') }}
      </span>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: var(--sidebar-width);
  height: 100vh;
  z-index: var(--z-sidebar);
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  gap: var(--space-md);
  border-radius: 0;
  border-left: none;
  border-top: none;
  border-bottom: none;
  overflow-y: auto;
  transition:
    width 0.35s ease,
    transform 0.35s ease,
    opacity 0.25s ease,
    box-shadow 0.35s ease;
}

.sidebar-collapsed {
  width: var(--sidebar-collapsed);
  padding: var(--space-sm);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--glass-border);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.brand-icon {
  font-size: 1.5rem;
}

.brand-title {
  font-size: 1.1rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  color: var(--color-text-primary);
  line-height: 1;
}

.brand-subtitle {
  font-size: 0.6rem;
  color: var(--color-text-muted);
  margin-top: 2px;
  white-space: nowrap;
}

.sidebar-toggle {
  font-size: 0.8rem;
  opacity: 0.6;
}

.sidebar-toggle:hover {
  opacity: 1;
}

.sidebar-section,
.sidebar-actions,
.sidebar-footer,
.sidebar-icons-only {
  transition:
    opacity 0.25s ease,
    transform 0.3s ease;
}

.sidebar-collapsed .sidebar-icons-only {
  transform: translateY(4px);
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.section-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
}

.disaster-toggles {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.disaster-toggle {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 10px var(--space-md);
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  font-weight: 500;
  transition: all var(--transition-normal);
  width: 100%;
  text-align: left;
  justify-content: flex-start;
}

.toggle-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.toggle-label {
  flex: 1;
}

.legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.sidebar-icons-only {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  align-items: center;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: auto;
}

.sidebar-action-btn {
  width: 100%;
  justify-content: center;
  font-size: 0.8rem;
}
.switch-3d-cyan {
  --w: 110px;
  --h: 40px;
  --knob-size: 20px;
  --offset: 10px;
  --cyan: #00ffff;
  --white-glow: #ffffff;
  --bg-off: #1a2a2a;
  --bg-on: #0f0f1a;
  --half-size: calc(var(--knob-size) / 2);
  position: relative;
  display: inline-block;
  width: var(--w);
  height: var(--h);
  cursor: pointer;
}

.switch-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-track {
  position: absolute;
  inset: 0;
  background-color: var(--bg-off);
  border-radius: var(--h);
  border: 1px solid #444;
  transition: all 0.5s ease;
  overflow: hidden;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
}

.track-text {
  position: absolute;
  font-family: Arial, sans-serif;
  font-size: 13px;
  font-weight: 800;
  color: var(--white-glow);
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.8);
  transition:
    opacity 0.4s ease,
    transform 0.4s ease;
  pointer-events: none;
  white-space: nowrap;
}

.text-3d {
  left: 40px;
  opacity: 1;
}

.text-2d {
  left: 15px;
  opacity: 0;
  transform: translateX(-10px);
}

.switch-knob {
  position: absolute;
  top: var(--offset);
  left: var(--offset);
  width: var(--knob-size);
  height: var(--knob-size);
  perspective: 1200px;
  pointer-events: none;
  transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  z-index: 2;
}

.cube {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  animation: spin 3s infinite linear;
}

.face {
  position: absolute;
  width: 100%;
  height: 100%;
  background: rgba(0, 255, 255, 0.1);
  border: 1px solid var(--cyan);
  box-shadow:
    0 0 4px var(--cyan),
    inset 0 0 4px var(--cyan);
  opacity: 0.8;
  backface-visibility: visible;
  transition: all 0.5s ease;
}

.front {
  transform: translateZ(var(--half-size));
}

.back {
  transform: rotateY(180deg) translateZ(var(--half-size));
}

.right {
  transform: rotateY(90deg) translateZ(var(--half-size));
}

.left {
  transform: rotateY(-90deg) translateZ(var(--half-size));
}

.top {
  transform: rotateX(90deg) translateZ(var(--half-size));
}

.bottom {
  transform: rotateX(-90deg) translateZ(var(--half-size));
}

.switch-input:checked ~ .switch-track .switch-knob {
  transform: translateX(calc(var(--w) - var(--knob-size) - (var(--offset) * 2)));
}

.switch-input:checked ~ .switch-track .text-3d {
  opacity: 0;
  transform: translateX(10px);
}

.switch-input:checked ~ .switch-track .text-2d {
  opacity: 1;
  transform: translateX(0);
}

.switch-input:checked ~ .switch-track {
  background-color: var(--bg-on);
  border-color: var(--cyan);
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.3);
}

.switch-input:checked ~ .switch-track .face {
  background: rgba(0, 255, 255, 0.15);
  box-shadow:
    0 0 8px var(--cyan),
    inset 0 0 8px var(--cyan);
}

@keyframes spin {
  0% {
    transform: rotateX(0deg) rotateY(0deg);
  }
  100% {
    transform: rotateX(360deg) rotateY(360deg);
  }
}

.sidebar-footer {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.footer-text {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

.footer-sources {
  font-size: 0.6rem;
  color: var(--color-info);
}

/* Mobile */
@media (max-width: 768px) {
  .sidebar {
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-width: none;
    height: min(56vh, 460px);
    border-radius: 18px 18px 0 0;
    border: 1px solid var(--glass-border);
    border-bottom: none;
    transform: translateY(102%);
    padding-bottom: calc(var(--space-md) + 8px);
    box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.35);
  }

  .sidebar.sidebar-open {
    transform: translateY(0);
  }

  .sidebar-collapsed {
    width: 100%;
    padding: var(--space-md);
  }
}
</style>
