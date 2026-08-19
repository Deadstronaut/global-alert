<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { LayoutDashboard, MapPin, LocateFixed, Globe, Map, Languages, Accessibility, ChevronDown, UserCircle, LogOut, AlertTriangle, Siren, Home, Megaphone, Trash2, ExternalLink } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth.js'
import { useUIStore } from '@/stores/ui.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useExposureLayersStore } from '@/stores/exposureLayers.js'
import { clearCache } from '@/services/idbCache.js'
import { resolveEventRegionName } from '@/utils/eventRegionLookup.js'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import GeocodingSearch from '@/components/impact/GeocodingSearch.vue'
import AnimatedEarthLogo from '@/components/AnimatedEarthLogo.vue'
import LateralRiskReport from '@/components/risk/LateralRiskReport.vue'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Same 7 locales SettingsPanel.vue's language switcher already offers —
// kept as a plain list here rather than deriving from i18n internals, same
// pattern SettingsPanel.vue uses.
const LOCALES = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ar', label: 'العربية' },
  { code: 'zh', label: '中文' },
]

// spec 069 follow-up: quick access to CAP/Incidents/Shelters/Report,
// opened as a dialog (QuickPageDialog.vue, owned by MainLayout.vue) instead
// of navigating away from the map — same view components + `embedded` prop
// DashboardPlaceholder.vue's Panel dialog already reuses for these, just a
// second, more direct entry point. Icon-only (the header is already
// crowded) with a title tooltip; same i18n keys AppSidebar.vue's own
// navItems already use, no new copy.
const QUICK_PAGES = [
  { id: 'cap', icon: AlertTriangle, titleKey: 'dashboard.navCap' },
  { id: 'incidents', icon: Siren, titleKey: 'dashboard.navIncidents' },
  { id: 'shelters', icon: Home, titleKey: 'dashboard.navShelters' },
  { id: 'report', icon: Megaphone, titleKey: 'dashboard.navReport' },
]

const emit = defineEmits(['open-quick-page'])

const { t, locale } = useI18n()
const router = useRouter()
const authStore = useAuthStore()
const uiStore = useUIStore()
const disasterStore = useDisasterStore()
const geoStore = useGeolocationStore()
const exposureLayersStore = useExposureLayersStore()

const currentLocaleLabel = computed(() => LOCALES.find((l) => l.code === locale.value)?.label ?? locale.value)
const userEmail = computed(() => authStore.session?.email ?? '')
const userInitials = computed(() => (userEmail.value ? userEmail.value.slice(0, 2).toUpperCase() : '?'))
const userRoleLabel = computed(() => authStore.session?.role?.replace(/_/g, ' ') ?? '')

// spec 069 Revision 2: same "3D globe = has real geometry to show a region
// in" gate SidebarPanel.vue's location section used — only meaningful once
// a region boundary is loaded.
const hasMyRegion = computed(() => !!disasterStore.myRegionGeometry)
const isGlobeMode = computed(() => uiStore.viewMode === 'globe')

// Spec 071 (US2/T013-T014) — "kritik durum" trigger: reuses
// disasterStore.allEvents (already fetched, no new network request —
// research.md R6) instead of a new polling mechanism. A quake counts as
// critical either via its own severity field or a magnitude threshold
// (magnitude alone can arrive before severity is classified server-side).
const CRITICAL_QUAKE_MAGNITUDE = 6.0
const MAX_CRITICAL_EVENTS_SHOWN = 6

function isCriticalEvent(e) {
  return e.severity === 'critical' || (e.type === 'earthquake' && (e.magnitude ?? 0) >= CRITICAL_QUAKE_MAGNITUDE)
}
function isWithinActiveCountryBbox(e) {
  const bbox = uiStore.activeCountryConfig?.bbox
  if (!bbox) return false
  return e.lat >= bbox.minLat && e.lat <= bbox.maxLat && e.lng >= bbox.minLng && e.lng <= bbox.maxLng
}

