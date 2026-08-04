<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore, MIN_HEX_RES, MAX_HEX_RES } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useAuthStore } from '@/stores/auth.js'
import { useSourcesStore } from '@/stores/sources.js'
import { useI18n } from 'vue-i18n'
import PanelCollapseToggle from '@/components/PanelCollapseToggle.vue'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { parseDate } from '@internationalized/date'

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
  viewMode: true,
  location: true,
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

  // "Aktif" = şu an verisi olan türler. type.active (katman checkbox'ı) buraya
  // dahil edilmez — tüm katmanlar varsayılan olarak açık geldiği için bu ikisi
  // birleştirilirse filtre pratikte hep "Tümü" ile aynı sonucu verir.
  const activeTypes = withMeta.filter((type) => type.count > 0)
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

// Bridges rangeStartDate/rangeEndDate (plain 'YYYY-MM-DD' strings — the
// format the rest of this component's date logic, disasterStore, and the
// native <input type="date"> this replaced all already speak) to the
// @internationalized/date CalendarDate objects the shadcn Calendar
// component needs, so callers below keep working with strings.
const rangeStartCalendarDate = computed({
  get: () => parseDate(rangeStartDate.value || today),
  set: (v) => { rangeStartDate.value = v ? v.toString() : '' },
})
const rangeEndCalendarDate = computed({
  get: () => (rangeEndDate.value ? parseDate(rangeEndDate.value) : undefined),
  set: (v) => { rangeEndDate.value = v ? v.toString() : '' },
})
// Closed explicitly on date pick (see @update:model-value below) — Reka's
// Calendar doesn't close its own Popover on select by itself, and without
// prevent-deselect on Calendar, clicking the already-picked day would
// toggle it back off instead of just leaving it selected.
const startDatePopoverOpen = ref(false)
const endDatePopoverOpen = ref(false)

// Live-testing finding (real bug): the duration slider and the calendar
// date range used to both write to disasterStore.startDate/endDate through
// independent watchers that could race — moving the slider to "20 Yıl"
// while a calendar date was still set from earlier could silently get
// overwritten right back to that old date by the calendar's own watcher,
// so the slider's choice never actually took effect. Fixed by making the
// two mutually exclusive via one explicit mode flag: only one control is
// ever "live" at a time, and only an explicit action (moving the slider,
// or pressing the calendar's Apply button) switches which one is active —
// no more implicit auto-apply-on-every-keystroke for the calendar either
// (the second reported complaint — picking a range was confusing because
// every intermediate pick immediately re-filtered the map).
const dateFilterMode = ref('duration') // 'duration' | 'calendar'

function clearCalendarRange() {
  dateFilterMode.value = 'duration'
  rangeStartDate.value = today
  rangeEndDate.value = ''
  disasterStore.startDate = null
  disasterStore.endDate = null
  disasterStore.refreshAll()
}

function applyDateRange() {
  if (!rangeStartDate.value) return
  const startDateObj = new Date(rangeStartDate.value)
  startDateObj.setHours(0, 0, 0, 0)

  const endDateObj = rangeEndDate.value ? new Date(rangeEndDate.value) : new Date(rangeStartDate.value)
  endDateObj.setHours(23, 59, 59, 999)

  // Swap if the user picked the end date before the start date.
  if (endDateObj < startDateObj) {
    const tmp = rangeStartDate.value
    rangeStartDate.value = rangeEndDate.value
    rangeEndDate.value = tmp
    return applyDateRange()
  }

  dateFilterMode.value = 'calendar'
  disasterStore.startDate = startDateObj.toISOString()
  disasterStore.endDate = endDateObj.toISOString()
  disasterStore.refreshAll()
}

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

