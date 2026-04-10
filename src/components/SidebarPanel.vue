<script setup>
import { computed, ref } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const isGlobeMode = computed(() => uiStore.viewMode === 'globe')
const isDarkMode = computed(() => uiStore.darkMode)
const isMobile = computed(() => typeof window !== 'undefined' && window.innerWidth <= 768)

// Force expand on mobile to avoid unreadable "icons-only" bottom sheet
const isCollapsed = computed(() => uiStore.sidebarCollapsed && !isMobile.value)

const disasterTypes = [
  {
    key: 'earthquake',
    icon: '⛰️',
    cssClass: 'btn-earthquake',
    labelKey: 'stats.activeEarthquakes',
  },
  { key: 'wildfire', icon: '🔥', cssClass: 'btn-wildfire', labelKey: 'stats.activeWildfires' },
  { key: 'flood', icon: '🌊', cssClass: 'btn-flood', labelKey: 'stats.activeFloods' },
  { key: 'drought', icon: '🔴', cssClass: 'btn-drought', labelKey: 'stats.activeDroughts' },
  { key: 'food_security', icon: '🌾', cssClass: 'btn-food', labelKey: 'stats.activeFoodSecurity' },
]

const severityLevels = ['critical', 'high', 'moderate', 'low', 'minimal']
const timeRanges = ['10 Dakika', '30 Dakika', '2 Saat', '6 Saat', '12 Saat', '24 Saat']
const selectedTimeRange = ref('24 Saat')
const today = new Date().toISOString().slice(0, 10)
const rangeStartDate = ref(today)
const rangeEndDate = ref('')
const calendarPickValue = ref(today)

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

function handleThemeSwitch(event) {
  uiStore.darkMode = event.target.checked
}

function getSourceStatusClass(count) {
  if (count >= 8) return 'source-level-4'
  if (count >= 6) return 'source-level-3'
  if (count >= 4) return 'source-level-2'
  if (count >= 1) return 'source-level-1'
  return 'source-level-0'
}

function selectTimeRange(rangeLabel) {
  const map = {
    '10 Dakika': 10 / 60,
    '30 Dakika': 0.5,
    '2 Saat': 2,
    '6 Saat': 6,
    '12 Saat': 12,
    '24 Saat': 24,
  }

  const hours = map[rangeLabel] || 24
  disasterStore.selectedTimeRange = hours
  selectedTimeRange.value = rangeLabel

  // Selecting a quick range should logically clear the custom calendar range
  // to avoid confusion, and reset back to "now" focused polling.
  rangeStartDate.value = today
  rangeEndDate.value = ''
  calendarPickValue.value = today

  // Reset store to default "poll" mode without specific day boundaries
  disasterStore.startDate = null
  disasterStore.endDate = null
  disasterStore.refreshAll()
}

function handleSingleCalendarPick(event) {
  const picked = event.target.value
  if (!picked) return

  // Start a new selection cycle if there is no active range yet
  // or an existing range is already complete.
  if (!rangeStartDate.value || rangeEndDate.value) {
    rangeStartDate.value = picked
    rangeEndDate.value = ''
    calendarPickValue.value = picked
    return
  }

  // Complete the range on the second pick.
  if (picked < rangeStartDate.value) {
    rangeEndDate.value = rangeStartDate.value
    rangeStartDate.value = picked
  } else {
    rangeEndDate.value = picked
  }
  calendarPickValue.value = picked
  selectedTimeRange.value = '' // Clear quick range label when using calendar
}

const selectedRangeLabel = computed(() => {
  if (!rangeStartDate.value) return 'Tarih seçin'
  if (!rangeEndDate.value || rangeEndDate.value === rangeStartDate.value)
    return rangeStartDate.value
  return `${rangeStartDate.value} - ${rangeEndDate.value}`
})

import { watch } from 'vue'