// 2026-08-19 ask: this used to fire globally (any critical event anywhere
// in the world, no matter which country the operator is actually looking
// at) and open a single, unlabeled report — "hangi ülke için geçerli bu...
// hangi afet olduğu belli değil" (user-reported). Now scoped to the SAME
// country context the "ÜLKE FİLTRESİ AKTİF" badge already shows
// (uiStore.activeCountryConfig) — inactive entirely until a country is
// selected — and lists every qualifying event instead of picking one
// arbitrarily, so the operator sees exactly what they're about to open.
const criticalEventsInScope = computed(() => {
  if (!uiStore.activeCountryConfig) return []
  return disasterStore.allEvents
    .filter((e) => isCriticalEvent(e) && isWithinActiveCountryBbox(e))
    .sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0) || new Date(b.time) - new Date(a.time))
    .slice(0, MAX_CRITICAL_EVENTS_SHOWN)
})
const hasCriticalLateralRiskTrigger = computed(() => criticalEventsInScope.value.length > 0)

const showCriticalEventsMenu = ref(false)
const criticalTriggerBtnRef = ref(null)
const criticalMenuPosition = ref({ top: 0, left: 0 })
function toggleCriticalEventsMenu() {
  if (!showCriticalEventsMenu.value && criticalTriggerBtnRef.value) {
    const rect = criticalTriggerBtnRef.value.getBoundingClientRect()
    criticalMenuPosition.value = { top: rect.bottom + 8, left: rect.left }
  }
  showCriticalEventsMenu.value = !showCriticalEventsMenu.value
}
function openReportForEvent(event) {
  uiStore.openLateralRiskReport(event)
  showCriticalEventsMenu.value = false
}

// "hangi afet için olduğu belli değil mesela deprem yangın sel ne olduğu
// bilmiyoruz... Aydın Efeler deprem raporu gibi" — each menu row shows the
// hazard type AND, once resolved, the actual town/district name (same
// eventRegionLookup.js resolver LateralRiskReport.vue's own region section
// uses). Resolved async and cached per event id; a row is still fully
// clickable before its label resolves, it just shows the hazard type alone
// until then (never blocks opening the report on this lookup).
const eventRegionLabels = ref({})
// 2026-08-19 bugfix (round 2): the FIRST watch run can fire before
// MapView.vue's own onMounted has called exposureLayersStore.fetchExposureLayers()
// — country resolution then has zero candidate country codes to try
// (candidateCountryCodes() reads exposureLayersStore.datasets, which is
// still []), legitimately resolves to `null` (no exception — the earlier
// .catch() fix didn't help this case), and the in-flight guard then treats
// that null as final forever, never retrying once real data loads
// ("hâlâ şehir yazmıyor" — user-reported, second round). Ensure the
// datasets are actually loaded (fetching them here too, not just trusting
// MapView's timing) and gate every resolution attempt on that.
if (!exposureLayersStore.loaded && !exposureLayersStore.loading) exposureLayersStore.fetchExposureLayers()
watch(
  [criticalEventsInScope, () => exposureLayersStore.loaded],
  ([events, loaded]) => {
    if (!loaded) return
    for (const event of events) {
      if (event.id in eventRegionLabels.value) continue
      eventRegionLabels.value = { ...eventRegionLabels.value, [event.id]: undefined } // mark in-flight so we don't refetch
      resolveEventRegionName(event, authStore, exposureLayersStore)
        .then((name) => {
          eventRegionLabels.value = { ...eventRegionLabels.value, [event.id]: name }
        })
        .catch((err) => {
          // 2026-08-19 bugfix: an unhandled rejection here (e.g. a
          // country_boundaries fetch failing) left the label stuck at
          // `undefined` forever — the menu row silently fell back to
          // hazard-type-only with no city/town name and no error surfaced
          // ("yangın yazıyor ama şehri yazmıyor" — user-reported). Falling
          // back to null (same as "unresolvable") instead of leaving the
          // in-flight guard permanently stuck.
          console.warn('[AppHeader] resolveEventRegionName failed for', event.id, err)
          eventRegionLabels.value = { ...eventRegionLabels.value, [event.id]: null }
        })
    }
  },
  { immediate: true },
)