// Deliberately never triggers a fetch (unlike applyDateRange/
// clearCalendarRange below) — this slider is meant to be a pure client-side
// filter over whatever's already loaded, same as the magnitude/depth
// sliders, not a network trigger. That's only actually correct once a
// country's FULL history is loaded up front on selection (see MapView.vue's
// selectCountry -> disasterStore.loadCountryHistory()) instead of the old
// windowed/incremental fetch this slider used to silently rely on being
// re-run for — see loadCountryHistory's own comment for the full story
// (live-tested 2026-07-30: widening this slider showed a smaller, wrong
// event set with real critical-magnitude events missing entirely, because
// nothing had ever asked the server for that older data).
function handleTimeSliderInput(index) {
  selectedTimeRangeIndex.value = index
  const rangeLabel = timeRanges[index]

  const hours = timeRangeMap[rangeLabel] || 24
  disasterStore.selectedTimeRange = hours

  // Moving the slider always makes duration mode the active one — clears
  // the calendar's picked dates so it can't silently keep overriding this
  // choice (see dateFilterMode's declaration above for the bug this fixes).
  dateFilterMode.value = 'duration'
  rangeStartDate.value = today
  rangeEndDate.value = ''
  disasterStore.startDate = null
  disasterStore.endDate = null
}

const selectedRangeLabel = computed(() => {
  if (!rangeStartDate.value) return 'Tarih seçin'
  if (!rangeEndDate.value || rangeEndDate.value === rangeStartDate.value)
    return rangeStartDate.value
  return `${rangeStartDate.value} - ${rangeEndDate.value}`
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
    <!-- Header lives outside .sidebar-scroll (not clipped by its overflow),
         so the toggle can be a genuine CSS child of it — anchored to its
         bottom-right corner (top:100%/left:100% + centering transform)
         instead of a guessed/synced pixel value. -->
    <div class="sidebar-header">
      <div class="sidebar-brand">
        <span class="brand-icon">🌍</span>
        <div class="brand-text" v-if="!isCollapsed">
          <h1 class="brand-title">MHEWS</h1>
          <p class="brand-subtitle">{{ t('app.subtitle') }}</p>
        </div>
      </div>
      <div class="panel-collapse-toggle-slot">
        <PanelCollapseToggle
          :collapsed="isCollapsed"
          @click="uiStore.toggleSidebar()"
          :title="isCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        />
      </div>
    </div>

    <!-- Dashboard entry point, right under the brand header so it reads as
         the sidebar's primary nav action rather than something buried at
         the bottom — it now holds Yönetim/Sayfalar/Ayarlar all in one
         place, so it earns top billing. Outside .sidebar-scroll (like the
         header) so it stays put while the filters below scroll. -->
    <div v-if="!isCollapsed" class="sidebar-panel-entry">
      <Button
        class="sidebar-action-btn"
        @click="uiStore.toggleDashboardPanel()"
      >
        📊 {{ t('app.dashboard') }}
      </Button>
    </div>

    <div class="sidebar-scroll">
    <!-- Country Context Banner -->
    <div v-if="activeCountryConfig && !isCollapsed" class="country-banner">
      <span class="country-banner-flag">{{ getFlagEmoji(activeCountryConfig.countryCode) }}</span>
      <div class="country-banner-info">
        <span class="country-banner-name">{{ activeCountryConfig.nameEn }}</span>
        <span class="country-banner-label">{{ t('sidebar.countryFilterActive') }}</span>
      </div>
      <Button variant="ghost" size="icon" class="country-banner-clear" @click="router.push('/')" :title="t('sidebar.backToGlobal')">✕</Button>
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
            <Button
              type="button"
              size="sm"
              :variant="disasterTypeView === 'active' ? 'default' : 'outline'"
              class="hazard-filter-tab"
              @click="disasterTypeView = 'active'"
            >
              {{ t('sidebar.viewActive') }}
            </Button>
            <Button
              type="button"
              size="sm"
              :variant="disasterTypeView === 'all' ? 'default' : 'outline'"
              class="hazard-filter-tab"
              @click="disasterTypeView = 'all'"
            >
              {{ t('sidebar.viewAll') }}
            </Button>
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
                <Switch
                  class="layer-toggle-checkbox"
                  :model-value="disasterStore.isLayerActive(dtype.key)"
                  @click.stop
                  @update:model-value="disasterStore.toggleLayer(dtype.key)"
                  :title="
                    disasterStore.isLayerActive(dtype.key) ? t('sidebar.hideLayer') : t('sidebar.showLayer')
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
                      ● {{ severityBreakdown[dtype.key].critical }} {{ t('severity.critical') }}
                    </span>
                    <span class="sev-chip high" v-if="severityBreakdown[dtype.key].high > 0">
                      ● {{ severityBreakdown[dtype.key].high }} {{ t('severity.high') }}
                    </span>
                    <span
                      class="sev-chip moderate"
                      v-if="severityBreakdown[dtype.key].moderate > 0"
                    >
                      ● {{ severityBreakdown[dtype.key].moderate }} {{ t('severity.moderate') }}
                    </span>
                    <span class="sev-chip low" v-if="severityBreakdown[dtype.key].low > 0">
                      ● {{ severityBreakdown[dtype.key].low }} {{ t('severity.low') }}
                    </span>
                    <span class="sev-chip minimal" v-if="severityBreakdown[dtype.key].minimal > 0">
                      • {{ severityBreakdown[dtype.key].minimal }} {{ t('severity.minimal') }}
                    </span>
                    <span class="sev-chip none" v-if="severityBreakdown[dtype.key].total === 0">
                      {{ t('sidebar.noDataYet') }}
                    </span>
                  </div>
                  <div class="accordion-loading" v-if="disasterStore.supabaseLoading">
                    <span class="loading-pulse">⏳ {{ t('sidebar.loadingEllipsis') }}</span>
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
      <Button
        v-for="dtype in disasterTypes"
        :key="dtype.key"
        variant="ghost"
        size="icon"
        class="btn-icon"
        :class="[dtype.cssClass, { active: disasterStore.isLayerActive(dtype.key) }]"
        @click="disasterStore.toggleLayer(dtype.key)"
        :title="t(`disasters.${dtype.key}`)"
      >
        {{ dtype.icon }}
      </Button>

      <div class="collapsed-divider"></div>

      <!-- 2) Yoğunluk ölçeği -->
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action severity-mini critical"
        :class="{ inactive: !disasterStore.isSeverityActive('critical') }"
        @click="disasterStore.toggleSeverity('critical')"
        :title="t('severity.critical')"
      >
        ●
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action severity-mini high"
        :class="{ inactive: !disasterStore.isSeverityActive('high') }"
        @click="disasterStore.toggleSeverity('high')"
        :title="t('severity.high')"
      >
        ●
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action severity-mini moderate"
        :class="{ inactive: !disasterStore.isSeverityActive('moderate') }"
        @click="disasterStore.toggleSeverity('moderate')"
        :title="t('severity.moderate')"
      >
        ●
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action severity-mini low"
        :class="{ inactive: !disasterStore.isSeverityActive('low') }"
        @click="disasterStore.toggleSeverity('low')"
        :title="t('severity.low')"
      >
        ●
      </Button>

      <div class="collapsed-divider"></div>

      <!-- 3) Zaman aralığı -->
      <Button
        variant="ghost"
        size="icon"
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
      </Button>
      <Button variant="ghost" size="icon" class="btn-icon collapsed-action calendar-mini" :title="t('sidebar.calendar')">📅</Button>

      <div class="collapsed-divider"></div>

      <!-- 4) 2D/3D -->
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action"
        :title="isGlobeMode ? t('sidebar.view2D') : t('sidebar.view3D')"
        @click="isGlobeMode ? uiStore.transitionToMap(20, 30, 3) : uiStore.transitionToGlobe()"
      >
        {{ isGlobeMode ? '🗺️' : '🌐' }}
      </Button>

      <div class="collapsed-divider"></div>

      <!-- 5) Kalan seçenekler -->
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action"
        @click="handleLocate"
        :title="t('sidebar.myLocation')"
      >
        🎯
      </Button>

      <!-- Map Mode Options (Collapsed) — radio-style, but pressing the
           already-active one again turns it off (uiStore.toggleMapMode),
           landing back on "none selected" instead of re-picking itself.
           2026-08-03 feedback. -->
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'normal' }"
        @click="uiStore.toggleMapMode('normal')"
        :title="t('sidebar.modeNormal')"
      >
        📍
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'hexagon' }"
        @click="uiStore.toggleMapMode('hexagon')"
        :title="t('sidebar.modeHexagon')"
      >
        ⬡
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="btn-icon collapsed-action"
        :class="{ active: uiStore.mapMode === 'heatmap' }"
        @click="uiStore.toggleMapMode('heatmap')"
        :title="t('sidebar.modeHeatmap')"
      >
        🔥
      </Button>

      <div class="collapsed-divider"></div>

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
        <span class="section-title">{{ t('sidebar.filters') }}</span>
        <span class="section-arrow" :class="{ open: openSections.magnitudeDepth }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.magnitudeDepth">
          <div class="filter-row">
            <div class="filter-label">
              <span>{{ t('sidebar.magnitude') }}</span>
              <span class="filter-val accent">{{
                disasterStore.minMagnitude > 0 ? `M${disasterStore.minMagnitude}+` : '0+'
              }}</span>
            </div>
            <Slider
              :min="0"
              :max="9"
              :step="0.5"
              :model-value="[disasterStore.minMagnitude]"
              @update:model-value="(v) => (disasterStore.minMagnitude = v[0])"
              class="filter-range"
            />
            <div class="filter-ends"><span>0</span><span>9</span></div>
          </div>

          <div class="filter-row">
            <div class="filter-label">
              <span>{{ t('sidebar.depth') }}</span>
              <span class="filter-val accent">{{
                disasterStore.maxDepth === null ? t('sidebar.depthAll') : `≤${disasterStore.maxDepth} km`
              }}</span>
            </div>
            <Slider
              :min="0"
              :max="700"
              :step="25"
              :model-value="[disasterStore.maxDepth === null ? 700 : disasterStore.maxDepth]"
              @update:model-value="(v) => (disasterStore.maxDepth = v[0] >= 700 ? null : v[0])"
              class="filter-range"
            />
            <div class="filter-ends"><span>0 km</span><span>25+ km</span></div>
          </div>

          <div class="filter-row time-slider-row" :class="{ 'filter-row-inactive': dateFilterMode === 'calendar' }">
            <div class="filter-label">
              <span>{{ t('sidebar.duration') }}</span>
              <span class="filter-val accent">{{ selectedTimeRange }}</span>
            </div>
            <Slider
              :min="0"
              :max="timeRanges.length - 1"
              :step="1"
              :model-value="[selectedTimeRangeIndex]"
              :disabled="dateFilterMode === 'calendar'"
              @update:model-value="(v) => handleTimeSliderInput(v[0])"
              class="filter-range"
            />
            <div class="filter-ends">
              <span>{{ timeRanges[0] }}</span>
              <span>{{ timeRanges[timeRanges.length - 1] }}</span>
            </div>
            <p v-if="dateFilterMode === 'calendar'" class="date-hint">
              {{ t('sidebar.durationDisabledByCalendar') }}
            </p>
          </div>

          <div class="date-filter-card inline-date-filter" :class="{ 'filter-row-inactive': dateFilterMode === 'duration' }">
            <div class="filter-label">
              <span>{{ t('sidebar.dateRange') }}</span>
              <span class="filter-val accent" :class="{ 'filter-val-active': dateFilterMode === 'calendar' }">
                {{ dateFilterMode === 'calendar' ? t('sidebar.dateRangeActiveLabel', { range: selectedRangeLabel }) : t('sidebar.dateRangeInactive') }}
              </span>
            </div>
            <div class="date-filters">
              <label class="date-label">
                <span>{{ t('sidebar.dateRangeStart') }}</span>
                <Popover v-model:open="startDatePopoverOpen">
                  <PopoverTrigger as-child>
                    <Button variant="outline" class="date-input">{{ rangeStartDate || t('sidebar.dateRangeStart') }}</Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0">
                    <Calendar
                      :model-value="rangeStartCalendarDate"
                      prevent-deselect
                      @update:model-value="(v) => { rangeStartCalendarDate = v; startDatePopoverOpen = false }"
                    />
                  </PopoverContent>
                </Popover>
              </label>
              <label class="date-label">
                <span>{{ t('sidebar.dateRangeEnd') }}</span>
                <Popover v-model:open="endDatePopoverOpen">
                  <PopoverTrigger as-child>
                    <Button variant="outline" class="date-input">{{ rangeEndDate || t('sidebar.dateRangeEnd') }}</Button>
                  </PopoverTrigger>
                  <PopoverContent class="w-auto p-0">
                    <Calendar
                      :model-value="rangeEndCalendarDate"
                      :min-value="rangeStartCalendarDate"
                      prevent-deselect
                      @update:model-value="(v) => { rangeEndCalendarDate = v; endDatePopoverOpen = false }"
                    />
                  </PopoverContent>
                </Popover>
              </label>
              <span class="date-hint">{{ t('sidebar.dateRangeHint') }}</span>
              <div class="date-filter-actions">
                <Button variant="outline" class="btn-date-apply" @click="applyDateRange">
                  {{ t('sidebar.dateRangeApply') }}
                </Button>
                <Button
                  v-if="dateFilterMode === 'calendar'"
                  variant="ghost"
                  class="btn-date-clear"
                  @click="clearCalendarRange"
                >
                  {{ t('sidebar.dateRangeClear') }}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- View Mode: 2D/3D + Durum/Petek/Isı + hex resolution, all in one place -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('viewMode')">
        <span class="section-title">{{ t('sidebar.viewModeSection') }}</span>
        <span class="section-arrow" :class="{ open: openSections.viewMode }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.viewMode" class="view-mode-content">
          <div class="quick-switches">
            <label class="switch-3d-cyan">
              <input
                type="checkbox"
                class="switch-input"
                :checked="isGlobeMode"
                @change="handleViewModeSwitch"
                :aria-label="t('sidebar.toggle3DAria')"
              />
              <div class="switch-track">
                <span class="track-text text-3d">{{ t('sidebar.view3D') }}</span>
                <span class="track-text text-2d">{{ t('sidebar.view2D') }}</span>
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

          <!-- Durum/Petek/Isı: single 3-way selector, resolution slider always
               present but disabled unless petek is active (persistent affordance
               rather than a control that pops in and out — live-review feedback
               from spec 045). No longer split across separate widgets. -->
          <div class="hex-panel">
            <ToggleGroup type="single" variant="outline" :model-value="uiStore.mapMode ?? ''" class="map-mode-selector-embedded w-full">
              <ToggleGroupItem
                value="normal"
                class="mode-btn"
                @click="uiStore.toggleMapMode('normal')"
                :title="`${t('sidebar.modeNormal')} (1)`"
              >
                📍 {{ t('sidebar.modeNormal') }}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="hexagon"
                class="mode-btn"
                @click="uiStore.toggleMapMode('hexagon')"
                :title="`${t('sidebar.modeHexagon')} (2)`"
              >
                ⬡ {{ t('sidebar.modeHexagon') }}
              </ToggleGroupItem>
              <ToggleGroupItem
                value="heatmap"
                class="mode-btn"
                @click="uiStore.toggleMapMode('heatmap')"
                :title="`${t('sidebar.modeHeatmap')} (3)`"
              >
                🔥 {{ t('sidebar.modeHeatmap') }}
              </ToggleGroupItem>
            </ToggleGroup>
            <div class="hex-resolution-control">
              <Slider
                :min="MIN_HEX_RES"
                :max="MAX_HEX_RES"
                :step="1"
                :model-value="[uiStore.manualHexResolution ?? MIN_HEX_RES]"
                :disabled="uiStore.mapMode !== 'hexagon'"
                @update:model-value="(v) => uiStore.setManualHexResolution(v[0])"
                class="hex-resolution-slider"
                :title="t('sidebar.hexResolution.label')"
                :aria-label="t('sidebar.hexResolution.label')"
              />
              <span class="hex-resolution-value">H{{ uiStore.manualHexResolution ?? MIN_HEX_RES }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Location & Alerts: "what's near me" — locate button, alert radius and
         region filter grouped together instead of scattered across panels. -->
    <div class="sidebar-section" v-if="!isCollapsed">
      <button class="section-toggle" @click="toggleSection('location')">
        <span class="section-title">{{ t('sidebar.locationAlertSection') }}</span>
        <span class="section-arrow" :class="{ open: openSections.location }">›</span>
      </button>
      <Transition name="section-accordion">
        <div v-if="openSections.location" class="location-content">
          <Button class="sidebar-action-btn" @click="handleLocate">
            🎯
            {{
              geoStore.isTracking
                ? t('sidebar.locating')
                : geoStore.hasLocation
                  ? t('sidebar.locationDetected')
                  : t('sidebar.myLocation')
            }}
          </Button>

          <div class="filter-row">
            <div class="filter-label">
              <span>{{ t('settings.alertRadius') }}</span>
              <span class="filter-val accent">{{ geoStore.alertRadius }} km</span>
            </div>
            <Slider
              :min="10"
              :max="500"
              :step="10"
              :model-value="[geoStore.alertRadius]"
              @update:model-value="(v) => geoStore.setAlertRadius(v[0])"
              class="filter-range"
            />
          </div>

          <Button
            v-if="hasMyRegion"
            :variant="disasterStore.showOnlyMyRegion ? 'default' : 'outline'"
            class="sidebar-action-btn"
            @click="disasterStore.showOnlyMyRegion = !disasterStore.showOnlyMyRegion"
          >
            📍 {{ disasterStore.showOnlyMyRegion ? t('sidebar.wholeCountry') : t('sidebar.onlyMyRegion') }}
          </Button>
        </div>
      </Transition>
    </div>

    <!-- Last Updated -->
    <div class="sidebar-footer" v-if="!isCollapsed && disasterStore.lastUpdated">
      <div class="footer-info">
        <div class="footer-update-row">
          <button
            class="footer-refresh-icon"
            :class="{ spinning: disasterStore.isLoading }"
            @click="disasterStore.refreshAll()"
            :disabled="disasterStore.isLoading"
            :title="t('app.refreshAll')"
            :aria-label="t('app.refreshAll')"
          >
            ↻
          </button>
          <span class="footer-text">
            {{ t('app.lastUpdated') }}:
            {{ new Date(disasterStore.lastUpdated).toLocaleTimeString('tr-TR') }}
          </span>
        </div>
        <span class="footer-sources" :class="getSourceStatusClass(healthySourcesCount)">
          {{ healthySourcesCount }}/{{ totalKnownSources }} {{ t('stats.sourcesOnline') }}
        </span>
      </div>
    </div>

    <!-- Logout -->
    <Button
      v-if="authStore.isLoggedIn"
      variant="destructive"
      class="sidebar-logout-btn"
      :class="{ 'sidebar-logout-btn-collapsed': isCollapsed }"
      @click="handleLogout"
      :title="t('settings.logout')"
    >
      <span>⎋</span>
      <span v-if="!isCollapsed">{{ t('settings.logout') }}</span>
    </button>
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
  border-radius: 0;
  border-left: none;
  border-top: none;
  border-bottom: none;
  transition:
    width 0.35s ease,
    transform 0.35s ease,
    opacity 0.25s ease,
    box-shadow 0.35s ease;
}

