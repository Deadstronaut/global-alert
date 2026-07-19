<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore, MIN_HEX_RES, MAX_HEX_RES } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSourcesStore } from '@/stores/sources.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()
const authStore = useAuthStore()

// Toplam bilinen kaynak sayısı artık data_sources tablosundan geliyor
// (eskiden hardcoded "10" idi — tier1-source-unification refactor'ından
// sonra Tier-1 kaynak sayısı 12'ye çıktı, bu yüzden sabit değer yanlıştı).
const sourcesStore = useSourcesStore()
const totalKnownSources = computed(() => sourcesStore.sources.filter((s) => s.is_active).length || 10)
// Admin paneliyle aynı anlamı taşısın diye (health_state), event üretmiş
// olmasına değil, aktif+sağlıklı poll/bağlantı durumuna bakıyor — eskiden
// disasterStore.sourcesOnline kullanılıyordu ama o "en az bir event
// göndermiş kaynak sayısı" idi, gerçek afet olmadığında yanıltıcı düşük
// çıkıyordu (örn. 1/16).
const healthySourcesCount = computed(
  () => sourcesStore.sources.filter((s) => s.is_active && s.health_state === 'healthy').length,
)

onMounted(() => {
  // AdminView zaten bir kere çekmişse (aynı oturumda) tekrar sorgu atma.
  if (!sourcesStore.sources.length) sourcesStore.fetchSources()
})

const hasMyRegion = computed(() => !!disasterStore.myRegionGeometry)

const activeCountryConfig = computed(() => uiStore.activeCountryConfig)

function getFlagEmoji(code) {
  return code.toUpperCase().split('').map(c => String.fromCodePoint(c.charCodeAt(0) + 127397)).join('')
}
const geoStore = useGeolocationStore()
const isGlobeMode = computed(() => uiStore.viewMode === 'globe')
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
  { key: 'tsunami', icon: '🌊🌊', cssClass: 'btn-tsunami', labelKey: 'disasters.tsunami' },
  { key: 'cyclone', icon: '🌀', cssClass: 'btn-cyclone', labelKey: 'disasters.cyclone' },
  { key: 'volcano', icon: '🌋', cssClass: 'btn-volcano', labelKey: 'disasters.volcano' },
  { key: 'epidemic', icon: '🦠', cssClass: 'btn-epidemic', labelKey: 'disasters.epidemic' },
]

// Accordion open state (set of open type keys)
const openAccordions = ref(new Set())
const disasterTypeView = ref('active')
const openSections = ref({
  disasterFilters: true,
  severityLegend: true,
  magnitudeDepth: true,
  actions: true,
})

function toggleAccordion(key) {
  const s = new Set(openAccordions.value)
  if (s.has(key)) {
    s.delete(key)
  } else {
    s.add(key)
  }
  openAccordions.value = s
}

function toggleSection(key) {
  openSections.value[key] = !openSections.value[key]
}

// Severity breakdown per disaster type (for accordion detail)
const severityBreakdown = computed(() => {
  const result = {}
  const storeRefs = {
    earthquake: disasterStore.earthquakes,
    wildfire: disasterStore.wildfires,
    flood: disasterStore.floods,
    drought: disasterStore.droughts,
    food_security: disasterStore.foodSecurity,
    tsunami: disasterStore.tsunamis,
    cyclone: disasterStore.cyclones,
    volcano: disasterStore.volcanoes,
    epidemic: disasterStore.epidemics,
  }
  for (const [type, events] of Object.entries(storeRefs)) {
    const counts = { critical: 0, high: 0, moderate: 0, low: 0, minimal: 0, total: events.length }
    for (const e of events) {
      if (counts[e.severity] !== undefined) counts[e.severity]++
    }
    result[type] = counts
  }
  return result
})