const HAZARD_EMOJI = {
  earthquake: '🌍', wildfire: '🔥', flood: '🌊', drought: '☀️',
  tsunami: '🌊', cyclone: '🌀', volcano: '🌋', epidemic: '🦠', disaster: '⚠️',
}
function eventMenuLabel(event) {
  const region = eventRegionLabels.value[event.id]
  const hazard = t('disasters.' + event.type, event.type)
  return region ? `${region} ${hazard}` : hazard
}

// Same role gate as ImpactPanel.vue's own canAnalyze (contracts.md UI
// Entegrasyon Sözleşmesi) — the report surfaces the same kind of
// jurisdiction-sensitive detail (critical infrastructure, affected
// towns), so it stays behind the same access boundary rather than opening
// a second, more permissive door to similar information.
const canAnalyzeLateralRisk = computed(() => authStore.isSuperAdmin || ['country_admin', 'org_admin'].includes(authStore.session?.role))

// spec 069 follow-up: the country banner that used to live here moved to
// HomeView.vue, bottom-center over the map/globe (per request) — freed up
// this center slot for the geocoding search instead.

function onLocationSelected(location) {
  // Same cross-component mechanism hazard-chip clicks / the header's own
  // world-shape toggle already use (uiStore.selectedRegion, watched by
  // MapView.vue) — not a new plumbing path. Also switches to 2D map mode
  // if currently on the 3D globe, same as transitionToMap always does.
  uiStore.transitionToMap(location.lat, location.lng, location.zoom || 10)
}

function changeLanguage(code) {
  locale.value = code
}

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

// Kullanıcı isteği (2026-08-19): IndexedDB önbelleği (mhews-cache) oturum/tarayıcı
// kapanışında otomatik silinmiyor, süresiz kalıcı — kullanıcının kendi isteğiyle
// temizleyebileceği bir yol yoktu. Temizledikten sonra reload, disaster.js'in
// açılış akışını (loadFromCache → loadFromSupabase) baştan tetikleyip temiz bir
// fetch yapmasını sağlıyor.
async function handleClearCache() {
  if (!window.confirm(t('accountMenu.clearCacheConfirm'))) return
  await clearCache()
  window.location.reload()
}

// Moved verbatim from SidebarPanel.vue's handleViewModeSwitch/handleLocate —
// same uiStore/geoStore calls, not new logic (spec 069 research.md §10).
function toggleWorldShape() {
  if (isGlobeMode.value) {
    uiStore.transitionToMap(20, 30, 3)
  } else {
    uiStore.transitionToGlobe()
  }
}

function handleLocate() {
  geoStore.requestLocation().then(() => {
    if (geoStore.hasLocation) {
      geoStore.calculateNearbyThreats(disasterStore.allEvents)
      uiStore.toggleAlertPanel()
    }
  })
}
</script>