/* Kept overflow off .sidebar itself (no clipping box) so the collapse
   toggle — a child of .sidebar-header below, positioned past its edge —
   isn't clipped. The scrollable body lives in here instead. */
.sidebar-panel-entry {
  flex-shrink: 0;
  padding: var(--space-sm) var(--space-md) 0;
}

.sidebar-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  gap: var(--space-md);
  overflow-y: auto;
  /* .sidebar no longer clips (the toggle needs to float past its edge), so
     this has to clip itself to match — matters on the mobile bottom sheet
     where .sidebar gets rounded top corners. */
  border-radius: inherit;
}

.sidebar-collapsed {
  width: var(--sidebar-collapsed);
}

.sidebar-collapsed .sidebar-scroll {
  padding: var(--space-sm);
}

/* Not inside .sidebar-scroll — sits outside its clipped, scrolling area so
   .panel-collapse-toggle-slot (a child of this, below) can float past the
   sidebar's right edge without being cut off. flex-shrink:0 so .sidebar's
   flex layout never squeezes it. */
.sidebar-header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Fixed height (not just padding) so this lines up exactly with
     .dock-header in MapView.vue — their content differs (icon+title+
     subtitle vs a single title line), so matching padding alone wouldn't
     make the two boxes — and the toggles anchored to each — the same
     height. Keep both in sync if either changes. */
  min-height: 63px;
  padding: var(--space-md);
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
  width: auto;
  height: auto;
  font-size: 0.75rem;
  padding: 2px 4px;
  border-radius: 4px;
  flex-shrink: 0;
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