watch([rangeStartDate, rangeEndDate], ([start, end]) => {
  if (!start) return

  const startDateObj = new Date(start)
  startDateObj.setHours(0, 0, 0, 0)
  disasterStore.startDate = startDateObj.toISOString()

  let endDateObj = null
  if (end) {
    endDateObj = new Date(end)
  } else {
    // Single day selected, use that for the end date as well (end of the day)
    endDateObj = new Date(start)
  }

  endDateObj.setHours(23, 59, 59, 999)
  disasterStore.endDate = endDateObj.toISOString()

  // Auto-fetch using the new date boundaries
  disasterStore.refreshAll()
})
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
        <div class="brand-text" v-if="!isCollapsed">
          <h1 class="brand-title">GEWS</h1>
          <p class="brand-subtitle">{{ t('app.subtitle') }}</p>
        </div>
      </div>
      <button
        class="btn-icon btn-ghost sidebar-toggle"
        @click="uiStore.toggleSidebar()"
        :title="isCollapsed ? 'Expand' : 'Collapse'"
      >
        {{ isCollapsed ? '→' : '←' }}
      </button>
    </div>

    <!-- Disaster Toggles -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <h2 class="section-title">{{ t('sidebar.disasterToggles') }}</h2>

      <div class="disaster-toggles">
        <button
          v-for="dtype in disasterTypes"
          :key="dtype.key"
          class="btn disaster-toggle"
          :class="[dtype.cssClass, { active: disasterStore.isLayerActive(dtype.key) }]"
          @click="disasterStore.toggleLayer(dtype.key)"
        >
          <span class="toggle-icon">{{ dtype.icon }}</span>
          <span class="toggle-label">{{ t(dtype.labelKey) }}</span>
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
    <div class="sidebar-icons-only" v-if="isCollapsed">
      <!-- 1) Afet filtreleri -->
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

      <div class="collapsed-divider"></div>

      <!-- 2) Yoğunluk ölçeği -->
      <button
        class="btn-icon collapsed-action severity-mini critical"
        :class="{ inactive: !disasterStore.isSeverityActive('critical') }"
        @click="disasterStore.toggleSeverity('critical')"
        :title="t('severity.critical')"
      >
        ●
      </button>
      <button
        class="btn-icon collapsed-action severity-mini high"
        :class="{ inactive: !disasterStore.isSeverityActive('high') }"
        @click="disasterStore.toggleSeverity('high')"
        :title="t('severity.high')"
      >
        ●
      </button>
      <button
        class="btn-icon collapsed-action severity-mini moderate"
        :class="{ inactive: !disasterStore.isSeverityActive('moderate') }"
        @click="disasterStore.toggleSeverity('moderate')"
        :title="t('severity.moderate')"
      >
        ●
      </button>
      <button
        class="btn-icon collapsed-action severity-mini low"
        :class="{ inactive: !disasterStore.isSeverityActive('low') }"
        @click="disasterStore.toggleSeverity('low')"
        :title="t('severity.low')"
      >
        ●
      </button>

      <div class="collapsed-divider"></div>

      <!-- 3) Zaman aralığı -->
      <button
        v-for="range in timeRanges"
        :key="`mini-${range}`"
        class="btn-icon collapsed-action time-mini"
        :class="{ active: selectedTimeRange === range }"
        @click="selectTimeRange(range)"
        :title="range"
      >
        {{ range.replace(' Saat', 's').replace(' Dakika', 'd') }}
      </button>
      <button class="btn-icon collapsed-action calendar-mini" title="Takvim">📅</button>

      <div class="collapsed-divider"></div>

      <!-- 4) 2D/3D ve Dark/Light -->
      <button
        class="btn-icon collapsed-action"
        :title="isGlobeMode ? 'View 2D' : 'View 3D'"
        @click="isGlobeMode ? uiStore.transitionToMap(20, 30, 3) : uiStore.transitionToGlobe()"
      >
        {{ isGlobeMode ? '🗺️' : '🌍' }}
      </button>
      <button
        class="btn-icon collapsed-action"
        :title="isDarkMode ? 'Dark Mode' : 'Light Mode'"
        @click="uiStore.darkMode = !uiStore.darkMode"
      >
        {{ isDarkMode ? '🌙' : '☀️' }}
      </button>

      <div class="collapsed-divider"></div>

      <!-- 5) Kalan seçenekler -->
      <button
        class="btn-icon collapsed-action"
        @click="handleLocate"
        :title="t('sidebar.myLocation')"
      >
        📍
      </button>
      <button
        class="btn-icon collapsed-action"
        @click="disasterStore.refreshAll()"
        :disabled="disasterStore.isLoading"
        :title="t('app.refreshAll')"
      >
        🔄
      </button>
      <button
        class="btn-icon collapsed-action"
        @click="uiStore.toggleSettings()"
        :title="t('app.settings')"
      >
        ⚙️
      </button>

      <div
        class="collapsed-sources"
        :class="getSourceStatusClass(disasterStore.sourcesOnline)"
        v-if="disasterStore.lastUpdated"
      >
        {{ disasterStore.sourcesOnline }}/10
      </div>
    </div>

    <!-- Severity Legend -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <h2 class="section-title">{{ t('sidebar.legend') }}</h2>
      <div class="legend">
        <button
          v-for="severity in severityLevels"
          :key="severity"
          class="legend-item legend-filter-btn"
          :class="{ inactive: !disasterStore.isSeverityActive(severity) }"
          @click="disasterStore.toggleSeverity(severity)"
        >
          <span class="severity-dot" :class="severity"></span>
          <span>{{ t(`severity.${severity}`) }}</span>
        </button>
      </div>
    </div>

    <!-- Magnitude & Depth Filters -->
    <div class="sidebar-section filter-sliders" v-if="!isCollapsed">
      <div class="filter-row">
        <div class="filter-label">
          <span>BÜYÜKLÜK</span>
          <span class="filter-val accent">{{ disasterStore.minMagnitude > 0 ? `M${disasterStore.minMagnitude}+` : '0+' }}</span>
        </div>
        <input
          type="range"
          min="0" max="9" step="0.5"
          :value="disasterStore.minMagnitude"
          @input="disasterStore.minMagnitude = Number($event.target.value)"
          class="filter-range"
        />
        <div class="filter-ends"><span>0</span><span>9</span></div>
      </div>

      <div class="filter-row">
        <div class="filter-label">
          <span>DERİNLİK</span>
          <span class="filter-val accent">{{ disasterStore.maxDepth === null ? 'TÜMÜ' : `≤${disasterStore.maxDepth} km` }}</span>
        </div>
        <input
          type="range"
          min="0" max="700" step="25"
          :value="disasterStore.maxDepth === null ? 700 : disasterStore.maxDepth"
          @input="disasterStore.maxDepth = Number($event.target.value) >= 700 ? null : Number($event.target.value)"
          class="filter-range"
        />
        <div class="filter-ends"><span>0 km</span><span>25+ km</span></div>
      </div>
    </div>

    <!-- Time Range -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <h2 class="section-title">Zaman Aralığı</h2>
      <div class="time-range-list">
        <button
          v-for="range in timeRanges"
          :key="range"
          class="time-range-btn"
          :class="{ active: selectedTimeRange === range }"
          @click="selectTimeRange(range)"
        >
          {{ range }}
        </button>
      </div>

      <div class="date-filter-card">
        <div class="date-filters">
          <label class="date-label">
            <span>Takvim (Tek Gün / Aralık)</span>
            <input
              type="date"
              class="date-input"
              :value="calendarPickValue"
              @change="handleSingleCalendarPick"
            />
          </label>
          <span class="date-hint">
            1 seçim: tek gün. 2 seçim: aralık. Sonraki seçim yeni aralık başlatır.
          </span>
          <span class="date-range-preview">{{ selectedRangeLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="sidebar-actions" v-if="!isCollapsed">
      <div class="quick-switches">
        <label class="switch-3d-cyan">
          <input
            type="checkbox"
            class="switch-input"
            :checked="isGlobeMode"
            @change="handleViewModeSwitch"
            aria-label="Toggle 3D Globe Mode"
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

        <div class="theme-switch-wrap">
          <span class="theme-mode-label">{{ isDarkMode ? 'Dark Mode' : 'Light Mode' }}</span>
          <label class="theme-switch" for="theme-input">
            <input
              id="theme-input"
              type="checkbox"
              :checked="isDarkMode"
              @change="handleThemeSwitch"
              aria-label="Toggle Dark Mode"
            />
            <div class="theme-slider round">
              <div class="sun-moon">
                <svg id="moon-dot-1" class="moon-dot" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="moon-dot-2" class="moon-dot" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="moon-dot-3" class="moon-dot" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="light-ray-1" class="light-ray" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="light-ray-2" class="light-ray" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="light-ray-3" class="light-ray" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-1" class="cloud-dark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-2" class="cloud-dark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-3" class="cloud-dark" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-4" class="cloud-light" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-5" class="cloud-light" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
                <svg id="cloud-6" class="cloud-light" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="50"></circle>
                </svg>
              </div>
              <div class="stars">
                <svg id="star-1" class="star" viewBox="0 0 20 20">
                  <path
                    d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"
                  ></path>
                </svg>
                <svg id="star-2" class="star" viewBox="0 0 20 20">
                  <path
                    d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"
                  ></path>
                </svg>
                <svg id="star-3" class="star" viewBox="0 0 20 20">
                  <path
                    d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"
                  ></path>
                </svg>
                <svg id="star-4" class="star" viewBox="0 0 20 20">
                  <path
                    d="M 0 10 C 10 10,10 10 ,0 10 C 10 10 , 10 10 , 10 20 C 10 10 , 10 10 , 20 10 C 10 10 , 10 10 , 10 0 C 10 10,10 10 ,0 10 Z"
                  ></path>
                </svg>
              </div>
            </div>
          </label>
        </div>
      </div>

      <button class="btn btn-primary sidebar-action-btn" @click="handleLocate">
        📍
        {{
          geoStore.isTracking
            ? t('sidebar.locating')
            : geoStore.hasLocation
              ? t('sidebar.locationDetected')
              : t('sidebar.myLocation')
        }}
      </button>

      <button
        class="btn btn-ghost sidebar-action-btn"
        @click="disasterStore.refreshAll()"
        :disabled="disasterStore.isLoading"
      >
        🔄 {{ t('app.refreshAll') }}
      </button>

      <button
        class="btn btn-ghost sidebar-action-btn"
        @click="uiStore.showHeatmap = !uiStore.showHeatmap"
      >
        🔥 {{ uiStore.showHeatmap ? 'Heatmap: ON' : 'Heatmap: OFF' }}
      </button>

      <button class="btn btn-ghost sidebar-action-btn" @click="uiStore.toggleSettings()">
        ⚙️ {{ t('app.settings') }}
      </button>
    </div>

    <!-- Last Updated -->
    <div class="sidebar-footer" v-if="!isCollapsed && disasterStore.lastUpdated">
      <span class="footer-text">
        {{ t('app.lastUpdated') }}:
        {{ new Date(disasterStore.lastUpdated).toLocaleTimeString('tr-TR') }}
      </span>
      <span class="footer-sources" :class="getSourceStatusClass(disasterStore.sourcesOnline)">
        {{ disasterStore.sourcesOnline }}/10 {{ t('stats.sourcesOnline') }}
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
  opacity: 0.62;
  filter: saturate(0.65) brightness(0.88);
  background: rgba(255, 255, 255, 0.03);
}

.disaster-toggle.active {
  opacity: 1;
  filter: saturate(1.15) brightness(1.05);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.25),
    0 0 14px rgba(77, 163, 255, 0.18);
}