<template>
  <header class="app-header glass-panel">
    <div class="app-header-brand">
      <AnimatedEarthLogo :size="28" class="app-header-logo" />
      <div class="app-header-brand-text">
        <span class="app-header-title">MHEWS</span>
        <span class="app-header-subtitle">{{ t('app.subtitle') }}</span>
      </div>
    </div>

    <!-- spec 069 follow-up: moved from MapView.vue's .top-controls-row
         (floating awkwardly over the map, per report) — same
         GeocodingSearch component, just relocated + wired to
         uiStore.transitionToMap instead of MapView's local map.flyTo, so it
         works the same regardless of which routed page/view mode is
         active. -->
    <GeocodingSearch class="app-header-search" @location-selected="onLocationSelected" />

    <div class="app-header-actions">
      <div class="app-header-quick-pages">
        <button
          v-for="page in QUICK_PAGES"
          :key="page.id"
          type="button"
          class="app-header-icon-btn"
          :title="t(page.titleKey)"
          :aria-label="t(page.titleKey)"
          @click="emit('open-quick-page', page.id)"
        >
          <component :is="page.icon" class="app-header-icon" />
        </button>
      </div>

      <!-- Spec 071 (US2/T014) — critical cross-hazard risk trigger. Only
           rendered for roles that can open the report itself (same gate as
           the report), so this never dangles as a visible-but-unreachable
           control. Blinks by default; a static badge+count instead when
           reduced-motion/safe mode is on (Constitution VI, research.md R7).
           2026-08-19 redesign: clicking no longer opens a single ambiguous
           report — it opens a small dropdown menu listing every qualifying
           event in the currently-selected country, each labeled with its
           hazard type and (once resolved) real town/district name; picking
           one opens ITS OWN report. -->
      <div v-if="canAnalyzeLateralRisk && hasCriticalLateralRiskTrigger" class="lateral-risk-trigger-wrap">
        <button
          ref="criticalTriggerBtnRef"
          type="button"
          class="lateral-risk-trigger-btn"
          :class="{ 'lateral-risk-trigger-btn--static': uiStore.safeMode }"
          :title="t('lateralRisk.triggerLabel')"
          :aria-label="t('lateralRisk.triggerLabel')"
          @click="toggleCriticalEventsMenu"
        >
          <AlertTriangle class="app-header-icon" />
          <span v-if="uiStore.safeMode" class="lateral-risk-trigger-count">{{ criticalEventsInScope.length }}</span>
        </button>

        <!-- 2026-08-19 bugfix: Teleport'lanmadan önce menü, header'ın kendi
             z-index bağlamı (position:relative + z-index:var(--z-shell))
             içinde hapsolup HazardTypeNav.vue'nun satırının (aynı z-index'te
             ama sonradan boyanan bir kardeş) ALTINDA kalıyordu
             ("menünün altında kalıyor" — user-reported). Teleport ile
             <body>'ye çıkarıp tetikleyici butonun gerçek
             getBoundingClientRect()'iyle konumlandırıyoruz — projedeki
             .collapsed-panel-hint ile aynı desen. -->
        <Teleport to="body">
          <div v-if="showCriticalEventsMenu" class="critical-events-menu-backdrop" @click="showCriticalEventsMenu = false"></div>
          <Transition name="critical-events-menu">
            <div
              v-if="showCriticalEventsMenu"
              class="critical-events-menu"
              :style="{ top: criticalMenuPosition.top + 'px', left: criticalMenuPosition.left + 'px' }"
            >
              <div class="critical-events-menu-header">
                {{ t('lateralRisk.menu.title', { country: uiStore.activeCountryConfig?.nameEn ?? '' }) }}
              </div>
              <button
                v-for="event in criticalEventsInScope"
                :key="event.id"
                type="button"
                class="critical-events-menu-item"
                @click="openReportForEvent(event)"
              >
                <span class="critical-events-menu-item-icon">{{ HAZARD_EMOJI[event.type] ?? '⚠️' }}</span>
                <span class="critical-events-menu-item-label">{{ eventMenuLabel(event) }}</span>
              </button>
            </div>
          </Transition>
        </Teleport>
      </div>

      <Button variant="outline" class="app-header-btn" @click="uiStore.toggleDashboardPanel()">
        <LayoutDashboard class="app-header-icon" />
        <span>{{ t('app.dashboard') }}</span>
      </Button>

      <Popover>
        <PopoverTrigger as-child>
          <button class="app-header-btn" type="button">
            <MapPin class="app-header-icon" />
            <span>{{ t('mainLayout.header.location') }}</span>
            <ChevronDown class="app-header-icon-sm" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" class="app-header-location-popover">
          <Button class="app-header-locate-btn" @click="handleLocate">
            <LocateFixed class="app-header-icon" />
            {{
              geoStore.isTracking
                ? t('sidebar.locating')
                : geoStore.hasLocation
                  ? t('sidebar.locationDetected')
                  : t('sidebar.myLocation')
            }}
          </Button>
          <div class="app-header-radius-row">
            <div class="app-header-radius-label">
              <span>{{ t('settings.alertRadius') }}</span>
              <span class="app-header-radius-value">{{ geoStore.alertRadius }} km</span>
            </div>
            <Slider
              :min="10"
              :max="500"
              :step="10"
              :model-value="[geoStore.alertRadius]"
              @update:model-value="(v) => geoStore.setAlertRadius(v[0])"
            />
          </div>
          <Button
            v-if="hasMyRegion"
            :variant="disasterStore.showOnlyMyRegion ? 'default' : 'outline'"
            class="app-header-region-btn"
            @click="disasterStore.showOnlyMyRegion = !disasterStore.showOnlyMyRegion"
          >
            {{ disasterStore.showOnlyMyRegion ? t('sidebar.wholeCountry') : t('sidebar.onlyMyRegion') }}
          </Button>
        </PopoverContent>
      </Popover>

      <!-- spec 069 follow-up: shows the TARGET you'll switch to (not the
           current mode) — click = "go to 2D" while looking at the 3D
           globe, and vice versa — plus a matching icon per target (map
           icon for the 2D target, globe icon for the 3D target). "Görünüm"
           dropped from the label per request — just "2B"/"3B". -->
      <button
        class="app-header-btn"
        type="button"
        :title="isGlobeMode ? t('sidebar.view2D') : t('sidebar.view3D')"
        @click="toggleWorldShape"
      >
        <component :is="isGlobeMode ? Map : Globe" class="app-header-icon" />
        <span>{{ isGlobeMode ? t('sidebar.view2D') : t('sidebar.view3D') }}</span>
      </button>

      <!-- spec 069 follow-up: dark mode / high contrast / colorblind-safe /
           reduced-motion, moved here from SettingsPanel.vue (which is
           reused in several other places — embedding them in the header
           instead makes them one always-visible control, not scattered
           across every place that panel happens to open). Same
           DropdownMenuCheckboxItem pattern the app already ships. -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button class="app-header-btn" type="button">
            <Accessibility class="app-header-icon" />
            <span>{{ t('settings.appearance') }}</span>
            <ChevronDown class="app-header-icon-sm" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="app-header-appearance-menu">
          <DropdownMenuCheckboxItem :model-value="uiStore.darkMode" @update:model-value="(v) => (uiStore.darkMode = v)">
            {{ uiStore.darkMode ? 'Dark Mode' : 'Light Mode' }}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem :model-value="uiStore.highContrast" @update:model-value="(v) => (uiStore.highContrast = v)">
            {{ t('settings.highContrast') }}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem :model-value="uiStore.colorblindMode" @update:model-value="(v) => (uiStore.colorblindMode = v)">
            {{ t('settings.colorblindMode') }}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem :model-value="uiStore.safeMode" @update:model-value="(v) => (uiStore.safeMode = v)">
            {{ t('settings.safeMode') }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button class="app-header-btn" type="button">
            <Languages class="app-header-icon" />
            <span>{{ currentLocaleLabel }}</span>
            <ChevronDown class="app-header-icon-sm" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            v-for="l in LOCALES"
            :key="l.code"
            :class="{ 'app-header-locale-active': l.code === locale }"
            @click="changeLanguage(l.code)"
          >
            {{ l.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button class="app-header-btn app-header-account" type="button">
            <Avatar class="size-6">
              <AvatarFallback>{{ userInitials }}</AvatarFallback>
            </Avatar>
            <ChevronDown class="app-header-icon-sm" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="min-w-56">
          <DropdownMenuLabel class="p-0 font-normal">
            <div class="app-header-account-summary">
              <Avatar class="size-8">
                <AvatarFallback>{{ userInitials }}</AvatarFallback>
              </Avatar>
              <div class="app-header-account-text">
                <span class="app-header-account-email">{{ userEmail }}</span>
                <span class="app-header-account-role">{{ userRoleLabel }}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="router.push('/account-security')">
            <UserCircle />
            {{ t('accountSecurity.title') }}
          </DropdownMenuItem>
          <DropdownMenuItem @click="handleClearCache">
            <Trash2 />
            {{ t('accountMenu.clearCache') }}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @click="handleLogout">
            <LogOut />
            {{ t('admin.header.logout') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <LateralRiskReport
      v-if="uiStore.lateralRiskReportEvent"
      :source-event="uiStore.lateralRiskReportEvent"
      @close="uiStore.closeLateralRiskReport()"
    />
  </header>
</template>

<style scoped>
.app-header {
  position: relative;
  z-index: var(--z-shell);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  border-left: none;
  border-right: none;
  border-top: none;
}

.app-header-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  color: var(--color-text-primary);
}

.app-header-logo {
  font-size: 1.4rem;
}

.app-header-brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.app-header-title {
  font-weight: 700;
  font-size: 0.95rem;
}

.app-header-subtitle {
  font-size: 0.7rem;
  opacity: 0.65;
}

/* spec 069 follow-up: GeocodingSearch.vue's own scoped styles handle its
   internals (input/button/suggestions) — this just fits it into the
   header's flex row without letting it grow unbounded. */
.app-header-search {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 420px;
}

.app-header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.app-header-quick-pages {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-right: var(--space-sm);
  border-right: 1px solid var(--glass-border);
  margin-right: 2px;
}

.app-header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition-normal);
}

.app-header-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.app-header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius);
  padding: 6px 10px;
  cursor: pointer;
  transition: background var(--transition-normal);
  font-size: 0.85rem;
  /* spec 069 follow-up: explicit height so every header button (Panel,
     Konum, 2B/3B, Erişilebilirlik, Dil, account) reads at the same height
     regardless of its content — the account button's Avatar (28px) made it
     visibly taller than its icon+text siblings (16px icon) despite sharing
     this same padding. */
  height: 32px;
  box-sizing: border-box;
}