const severityLevels = ['critical', 'high', 'moderate', 'low', 'minimal']
const severitySummaryLevels = ['critical', 'high', 'moderate', 'low', 'minimal']
const visibleDisasterTypes = computed(() => {
  const withMeta = disasterTypes
    .map((type, index) => ({
      ...type,
      index,
      count: disasterStore.totalCount[type.key] ?? 0,
      active: disasterStore.isLayerActive(type.key),
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      if (Number(b.active) !== Number(a.active)) return Number(b.active) - Number(a.active)
      return a.index - b.index
    })

  if (disasterTypeView.value !== 'active') return withMeta

  const activeTypes = withMeta.filter((type) => type.count > 0 || type.active)
  return activeTypes.length ? activeTypes : withMeta
})

const timeRangeMap = {
  '10 Dakika': 10 / 60,
  '30 Dakika': 0.5,
  '2 Saat': 2,
  '6 Saat': 6,
  '12 Saat': 12,
  '24 Saat': 24,
  '3 Gün': 24 * 3,
  '7 Gün': 24 * 7,
  '15 Gün': 24 * 15,
  '30 Gün': 24 * 30,
  '3 Ay': 24 * 30 * 3,
  '6 Ay': 24 * 30 * 6,
  '1 Yıl': 24 * 365,
  '5 Yıl': 24 * 365 * 5,
  '10 Yıl': 24 * 365 * 10,
  '20 Yıl': 24 * 365 * 20,
}

const timeRanges = Object.keys(timeRangeMap)
const selectedTimeRangeIndex = ref(5) // Index for '24 Saat'
const selectedTimeRange = computed(() => timeRanges[selectedTimeRangeIndex.value])
const today = new Date().toISOString().slice(0, 10)
const rangeStartDate = ref(today)
const rangeEndDate = ref('')
const calendarPickValue = ref(today)

async function handleLogout() {
  await authStore.logout()
  // Push straight to /login rather than '/' — if the sidebar is open on the
  // home screen (already at '/'), pushing '/' again is a no-op duplicate
  // navigation in vue-router, so the post-logout redirect never fires.
  router.push('/login')
}

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

function getSourceStatusClass(count, total = totalKnownSources.value) {
  const ratio = total > 0 ? count / total : 0
  if (ratio >= 0.8) return 'source-level-4'
  if (ratio >= 0.6) return 'source-level-3'
  if (ratio >= 0.4) return 'source-level-2'
  if (ratio > 0) return 'source-level-1'
  return 'source-level-0'
}

function handleTimeSliderInput(event) {
  const index = parseInt(event.target.value, 10)
  selectedTimeRangeIndex.value = index
  const rangeLabel = timeRanges[index]

  const hours = timeRangeMap[rangeLabel] || 24
  disasterStore.selectedTimeRange = hours

  // Selecting a quick range should logically clear the custom calendar range
  // to avoid confusion, and reset back to "now" focused polling.
  rangeStartDate.value = today
  rangeEndDate.value = ''
  calendarPickValue.value = today

  // Reset store to default "poll" mode without specific day boundaries
  // Not: watch([selectedTimeRange, startDate, endDate]) zaten loadFromSupabase(true) tetikliyor
  disasterStore.startDate = null
  disasterStore.endDate = null
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
}

const selectedRangeLabel = computed(() => {
  if (!rangeStartDate.value) return 'Tarih seçin'
  if (!rangeEndDate.value || rangeEndDate.value === rangeStartDate.value)
    return rangeStartDate.value
  return `${rangeStartDate.value} - ${rangeEndDate.value}`
})

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
          <h1 class="brand-title">MHEWS</h1>
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

    <!-- Country Context Banner -->
    <div v-if="activeCountryConfig && !isCollapsed" class="country-banner">
      <span class="country-banner-flag">{{ getFlagEmoji(activeCountryConfig.countryCode) }}</span>
      <div class="country-banner-info">
        <span class="country-banner-name">{{ activeCountryConfig.nameEn }}</span>
        <span class="country-banner-label">Country Filter Active</span>
      </div>
      <button class="country-banner-clear" @click="router.push('/')" title="Back to global">✕</button>
    </div>

    <!-- Disaster Accordion -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('disasterFilters')">
        <span class="section-title">{{ t('sidebar.disasterToggles') }}</span>
        <span class="section-arrow" :class="{ open: openSections.disasterFilters }">›</span>
      </button>

      <Transition name="section-accordion">
        <div v-if="openSections.disasterFilters">
          <div class="hazard-filter-toolbar" role="group" aria-label="Afet tipi görünümü">
            <button
              type="button"
              class="hazard-filter-tab"
              :class="{ active: disasterTypeView === 'active' }"
              @click="disasterTypeView = 'active'"
            >
              Aktif
            </button>
            <button
              type="button"
              class="hazard-filter-tab"
              :class="{ active: disasterTypeView === 'all' }"
              @click="disasterTypeView = 'all'"
            >
              Tümü
            </button>
          </div>

          <div class="disaster-accordion compact-hazard-list">
            <div
              v-for="dtype in visibleDisasterTypes"
              :key="dtype.key"
              class="accordion-item"
              :class="{
                'accordion-active-layer': disasterStore.isLayerActive(dtype.key),
                'accordion-empty-layer': (disasterStore.totalCount[dtype.key] ?? 0) === 0,
              }"
            >
              <!-- Accordion Header -->
              <div class="accordion-header compact-hazard-header" @click="toggleAccordion(dtype.key)">
                <span class="accordion-arrow" :class="{ open: openAccordions.has(dtype.key) }"
                  >›</span
                >
                <span class="toggle-icon">{{ dtype.icon }}</span>
                <span class="toggle-label">
                  {{ t(dtype.labelKey).replace('Active ', '').replace('Aktif ', '') }}
                  <span class="hazard-severity-dots" aria-hidden="true">
                    <span
                      v-for="severity in severitySummaryLevels"
                      :key="severity"
                      class="hazard-severity-dot"
                      :class="[
                        severity,
                        { inactive: !severityBreakdown[dtype.key]?.[severity] },
                      ]"
                      :title="`${severityBreakdown[dtype.key]?.[severity] ?? 0} ${t(`severity.${severity}`)}`"
                    ></span>
                  </span>
                </span>
                <span
                  class="badge"
                  :class="{
                    'badge-critical': disasterStore.totalCount[dtype.key] > 50,
                    'badge-warning': disasterStore.totalCount[dtype.key] > 10,
                    'badge-info': disasterStore.totalCount[dtype.key] <= 10,
                  }"
                >
                  {{ disasterStore.totalCount[dtype.key] ?? 0 }}
                </span>
                <input
                  type="checkbox"
                  class="layer-toggle-checkbox"
                  :checked="disasterStore.isLayerActive(dtype.key)"
                  @click.stop
                  @change="disasterStore.toggleLayer(dtype.key)"
                  :title="
                    disasterStore.isLayerActive(dtype.key) ? 'Katmanı Gizle' : 'Katmanı Göster'
                  "
                />
              </div>

              <Transition name="accordion">
                <div class="accordion-body" v-if="openAccordions.has(dtype.key)">
                  <div class="severity-row" v-if="severityBreakdown[dtype.key]">
                    <span
                      class="sev-chip critical"
                      v-if="severityBreakdown[dtype.key].critical > 0"
                    >
                      ● {{ severityBreakdown[dtype.key].critical }} Kritik
                    </span>
                    <span class="sev-chip high" v-if="severityBreakdown[dtype.key].high > 0">
                      ● {{ severityBreakdown[dtype.key].high }} Yüksek
                    </span>
                    <span
                      class="sev-chip moderate"
                      v-if="severityBreakdown[dtype.key].moderate > 0"
                    >
                      ● {{ severityBreakdown[dtype.key].moderate }} Orta
                    </span>
                    <span class="sev-chip low" v-if="severityBreakdown[dtype.key].low > 0">
                      ● {{ severityBreakdown[dtype.key].low }} Düşük
                    </span>
                    <span class="sev-chip minimal" v-if="severityBreakdown[dtype.key].minimal > 0">
                      • {{ severityBreakdown[dtype.key].minimal }} Minimum
                    </span>
                    <span class="sev-chip none" v-if="severityBreakdown[dtype.key].total === 0">
                      Henüz veri yok
                    </span>
                  </div>
                  <div class="accordion-loading" v-if="disasterStore.supabaseLoading">
                    <span class="loading-pulse">⏳ Yükleniyor…</span>
                  </div>
                </div>
              </Transition>
            </div>
          </div>
        </div>
      </Transition>
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
        class="btn-icon collapsed-action time-mini active"
        @click="uiStore.toggleSidebar()"
        :title="selectedTimeRange"
      >
        {{
          selectedTimeRange
            .replace(' Saat', 's')
            .replace(' Dakika', 'd')
            .replace(' Gün', 'g')
            .replace(' Ay', 'a')
            .replace(' Yıl', 'y')
        }}
      </button>
      <button class="btn-icon collapsed-action calendar-mini" title="Takvim">📅</button>

      <div class="collapsed-divider"></div>

      <!-- 4) 2D/3D -->
      <button
        class="btn-icon collapsed-action"
        :title="isGlobeMode ? 'View 2D' : 'View 3D'"
        @click="isGlobeMode ? uiStore.transitionToMap(20, 30, 3) : uiStore.transitionToGlobe()"
      >
        {{ isGlobeMode ? '🗺️' : '🌐' }}
      </button>

      <div class="collapsed-divider"></div>

      <!-- 5) Kalan seçenekler -->
      <button
        class="btn-icon collapsed-action"
        @click="handleLocate"
        :title="t('sidebar.myLocation')"
      >
        🎯
      </button>

      <!-- Map Mode Options (Collapsed) -->
      <button
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'normal' }"
        @click="uiStore.mapMode = 'normal'"
        title="Durum (Event)"
      >
        📍
      </button>
      <button
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'hexagon' }"
        @click="uiStore.mapMode = 'hexagon'"
        title="Petek (Hex)"
      >
        ⬡
      </button>
      <button
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'heatmap' }"
        @click="uiStore.mapMode = 'heatmap'"
        title="Isı (Heat)"
      >
        🔥
      </button>

      <div class="collapsed-divider"></div>

      <button
        class="btn-icon collapsed-action"
        @click="uiStore.toggleSettings()"
        :title="t('app.settings')"
      >
        ⚙️
      </button>

      <div
        class="collapsed-sources"
        :class="getSourceStatusClass(healthySourcesCount)"
        v-if="disasterStore.lastUpdated"
      >
        {{ healthySourcesCount }}/{{ totalKnownSources }}
      </div>
    </div>

    <!-- Severity Legend -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('severityLegend')">
        <span class="section-title">{{ t('sidebar.legend') }}</span>
        <span class="section-arrow" :class="{ open: openSections.severityLegend }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.severityLegend" class="legend">
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
      </Transition>
    </div>

    <!-- Magnitude & Depth Filters -->
    <div class="sidebar-section filter-sliders" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('magnitudeDepth')">
        <span class="section-title">Filtreler</span>
        <span class="section-arrow" :class="{ open: openSections.magnitudeDepth }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.magnitudeDepth">
          <div class="filter-row">
            <div class="filter-label">
              <span>BÜYÜKLÜK</span>
              <span class="filter-val accent">{{
                disasterStore.minMagnitude > 0 ? `M${disasterStore.minMagnitude}+` : '0+'
              }}</span>
            </div>
            <input
              type="range"
              min="0"
              max="9"
              step="0.5"
              :value="disasterStore.minMagnitude"
              @input="disasterStore.minMagnitude = Number($event.target.value)"
              class="filter-range"
            />
            <div class="filter-ends"><span>0</span><span>9</span></div>
          </div>

          <div class="filter-row">
            <div class="filter-label">
              <span>DERİNLİK</span>
              <span class="filter-val accent">{{
                disasterStore.maxDepth === null ? 'TÜMÜ' : `≤${disasterStore.maxDepth} km`
              }}</span>
            </div>
            <input
              type="range"
              min="0"
              max="700"
              step="25"
              :value="disasterStore.maxDepth === null ? 700 : disasterStore.maxDepth"
              @input="
                disasterStore.maxDepth =
                  Number($event.target.value) >= 700 ? null : Number($event.target.value)
              "
              class="filter-range"
            />
            <div class="filter-ends"><span>0 km</span><span>25+ km</span></div>
          </div>

          <div class="filter-row time-slider-row">
            <div class="filter-label">
              <span>SÜRE</span>
              <span class="filter-val accent">{{ selectedTimeRange }}</span>
            </div>
            <input
              type="range"
              :min="0"
              :max="timeRanges.length - 1"
              :value="selectedTimeRangeIndex"
              @input="handleTimeSliderInput"
              class="filter-range"
            />
            <div class="filter-ends">
              <span>{{ timeRanges[0] }}</span>
              <span>{{ timeRanges[timeRanges.length - 1] }}</span>
            </div>
          </div>

          <div class="date-filter-card inline-date-filter">
            <div class="filter-label">
              <span>ZAMAN ARALIĞI</span>
              <span class="filter-val accent">{{ selectedRangeLabel }}</span>
            </div>
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
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Actions -->
    <div class="sidebar-actions" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('actions')">
        <span class="section-title">Seçenekler</span>
        <span class="section-arrow" :class="{ open: openSections.actions }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.actions">
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

          </div>

          <button class="btn btn-primary sidebar-action-btn" @click="handleLocate">
            🎯
            {{
              geoStore.isTracking
                ? t('sidebar.locating')
                : geoStore.hasLocation
                  ? t('sidebar.locationDetected')
                  : t('sidebar.myLocation')
            }}
          </button>

          <!-- spec 045 (+ UX follow-up): durum/ısı paired toggle — petek moved to its
               own wide panel below. Keyboard-shortcut number badges removed per
               live-review feedback (visual clutter, not worth the space). -->
          <div class="map-mode-selector">
            <button
              class="mode-btn"
              :class="{ active: uiStore.mapMode === 'normal' }"
              @click="uiStore.mapMode = 'normal'"
              title="Durum (1)"
            >
              📍 Durum
            </button>
            <button
              class="mode-btn"
              :class="{ active: uiStore.mapMode === 'heatmap' }"
              @click="uiStore.mapMode = 'heatmap'"
              title="Isı (3)"
            >
              🔥 Isı
            </button>
          </div>

          <!-- spec 045 (+ UX follow-up): petek — the resolution slider now lives
               inside the same panel as the toggle button itself (not a separate
               labeled row that appears/disappears) and is always present, just
               disabled until petek is the active mode — a persistent affordance
               rather than a control that pops in and out. No visible "hexagon
               size" text (kept only as an a11y title/aria-label); the current
               level shows as a small inline number next to the slider instead. -->
          <div class="hex-panel">
            <button
              class="btn btn-ghost sidebar-action-btn hex-panel-toggle"
              :class="{ active: uiStore.mapMode === 'hexagon' }"
              @click="uiStore.mapMode = 'hexagon'"
              title="Petek (2)"
            >
              ⬡ Petek
            </button>
            <div class="hex-resolution-control">
              <input
                type="range"
                :min="MIN_HEX_RES"
                :max="MAX_HEX_RES"
                step="1"
                :value="uiStore.manualHexResolution ?? MIN_HEX_RES"
                :disabled="uiStore.mapMode !== 'hexagon'"
                @input="uiStore.setManualHexResolution(Number($event.target.value))"
                class="hex-resolution-slider"
                :title="t('sidebar.hexResolution.label')"
                :aria-label="t('sidebar.hexResolution.label')"
              />
              <span class="hex-resolution-value">H{{ uiStore.manualHexResolution ?? MIN_HEX_RES }}</span>
            </div>
          </div>

          <div class="nav-links">
            <button class="btn btn-ghost sidebar-action-btn" @click="router.push('/hazards')">
              🌋 Afet Ansiklopedisi
            </button>
            <button class="btn btn-ghost sidebar-action-btn" @click="router.push('/report')">
              📢 {{ t('communityReport.form.title') }}
            </button>
            <button
              v-if="hasMyRegion"
              :class="['btn', 'btn-ghost', 'sidebar-action-btn', { active: disasterStore.showOnlyMyRegion }]"
              @click="disasterStore.showOnlyMyRegion = !disasterStore.showOnlyMyRegion"
            >
              📍 {{ disasterStore.showOnlyMyRegion ? 'Tüm Ülke' : 'Sadece Bölgem' }}
            </button>
          </div>

        </div>
      </Transition>
    </div>

    <!-- Last Updated -->
    <div class="sidebar-footer" v-if="!isCollapsed && disasterStore.lastUpdated">
      <span class="footer-text">
        {{ t('app.lastUpdated') }}:
        {{ new Date(disasterStore.lastUpdated).toLocaleTimeString('tr-TR') }}
      </span>
      <span class="footer-sources" :class="getSourceStatusClass(healthySourcesCount)">
        {{ healthySourcesCount }}/{{ totalKnownSources }} {{ t('stats.sourcesOnline') }}
      </span>
    </div>

    <button
      v-if="!isCollapsed"
      class="btn btn-ghost sidebar-action-btn sidebar-settings-bottom"
      @click="uiStore.toggleSettings()"
    >
      ⚙️ {{ t('app.settings') }}
    </button>

    <!-- Logout -->
    <button
      v-if="authStore.isLoggedIn"
      class="btn sidebar-logout-btn"
      :class="{ 'sidebar-logout-btn-collapsed': isCollapsed }"
      @click="handleLogout"
      :title="t('settings.logout')"
    >
      <span>⎋</span>
      <span v-if="!isCollapsed">{{ t('settings.logout') }}</span>
    </button>
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