.sidebar-icons-only .btn-icon {
  opacity: 0.58;
  filter: saturate(0.7);
}

.sidebar-icons-only .btn-icon.active {
  opacity: 1;
  filter: saturate(1.2);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 0 12px rgba(77, 163, 255, 0.18);
}

.toggle-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.toggle-label {
  flex: 1;
}

.legend {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
  border: none;
  background: transparent;
  width: auto;
  text-align: left;
}

.legend-filter-btn {
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  transition:
    background 0.2s ease,
    opacity 0.2s ease,
    transform 0.2s ease;
}

.legend-filter-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.legend-filter-btn.inactive {
  opacity: 0.42;
}

.legend-filter-btn:active {
  transform: scale(0.98);
}

.severity-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

.severity-dot.critical {
  background: var(--color-critical);
  color: var(--color-critical);
}

.severity-dot.high {
  background: var(--color-high);
  color: var(--color-high);
}

.severity-dot.moderate {
  background: var(--color-moderate);
  color: var(--color-moderate);
}

.severity-dot.low {
  background: var(--color-low);
  color: var(--color-low);
}

.severity-dot.minimal {
  background: var(--color-minimal);
  color: var(--color-minimal);
}

.filter-sliders {
  gap: 12px;
}

.filter-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.filter-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}