/* Anchored to .sidebar-header's own bottom-right corner (top:100%/
   left:100%, both relative to the header, then centered on that point) —
   a genuine CSS child of the menu it sits next to, not a guessed or
   JS-measured pixel value. Straddles the header's border-bottom/the
   sidebar's edge line the same way .panel-collapse-toggle-slot in
   MapView.vue straddles the dock's edge line. */
.panel-collapse-toggle-slot {
  position: absolute;
  top: 100%;
  left: 100%;
  z-index: 2;
  transform: translate(-50%, -50%);
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

.sidebar-section,
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

/* Distinct from the plain accent color so "Aktif: ..." reads as a clearly
   different (on) state from "Aktif değil" at a glance, not just a color
   variant of the same badge. */
.filter-val-active {
  color: #34d399;
}

.filter-range {
  width: 100%;
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
  width: 100%;
  justify-content: flex-start;
  font-size: 0.78rem;
  font-weight: 400;
}

.date-hint {
  font-size: 0.64rem;
  line-height: 1.35;
  color: var(--color-text-muted);
}

/* Duration slider and calendar range are mutually exclusive (see
   dateFilterMode in the script) — the inactive one is dimmed rather than
   silently letting both apply at once. The slider row is also genuinely
   disabled (native `disabled` attribute on the range input) when calendar
   mode wins, since dragging it takes effect immediately with no separate
   "apply" step. The calendar card is only ever dimmed, never blocked —
   it must stay clickable so picking a date + pressing Uygula remains the
   way to switch INTO calendar mode even while duration mode is active. */
.filter-row-inactive {
  opacity: 0.45;
}

.date-filter-actions {
  display: flex;
  gap: 6px;
  margin-top: 2px;
}

.btn-date-apply {
  flex: 1;
  font-size: 0.75rem;
}

.btn-date-clear {
  font-size: 0.75rem;
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

.view-mode-content,
.location-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.sidebar-action-btn {
  width: 100%;
  justify-content: center;
  font-size: 0.8rem;
}

.map-mode-selector-embedded {
  width: 100%;
}

.mode-btn {
  flex: 1;
  padding: 7px 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
}

.mode-btn:hover {
  color: rgba(255, 255, 255, 0.85);
}

/* Reka's own [data-state] attribute is the source of truth for "pressed"
   now (driven by the ToggleGroup's :model-value). Solid fill (same blue as
   the "Panel" button / "Aktif" filter toggle) instead of a translucent
   tint — a tint on top of the already-dark sidebar background read as
   barely-there, "solid + white text" is unmistakable at a glance. */
.mode-btn[data-state='on'] {
  background: #4aa3ff;
  color: #ffffff;
  font-weight: 700;
}

html[data-theme='light'] .mode-btn {
  color: rgba(0, 0, 0, 0.45);
}

html[data-theme='light'] .mode-btn:hover {
  color: rgba(0, 0, 0, 0.8);
}

html[data-theme='light'] .mode-btn[data-state='on'] {
  background: #216dff;
  color: #ffffff;
  font-weight: 700;
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

html[data-theme='light'] .hex-panel {
  border-color: rgba(0, 0, 0, 0.12);
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
  justify-content: center;
  flex-shrink: 0;
}

.sidebar-settings-bottom {
  width: 100%;
  flex-shrink: 0;
}

.footer-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 0;
}

.footer-update-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
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

.footer-refresh-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.9rem;
  line-height: 1;
  cursor: pointer;
  transition:
    color 0.15s ease,
    transform 0.15s ease;
}

.footer-refresh-icon:hover:not(:disabled) {
  color: var(--color-accent);
  transform: rotate(70deg);
}

.footer-refresh-icon:disabled {
  opacity: 0.5;
  cursor: default;
}

.footer-refresh-icon.spinning {
  color: var(--color-accent);
  animation: footer-refresh-spin 0.8s linear infinite;
}

@keyframes footer-refresh-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* Color/background/border now come from the shadcn Button's "destructive"
   variant (aliased to --color-critical); only layout remains here. */
.sidebar-logout-btn {
  width: 100%;
  margin-top: var(--space-sm);
  flex-shrink: 0;
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
  }

  .sidebar-collapsed .sidebar-scroll {
    padding: var(--space-md);
  }

  .sidebar-header {
    padding-bottom: var(--space-sm);
    margin-bottom: var(--space-xs);
    border-bottom: 2px solid rgba(255, 255, 255, 0.05);
  }

  /* The sheet spans the full viewport width here, so there's no right edge
     to sit past — pin inside instead of hanging off-screen. */
  .panel-collapse-toggle-slot {
    top: 20px;
    left: auto;
    right: 14px;
    margin-left: 0;
    transform: none;
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
  font-size: 0.72rem;
  font-weight: 700;
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
  margin-left: auto;
  flex-shrink: 0;
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