.country-banner {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  margin: var(--space-sm) 0;
  background: rgba(74, 163, 255, 0.12);
  border: 1px solid rgba(74, 163, 255, 0.3);
  border-radius: var(--radius-md, 8px);
}

.country-banner-flag {
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}

.country-banner-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.country-banner-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.country-banner-label {
  font-size: 0.65rem;
  color: var(--color-accent, #4aa3ff);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.country-banner-clear {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.15s;
}

.country-banner-clear:hover {
  color: var(--color-text-primary);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.brand-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
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
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  min-width: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 700;
  opacity: 0.85;
}

.sidebar-toggle:hover {
  opacity: 1;
}

.sidebar-collapsed .sidebar-header {
  flex-direction: column;
  justify-content: center;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
}

.sidebar-collapsed .sidebar-brand {
  justify-content: center;
}

.sidebar-collapsed .sidebar-toggle {
  align-self: center;
  border-color: var(--color-accent, #4aa3ff);
  color: var(--color-accent, #4aa3ff);
  background: rgba(77, 163, 255, 0.12);
  box-shadow: 0 0 10px rgba(77, 163, 255, 0.25);
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

.section-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
  padding: 0;
  border: none;
  background: transparent;
  width: 100%;
  cursor: pointer;
  text-align: left;
}

.section-arrow {
  font-size: 1rem;
  color: var(--color-text-muted);
  transition: transform 0.22s ease;
  flex-shrink: 0;
  line-height: 1;
}

.section-arrow.open {
  transform: rotate(90deg);
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
  display: inline-block;
  flex-shrink: 0;
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

.nav-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.map-mode-selector {
  display: flex;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.mode-btn {
  flex: 1;
  padding: 7px 4px;
  font-size: 0.72rem;
  font-weight: 600;
  background: transparent;
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
  white-space: nowrap;
}

.mode-btn:last-child {
  border-right: none;
}

.mode-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
}

.mode-btn.active {
  background: rgba(99, 179, 237, 0.2);
  color: #63b3ed;
}

html[data-theme='light'] .map-mode-selector {
  border-color: rgba(0, 0, 0, 0.12);
}

html[data-theme='light'] .mode-btn {
  color: rgba(0, 0, 0, 0.45);
  border-right-color: rgba(0, 0, 0, 0.08);
}

html[data-theme='light'] .mode-btn:hover {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.8);
}

html[data-theme='light'] .mode-btn.active {
  background: rgba(49, 130, 206, 0.12);
  color: #3182ce;
}

/* spec 045: petek — full-width standalone panel + resolution slider */
/* One cohesive bordered widget: toggle button on top, slider row below —
   the slider is always present, just disabled until petek is active,
   rather than appearing/disappearing (live-review UX feedback). */
.hex-panel {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hex-panel-toggle {
  border: none;
  border-radius: 0;
}

.hex-panel-toggle.active {
  background: rgba(99, 179, 237, 0.2);
  color: #63b3ed;
}

html[data-theme='light'] .hex-panel {
  border-color: rgba(0, 0, 0, 0.12);
}

html[data-theme='light'] .hex-panel-toggle.active {
  background: rgba(49, 130, 206, 0.12);
  color: #3182ce;
}

.hex-resolution-control {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

html[data-theme='light'] .hex-resolution-control {
  border-top-color: rgba(0, 0, 0, 0.06);
}

.hex-resolution-slider {
  flex: 1;
  accent-color: #63b3ed;
}

.hex-resolution-slider:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.hex-resolution-value {
  font-size: 0.68rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  opacity: 0.55;
  min-width: 1.6em;
  text-align: right;
}

.quick-switches {
  display: flex;
  align-items: center;
  justify-content: center;
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
  --w: 70%;
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
  min-width: 148px;
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
  transition:
    left 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275),
    transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
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
  left: calc(100% - var(--knob-size) - var(--offset));
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
  width: 100%;
  margin-top: -6px;
  padding: 9px 0;
  border-top: 1px solid var(--glass-border);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  text-align: center;
  flex-shrink: 0;
}

.sidebar-settings-bottom {
  width: 100%;
  flex-shrink: 0;
}

.footer-text {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  line-height: 1.2;
  user-select: none;
}

.footer-sources {
  font-size: 0.64rem;
  font-weight: 700;
  color: var(--color-info);
  line-height: 1.2;
  user-select: none;
}

html[data-theme='light'] .footer-sources {
  color: #2f4f8f;
}

.sidebar-logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  margin-top: var(--space-sm);
  padding: 10px;
  font-size: 0.8rem;
  font-weight: 600;
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.sidebar-logout-btn:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.6);
}

.sidebar-logout-btn-collapsed {
  width: 34px;
  height: 34px;
  padding: 0;
  margin: var(--space-sm) auto 0;
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
    justify-content: center;
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

/* ─── Disaster Accordion ─── */
.disaster-accordion {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hazard-filter-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 8px;
}

.hazard-filter-tab {
  min-height: 30px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-text-secondary);
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.hazard-filter-tab.active {
  background: rgba(77, 163, 255, 0.16);
  border-color: rgba(77, 163, 255, 0.56);
  color: var(--color-text-primary);
}

.accordion-item {
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    background 0.2s ease;
}

.accordion-item.accordion-active-layer {
  border-color: rgba(77, 163, 255, 0.22);
  background: rgba(77, 163, 255, 0.05);
}

.accordion-item.accordion-empty-layer {
  opacity: 0.72;
}

.accordion-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 9px 10px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;
}

.accordion-header:hover {
  background: rgba(255, 255, 255, 0.07);
}

.compact-hazard-header {
  min-height: 44px;
  padding: 7px 8px;
}

.compact-hazard-header .toggle-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  line-height: 1.15;
}

.hazard-severity-dots {
  display: flex;
  gap: 4px;
  min-height: 6px;
}

.hazard-severity-dot {
  width: 18px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
  box-shadow: 0 0 8px currentColor;
}

.hazard-severity-dot.critical {
  color: var(--color-critical);
}

.hazard-severity-dot.high {
  color: var(--color-high);
}

.hazard-severity-dot.moderate {
  color: var(--color-moderate);
}

.hazard-severity-dot.low {
  color: var(--color-low);
}

.hazard-severity-dot.minimal {
  color: var(--color-minimal);
}

.hazard-severity-dot.inactive {
  opacity: 0.18;
  box-shadow: none;
}

.badge {
  min-width: 34px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  text-align: center;
  color: var(--color-text-primary);
  background: rgba(77, 163, 255, 0.14);
}

.badge-critical {
  background: rgba(255, 60, 60, 0.18);
  color: var(--color-critical);
}

.badge-warning {
  background: rgba(255, 140, 0, 0.18);
  color: var(--color-high);
}

.badge-info {
  background: rgba(77, 163, 255, 0.14);
  color: var(--color-accent);
}

.accordion-arrow {
  font-size: 1rem;
  color: var(--color-text-muted);
  transition: transform 0.22s ease;
  flex-shrink: 0;
  line-height: 1;
}

.accordion-arrow.open {
  transform: rotate(90deg);
}

.accordion-body {
  padding: 6px 12px 10px 36px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.severity-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.sev-chip {
  font-size: 0.7rem;
  padding: 2px 8px;
  border-radius: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.sev-chip.critical {
  background: rgba(255, 60, 60, 0.18);
  color: var(--color-critical);
}

.sev-chip.high {
  background: rgba(255, 140, 0, 0.18);
  color: var(--color-high);
}

.sev-chip.moderate {
  background: rgba(255, 210, 60, 0.18);
  color: var(--color-moderate);
}

.sev-chip.low {
  background: rgba(100, 200, 100, 0.18);
  color: var(--color-low);
}

.sev-chip.minimal {
  background: rgba(148, 163, 184, 0.18);
  color: var(--color-minimal);
}

.sev-chip.none {
  background: rgba(255, 255, 255, 0.07);
  color: var(--color-text-muted);
}

.layer-toggle-checkbox {
  appearance: none;
  width: 36px;
  height: 20px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  position: relative;
  cursor: pointer;
  outline: none;
  margin-left: auto;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.layer-toggle-checkbox::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.layer-toggle-checkbox:checked {
  background: var(--color-info, #4da3ff);
  box-shadow: 0 0 6px rgba(77, 163, 255, 0.6);
}

.layer-toggle-checkbox:checked::after {
  transform: translateX(16px);
}

.accordion-loading {
  margin-top: 6px;
  font-size: 0.7rem;
  color: var(--color-text-muted);
}

.loading-pulse {
  animation: pulse 1.4s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* Accordion transition */
.accordion-enter-active,
.accordion-leave-active {
  transition:
    max-height 0.25s ease,
    opacity 0.2s ease;
  max-height: 200px;
  overflow: hidden;
}

.accordion-enter-from,
.accordion-leave-to {
  max-height: 0;
  opacity: 0;
}

.section-accordion-enter-active,
.section-accordion-leave-active {
  transition:
    max-height 0.25s ease,
    opacity 0.2s ease;
  max-height: 480px;
  overflow: hidden;
}

.section-accordion-enter-from,
.section-accordion-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