.filter-val {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.75rem;
}

.filter-val.accent {
  color: var(--color-accent);
}

.filter-range {
  width: 100%;
  accent-color: var(--color-accent);
  cursor: pointer;
}

.filter-ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.6rem;
  color: var(--color-text-muted);
}

.time-range-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.time-range-btn {
  border: 1px solid var(--glass-border);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-secondary);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.time-range-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text-primary);
}

.time-range-btn.active {
  background: rgba(77, 163, 255, 0.2);
  border-color: rgba(77, 163, 255, 0.5);
  color: var(--color-text-primary);
}

.date-filter-card {
  margin-top: 8px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.date-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.68rem;
  color: var(--color-text-muted);
}

.date-input {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--glass-border);
  color: var(--color-text-primary);
  border-radius: 8px;
  padding: 8px;
  font-size: 0.78rem;
  width: 100%;
}

.date-hint {
  font-size: 0.64rem;
  line-height: 1.35;
  color: var(--color-text-muted);
}

.date-range-preview {
  font-size: 0.68rem;
  color: var(--color-text-secondary);
  font-family: var(--font-mono);
}

.sidebar-icons-only {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  align-items: center;
}

.collapsed-divider {
  width: 24px;
  height: 1px;
  background: var(--glass-border);
  margin: 2px 0;
}