.app-header-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.app-header-icon {
  width: 16px;
  height: 16px;
}

.app-header-icon-sm {
  width: 14px;
  height: 14px;
  opacity: 0.7;
}

.app-header-account-summary {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 6px 8px;
}

.app-header-account-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-header-account-email {
  font-size: 0.85rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-header-account-role {
  font-size: 0.75rem;
  opacity: 0.7;
  text-transform: capitalize;
}

.app-header-locale-active {
  font-weight: 600;
}

/* spec 069 follow-up: thinner vertical padding than the shared
   .app-header-btn default — the Avatar (24px, size-6) needs more of the
   fixed 32px box's content height than an icon+text button does, to avoid
   overflowing/clipping inside it. */
.app-header-account {
  padding: 2px 10px;
}

.app-header-appearance-menu {
  min-width: 220px;
}

.app-header-location-popover {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 260px;
}

.app-header-locate-btn {
  width: 100%;
  justify-content: center;
  gap: 6px;
}

.app-header-radius-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.app-header-radius-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
}

.app-header-radius-value {
  font-weight: 600;
  color: var(--color-flood);
}

.app-header-region-btn {
  width: 100%;
}

/* Spec 071 (US2) — critical lateral-risk trigger. Blinks by default;
   reduced-motion/safe mode swaps the animation for a static high-contrast
   badge + count instead (Constitution VI — never lose the signal, just the
   motion). */