.collapsed-action {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.time-mini {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.calendar-mini {
  font-size: 0.9rem;
}

.severity-mini {
  font-size: 14px;
  line-height: 1;
}

.severity-mini.inactive {
  opacity: 0.35;
}

.severity-mini.critical {
  color: var(--color-critical);
}
.severity-mini.high {
  color: var(--color-high);
}
.severity-mini.moderate {
  color: var(--color-moderate);
}
.severity-mini.low {
  color: var(--color-low);
}

.collapsed-sources {
  margin-top: auto;
  padding-top: 8px;
  font-size: 0.62rem;
  font-family: var(--font-mono);
  opacity: 0.95;
}

.source-level-0 {
  color: #8a8f99 !important;
}

.source-level-1 {
  color: #ef4444 !important;
}

.source-level-2 {
  color: #f59e0b !important;
}

.source-level-3 {
  color: #eab308 !important;
}

.source-level-4 {
  color: #22c55e !important;
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

.quick-switches {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--space-sm);
}

.theme-switch-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  min-height: 54px;
}

.theme-mode-label {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  line-height: 1;
  margin: 0;
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

.theme-switch {
  position: relative;
  display: inline-block;
  width: 60px;
  height: 34px;
  flex-shrink: 0;
}

.theme-switch #theme-input {
  opacity: 0;
  width: 0;
  height: 0;
}

.theme-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #2196f3;
  transition: 0.4s;
  z-index: 0;
  overflow: hidden;
}

.sun-moon {
  position: absolute;
  height: 26px;
  width: 26px;
  left: 4px;
  bottom: 4px;
  background-color: yellow;
  transition: 0.4s;
}

#theme-input:checked + .theme-slider {
  background-color: #000;
}

#theme-input:checked + .theme-slider .sun-moon {
  transform: translateX(26px);
  background-color: #fff;
  animation: rotate-center 0.6s ease-in-out both;
}

.moon-dot {
  opacity: 0;
  transition: 0.4s;
  fill: gray;
}

#theme-input:checked + .theme-slider .sun-moon .moon-dot {
  opacity: 1;
}

.theme-slider.round {
  border-radius: 34px;
}

.theme-slider.round .sun-moon {
  border-radius: 50%;
}

#moon-dot-1 {
  left: 10px;
  top: 3px;
  position: absolute;
  width: 6px;
  height: 6px;
  z-index: 4;
}

#moon-dot-2 {
  left: 2px;
  top: 10px;
  position: absolute;
  width: 10px;
  height: 10px;
  z-index: 4;
}

#moon-dot-3 {
  left: 16px;
  top: 18px;
  position: absolute;
  width: 3px;
  height: 3px;
  z-index: 4;
}

#light-ray-1 {
  left: -8px;
  top: -8px;
  position: absolute;
  width: 43px;
  height: 43px;
  z-index: -1;
  fill: #fff;
  opacity: 10%;
}

#light-ray-2 {
  left: -50%;
  top: -50%;
  position: absolute;
  width: 55px;
  height: 55px;
  z-index: -1;
  fill: #fff;
  opacity: 10%;
}

#light-ray-3 {
  left: -18px;
  top: -18px;
  position: absolute;
  width: 60px;
  height: 60px;
  z-index: -1;
  fill: #fff;
  opacity: 10%;
}

.cloud-light {
  position: absolute;
  fill: #eee;
  animation: cloud-move 6s infinite;
}

.cloud-dark {
  position: absolute;
  fill: #ccc;
  animation: cloud-move 6s infinite;
  animation-delay: 1s;
}

#cloud-1 {
  left: 30px;
  top: 15px;
  width: 40px;
}

#cloud-2 {
  left: 44px;
  top: 10px;
  width: 20px;
}

#cloud-3 {
  left: 18px;
  top: 24px;
  width: 30px;
}

#cloud-4 {
  left: 36px;
  top: 18px;
  width: 40px;
}

#cloud-5 {
  left: 48px;
  top: 14px;
  width: 20px;
}

#cloud-6 {
  left: 22px;
  top: 26px;
  width: 30px;
}

@keyframes cloud-move {
  0% {
    transform: translateX(0);
  }
  40% {
    transform: translateX(4px);
  }
  80% {
    transform: translateX(-4px);
  }
  100% {
    transform: translateX(0);
  }
}

.stars {
  transform: translateY(-32px);
  opacity: 0;
  transition: 0.4s;
}

.star {
  fill: #fff;
  position: absolute;
  transition: 0.4s;
  animation: star-twinkle 2s infinite;
}

#theme-input:checked + .theme-slider .stars {
  transform: translateY(0);
  opacity: 1;
}

#star-1 {
  width: 20px;
  top: 2px;
  left: 3px;
  animation-delay: 0.3s;
}

#star-2 {
  width: 6px;
  top: 16px;
  left: 3px;
}

#star-3 {
  width: 12px;
  top: 20px;
  left: 10px;
  animation-delay: 0.6s;
}

#star-4 {
  width: 18px;
  top: 0;
  left: 18px;
  animation-delay: 1.3s;
}

@keyframes star-twinkle {
  0% {
    transform: scale(1);
  }
  40% {
    transform: scale(1.2);
  }
  80% {
    transform: scale(0.8);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes rotate-center {
  0% {
    transform: translateX(26px) rotate(0);
  }
  100% {
    transform: translateX(26px) rotate(360deg);
  }
}

.sidebar-footer {
  padding-top: var(--space-sm);
  border-top: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
  text-align: center;
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

html[data-theme='light'] .footer-sources {
  color: #2f4f8f;
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
    height: min(65vh, 520px);
    border-radius: 24px 24px 0 0;
    border: 1px solid var(--glass-border);
    border-bottom: none;
    transform: translateY(102%);
    padding-bottom: env(safe-area-inset-bottom, 20px);
    box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.5);
    background: var(--glass-bg);
    backdrop-filter: blur(20px) saturate(180%);
  }

  .sidebar.sidebar-open {
    transform: translateY(0);
  }

  .sidebar-collapsed {
    width: 100%;
    padding: var(--space-md);
  }

  .sidebar-header {
    padding-bottom: var(--space-sm);
    margin-bottom: var(--space-xs);
    border-bottom: 2px solid rgba(255, 255, 255, 0.05);
  }

  /* Handle for the bottom sheet */
  .sidebar::before {
    content: '';
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
  }

  .quick-switches {
    justify-content: space-around;
    padding: var(--space-sm) 0;
  }

  .disaster-toggles {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .disaster-toggle {
    padding: 12px 10px;
    justify-content: center;
    flex-direction: column;
    gap: 4px;
    text-align: center;
    min-height: 80px;
  }

  .toggle-icon {
    font-size: 1.4rem;
  }

  .toggle-label {
    font-size: 0.7rem;
  }

  .legend {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