.lateral-risk-trigger-wrap {
  position: relative;
}
.lateral-risk-trigger-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-radius: var(--radius);
  cursor: pointer;
  animation: lateral-risk-blink 1.4s ease-in-out infinite;
}
.lateral-risk-trigger-btn:hover {
  background: rgba(245, 158, 11, 0.28);
}
.lateral-risk-trigger-btn--static {
  animation: none;
  background: rgba(245, 158, 11, 0.28);
}
.lateral-risk-trigger-count {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: #dc2626;
  color: #fff;
  font-size: 0.6rem;
  line-height: 14px;
  text-align: center;
  font-weight: 700;
}
@keyframes lateral-risk-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* 2026-08-19 — the dropdown listing every qualifying event in-scope.
   position:fixed backdrop (not Teleport'ed — the header itself already sits
   at the top of the DOM with a high z-index, so nothing clips this) closes
   the menu on any outside click. */
.critical-events-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: transparent;
}
.critical-events-menu {
  /* top/left set inline (criticalMenuPosition, computed from the trigger
     button's real getBoundingClientRect() at open time) — position:fixed
     since this is Teleport'ed to <body>, no longer relative to
     .lateral-risk-trigger-wrap. */
  position: fixed;
  z-index: 1100;
  width: max(260px, 240px);
  max-width: 340px;
  background: #161b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}
.critical-events-menu-header {
  padding: 10px 12px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.critical-events-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}
.critical-events-menu-item:hover {
  background: rgba(255, 255, 255, 0.06);
}
.critical-events-menu-item + .critical-events-menu-item {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.critical-events-menu-item-icon {
  flex-shrink: 0;
  font-size: 0.95rem;
}
.critical-events-menu-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.critical-events-menu-enter-active,
.critical-events-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.critical-events-menu-enter-from,
.critical-events-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
