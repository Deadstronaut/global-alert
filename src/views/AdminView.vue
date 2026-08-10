<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useSourcesStore } from '@/stores/sources.js'
import { supabase } from '@/services/api/config.js'
import UsersPanel from '@/components/admin/UsersPanel.vue'
import OrgsPanel from '@/components/admin/OrgsPanel.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import ManualEntryForm from '@/components/admin/ManualEntryForm.vue'
import FileImportForm from '@/components/admin/FileImportForm.vue'
import BoundaryUploadForm from '@/components/admin/BoundaryUploadForm.vue'
import ExposureDatasetManager from '@/components/impact/ExposureDatasetManager.vue'
import RiskIndicatorConfig from '@/components/risk/RiskIndicatorConfig.vue'
import CountryRiskIndexPanel from '@/components/risk/CountryRiskIndexPanel.vue'
import RiskScoreDashboard from '@/components/risk/RiskScoreDashboard.vue'
import ScenarioBuilder from '@/components/risk/ScenarioBuilder.vue'
import CascadeRuleConfig from '@/components/risk/CascadeRuleConfig.vue'
import ContactsPanel from '@/components/admin/ContactsPanel.vue'
import DispatchPanel from '@/components/admin/DispatchPanel.vue'
import IntegrationsPanel from '@/components/admin/IntegrationsPanel.vue'
import HazardTaxonomyPanel from '@/components/admin/HazardTaxonomyPanel.vue'
import SopRepositoryPanel from '@/components/admin/SopRepositoryPanel.vue'
import AiCapabilityTogglePanel from '@/components/admin/AiCapabilityTogglePanel.vue'
import AiAnomalyFlagsPanel from '@/components/admin/AiAnomalyFlagsPanel.vue'
import MapLayerRegistryPanel from '@/components/admin/MapLayerRegistryPanel.vue'
import CommunityReportsPanel from '@/components/admin/CommunityReportsPanel.vue'
import AssignedCommunityReportsPanel from '@/components/admin/AssignedCommunityReportsPanel.vue'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import DrillPanel from '@/components/admin/DrillPanel.vue'
import SourcesPanel from '@/components/admin/SourcesPanel.vue'
import AuditPanel from '@/components/admin/AuditPanel.vue'
import ResourceInventoryPanel from '@/components/admin/ResourceInventoryPanel.vue'
import CapInboundPanel from '@/components/admin/CapInboundPanel.vue'
import SatelliteImageryPanel from '@/components/admin/SatelliteImageryPanel.vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const auth = useAuthStore()
const hazardTypesStore = useHazardTypesStore()
const tab = ref('users') // 'users' | 'orgs' | 'drill' | 'sources' | 'manual' | 'csv' | 'boundaries' | 'contacts' | 'dispatch' | 'audit'

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

// ── Users ──────────────────────────────────────────────────────────────────────
// Extracted to components/admin/UsersPanel.vue (2026-08-04) — this view now
// just mounts it for the 'users' tab. The header metrics strip still needs a
// user count independent of UsersPanel's own full-row fetch, so it gets a
// lightweight head-count query of its own.
const usersCount = ref(0)
const usersCountError = ref(null)
async function loadUsersCount() {
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true })
  if (error) usersCountError.value = error.message
  else usersCount.value = count ?? 0
}

// ── Organizations ──────────────────────────────────────────────────────────────
// Extracted to components/admin/OrgsPanel.vue (2026-08-04), same pattern as
// UsersPanel — the header metrics strip keeps its own lightweight count.
const orgsCount = ref(0)
const orgsCountError = ref(null)
async function loadOrgsCount() {
  const { count, error } = await supabase.from('organizations').select('id', { count: 'exact', head: true })
  if (error) orgsCountError.value = error.message
  else orgsCount.value = count ?? 0
}

// ── Drill sessions ── Extracted to components/admin/DrillPanel.vue
// (2026-08-04), same pattern as UsersPanel/OrgsPanel.
const runningDrillsCount = ref(0)
async function loadRunningDrillsCount() {
  const { count } = await supabase
    .from('drill_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'active')
  runningDrillsCount.value = count ?? 0
}

const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')

// spec 036 (US5): org_admin's own read-only "assigned to me" tab — distinct
// from canAdmin's country_admin/super_admin moderation tab above.
const isOrgAdmin = computed(() => auth.session?.role === 'org_admin')

// spec 018: a country_admin/org_admin granted one of the 4 named capabilities
// gets the same access as super_admin for that specific admin area only —
// does not widen canAdmin/canCreateUsers or any other super_admin-only ability.
function hasCapability(cap) {
  return auth.isSuperAdmin || (auth.session?.capabilities ?? []).includes(cap)
}

// org_admin may provision viewer accounts (docs/security_roles_protocol.md §2)
// but doesn't get the broader org/drill/source management canAdmin grants.
const canCreateUsers = computed(() => canAdmin.value || auth.session?.role === 'org_admin')

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

// ── Data Sources (feature 001-data-ingestion-monitoring) ───────────────────────
const sourcesStore = useSourcesStore()
// Extracted to components/admin/SourcesPanel.vue (2026-08-04) — this view
// keeps only what adminMetrics still needs directly from the store.

const FASTEST_POLL_MS = 60_000 // matches earthquake's 60s interval — fastest configured source
let sourcesRefreshTimer = null

// ── Audit & Compliance (spec 007) ───────────────────────────────────────────
// Full audit log/compliance/incident/drill reports UI extracted to
// components/admin/AuditPanel.vue (2026-08-04) — this view keeps only the
// lightweight count needed for the header metrics strip.
const auditTotalCount = ref(0)
const auditError = ref(null)

async function loadAuditRecordsCount() {
  const { count, error } = await supabase
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
  if (error) auditError.value = error.message
  else auditTotalCount.value = count ?? 0
}

function openAuditTab() {
  tab.value = 'audit'
}

// Two-tier nav: 17 flat tabs used to wrap onto two crowded rows with no
// structure. Grouped into categories here; clicking a category shows only
// its own tabs below, picking one automatically if the current tab isn't
// in that category (or isn't visible under the current permissions).
const CATEGORIES = [
  { id: 'identity', icon: '👥', labelKey: 'admin.categories.identity' },
  { id: 'data', icon: '📡', labelKey: 'admin.categories.data' },
  { id: 'operations', icon: '🎯', labelKey: 'admin.categories.operations' },
  { id: 'config', icon: '⚙️', labelKey: 'admin.categories.config' },
  { id: 'audit', icon: '🛡️', labelKey: 'admin.categories.audit' },
]

const ADMIN_TABS = [
  { id: 'users', category: 'identity', icon: '👥', labelKey: 'admin.tabs.users', visible: () => true },
  { id: 'orgs', category: 'identity', icon: '🏢', labelKey: 'admin.tabs.orgs', visible: () => true },
  { id: 'contacts', category: 'identity', icon: '📇', labelKey: 'contacts.tabLabel', visible: () => canCreateUsers.value },
  { id: 'satelliteImagery', category: 'data', icon: '🛰️', labelKey: 'satelliteImagery.tabLabel', visible: () => canAdmin.value },
  { id: 'sources', category: 'data', icon: '📡', labelKey: 'admin.tabs.sources', visible: () => true },
  { id: 'csv', category: 'data', icon: '📁', labelKey: 'admin.tabs.csv', visible: () => canAdmin.value },
  { id: 'manual', category: 'data', icon: '✍️', labelKey: 'admin.tabs.manual', visible: () => canAdmin.value },
  { id: 'boundaries', category: 'data', icon: '🗺️', labelKey: 'admin.tabs.boundaries', visible: () => canAdmin.value },
  { id: 'mapLayers', category: 'data', icon: '🗺️', labelKey: 'mapLayers.tabLabel', visible: () => hasCapability('map_layers') },
  { id: 'exposure', category: 'data', icon: '📊', labelKey: 'impact.exposure.tabLabel', visible: () => canAdmin.value },
  { id: 'drill', category: 'operations', icon: '🎯', labelKey: 'admin.tabs.drill', visible: () => true },
  { id: 'dispatch', category: 'operations', icon: '📨', labelKey: 'dispatch.panelTitle', visible: () => canCreateUsers.value },
  { id: 'communityReports', category: 'operations', icon: '📢', labelKey: 'communityReport.moderation.tabLabel', visible: () => canAdmin.value },
  { id: 'assignedCommunityReports', category: 'operations', icon: '📢', labelKey: 'communityReport.assigned.tabLabel', visible: () => isOrgAdmin.value },
  { id: 'risk', category: 'operations', icon: '🧭', labelKey: 'risk.tabLabel', visible: () => canAdmin.value },
  { id: 'resourceInventory', category: 'operations', icon: '🧰', labelKey: 'resourceInventory.tabLabel', visible: () => canAdmin.value },
  { id: 'hazardTaxonomy', category: 'config', icon: '🌋', labelKey: 'hazardTaxonomy.tabLabel', visible: () => hasCapability('hazard_taxonomy') },
  { id: 'sopRepository', category: 'config', icon: '📋', labelKey: 'incidentTracking.sopTabLabel', visible: () => hasCapability('sop_repository') },
  { id: 'capInbound', category: 'config', icon: '📥', labelKey: 'capInbound.tabLabel', visible: () => canAdmin.value },
  { id: 'aiAssistance', category: 'config', icon: '🤖', labelKey: 'ai.panelTitle', visible: () => canAdmin.value },
  { id: 'integrations', category: 'config', icon: '🔌', labelKey: 'integrations.tabLabel', visible: () => canCreateUsers.value },
  { id: 'audit', category: 'audit', icon: '🛡️', labelKey: 'audit.tabLabel', visible: () => hasCapability('audit'), onClick: openAuditTab },
]

const activeCategory = ref(CATEGORIES[0].id)

watch(tab, (newTab) => {
  const found = ADMIN_TABS.find((item) => item.id === newTab)
  if (found) activeCategory.value = found.category
})

const visibleCategories = computed(() =>
  CATEGORIES.filter((cat) => ADMIN_TABS.some((item) => item.category === cat.id && item.visible()))
)

const visibleTabsInActiveCategory = computed(() =>
  ADMIN_TABS.filter((item) => item.category === activeCategory.value && item.visible())
)

function selectCategory(catId) {
  activeCategory.value = catId
  const stillValid = ADMIN_TABS.some((item) => item.id === tab.value && item.category === catId && item.visible())
  if (stillValid) return
  const firstVisible = ADMIN_TABS.find((item) => item.category === catId && item.visible())
  if (firstVisible) (firstVisible.onClick ?? (() => { tab.value = firstVisible.id }))()
}

const adminMetrics = computed(() => {
  const activeSources = sourcesStore.sources.filter((source) => source.is_active).length
  // Built-in (Tier-1) kaynaklar artık data_sources'ta source_type dolu satırlar —
  // eski hardcoded /status tabanlı "Canlı Feed" sayacının yerini bu alıyor.
  const tier1Sources = sourcesStore.sources.filter((source) => source.source_type)
  const healthyTier1 = tier1Sources.filter((source) => source.health_state === 'healthy').length

  return [
    { label: t('admin.metrics.users'), value: usersCount.value, tone: usersCountError.value ? 'danger' : 'info' },
    { label: t('admin.metrics.orgs'), value: orgsCount.value, tone: orgsCountError.value ? 'danger' : 'neutral' },
    {
      label: t('admin.metrics.activeSources'),
      value: `${activeSources}/${sourcesStore.sources.length || 0}`,
      tone: sourcesStore.error ? 'danger' : 'success',
    },
    {
      label: t('admin.metrics.liveFeed'),
      value: `${healthyTier1}/${tier1Sources.length || 0}`,
      tone: healthyTier1 >= tier1Sources.length * 0.8 ? 'success' : 'warning',
    },
    { label: t('admin.metrics.activeDrills'), value: runningDrillsCount.value, tone: runningDrillsCount.value ? 'warning' : 'neutral' },
    { label: t('admin.metrics.auditRecords'), value: auditTotalCount.value, tone: auditError.value ? 'danger' : 'info' },
  ]
})

onMounted(() => {
  // Deep-link support (dashboard sidebar links to /admin?tab=<id>) — falls
  // back to the default 'users' tab silently for any unknown/missing query
  // value instead of erroring, since this is just a nicety, not a contract.
  if (typeof route.query.tab === 'string' && ADMIN_TABS.some((item) => item.id === route.query.tab)) {
    tab.value = route.query.tab
  }
  loadUsersCount()
  loadOrgsCount()
  loadRunningDrillsCount()
  loadAuditRecordsCount()
  hazardTypesStore.fetchHazardTypes()
  sourcesStore.fetchSources()
  sourcesRefreshTimer = setInterval(() => sourcesStore.fetchSources(), FASTEST_POLL_MS)
})

onUnmounted(() => {
  if (sourcesRefreshTimer) clearInterval(sourcesRefreshTimer)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-header">
      <div class="admin-header-top">
        <button class="btn-back" @click="router.push('/')">← {{ t('admin.header.backToMap') }}</button>
        <button class="btn-back" @click="handleLogout">
          ⎋ {{ t('admin.header.logout') }}
        </button>
      </div>
      <h1 class="admin-title">⚙️ {{ t('admin.header.title') }}</h1>
      <span class="admin-subtitle">{{ t('admin.header.subtitle') }}</span>
      <div class="admin-metrics">
        <div
          v-for="metric in adminMetrics"
          :key="metric.label"
          class="admin-metric"
          :class="`metric-${metric.tone}`"
        >
          <span class="metric-label">{{ metric.label }}</span>
          <strong class="metric-value">{{ metric.value }}</strong>
        </div>
      </div>
    </div>

    <!-- Categories: styled like the metric cards above (rectangular, tinted
         border per category) instead of pill buttons, so this row reads as
         part of the same visual language rather than a bolted-on control. -->
    <div class="tab-categories">
      <button
        v-for="cat in visibleCategories"
        :key="cat.id"
        :class="['tab-category', `category-${cat.id}`, { active: activeCategory === cat.id }]"
        @click="selectCategory(cat.id)"
      >
        <span class="tab-category-icon">{{ cat.icon }}</span>
        <span class="tab-category-label">{{ t(cat.labelKey) }}</span>
      </button>
    </div>

    <!-- Tabs (within the active category) — transitions in on category switch -->
    <Transition name="category-tabs" mode="out-in">
    <div class="tabs" :key="activeCategory">
      <button
        v-for="tabItem in visibleTabsInActiveCategory"
        :key="tabItem.id"
        :class="['tab', { active: tab === tabItem.id }]"
        @click="tabItem.onClick ? tabItem.onClick() : (tab = tabItem.id)"
      >
        {{ tabItem.icon }} {{ tabItem.labelKey ? t(tabItem.labelKey) : tabItem.label }}
      </button>
    </div>
    </Transition>

    <!-- ── Users tab ────────────────────────── -->
    <UsersPanel v-if="tab === 'users'" />

    <!-- ── Orgs tab ── -->
    <OrgsPanel v-if="tab === 'orgs'" />

    <!-- ── Drill tab ── -->
    <DrillPanel v-if="tab === 'drill'" @go-to-hazard-taxonomy="tab = 'hazardTaxonomy'" />

    <!-- ── Data Sources tab ──────────────────────────────────────────────── -->
    <SourcesPanel v-if="tab === 'sources'" />

    <!-- ── Manual Entry tab ──────────────────────────────────────────────── -->
    <div v-if="tab === 'manual'" class="tab-content">
      <ManualEntryForm />
    </div>

    <!-- ── CSV Import tab ────────────────────────────────────────────────── -->
    <div v-if="tab === 'csv'" class="tab-content">
      <FileImportForm />
    </div>

    <!-- ── Boundary Upload tab ───────────────────────────────────────────── -->
    <div v-if="tab === 'boundaries'" class="tab-content">
      <BoundaryUploadForm />
    </div>

    <!-- ── Contact Directory tab (spec 009) ─────────────────────────────────── -->
    <div v-if="tab === 'contacts'" class="tab-content">
      <ContactsPanel />
    </div>

    <!-- ── Dispatch monitor tab (spec 009) ──────────────────────────────────── -->
    <div v-if="tab === 'dispatch'" class="tab-content">
      <DispatchPanel />
    </div>

    <div v-if="tab === 'integrations'" class="tab-content">
      <IntegrationsPanel />
    </div>

    <!-- ── Hazard Taxonomy tab (spec 010, super_admin or spec 018 capability grant) ── -->
    <div v-if="tab === 'hazardTaxonomy' && hasCapability('hazard_taxonomy')" class="tab-content">
      <HazardTaxonomyPanel />
    </div>

    <!-- ── SOP Repository tab (spec 011, super_admin or spec 018 capability grant) ─── -->
    <div v-if="tab === 'sopRepository' && hasCapability('sop_repository')" class="tab-content">
      <SopRepositoryPanel />
    </div>

    <!-- ── Resource / Capacity Inventory tab (spec 062) ─────────────────────────── -->
    <div v-if="tab === 'resourceInventory' && canAdmin" class="tab-content">
      <ResourceInventoryPanel />
    </div>

    <!-- ── CAP Inbound Ingest tab (spec 065) ────────────────────────────────────── -->
    <div v-if="tab === 'capInbound' && canAdmin" class="tab-content">
      <CapInboundPanel />
    </div>

    <!-- ── Sandboxed AI Assistance tab (spec 051) ────────────────────────────────── -->
    <div v-if="tab === 'aiAssistance' && canAdmin" class="tab-content">
      <AiCapabilityTogglePanel />
      <hr style="margin: 24px 0; border-color: rgba(255,255,255,.1);" />
      <AiAnomalyFlagsPanel />
    </div>

    <!-- ── Map Layers tab (spec 012, super_admin or spec 018 capability grant) ──────── -->
    <div v-if="tab === 'mapLayers' && hasCapability('map_layers')" class="tab-content">
      <MapLayerRegistryPanel />
    </div>

    <!-- ── Audit & Compliance tab (spec 007, super_admin or spec 018 capability grant) ── -->
    <AuditPanel v-if="tab === 'audit' && hasCapability('audit')" />

    <!-- ── Exposure Datasets tab (spec 008) ─────────────────────────────────── -->
    <div v-if="tab === 'exposure' && canAdmin" class="tab-content">
      <ExposureDatasetManager />
    </div>

    <!-- ── Satellite Imagery tab (spec 066, unblocked) ──────────────────────── -->
    <div v-if="tab === 'satelliteImagery' && canAdmin" class="tab-content">
      <SatelliteImageryPanel />
    </div>

    <!-- ── Risk & Scenario Modeling tab (spec 039) ──────────────────────────── -->
    <div v-if="tab === 'risk' && canAdmin" class="tab-content risk-tab-content">
      <RiskIndicatorConfig />
      <RiskScoreDashboard />
      <ScenarioBuilder />
      <CountryRiskIndexPanel />
      <!-- ── Cascading Hazard Risk (spec 048) ───────────────────────────── -->
      <CascadeRuleConfig />
    </div>

    <!-- ── Community Reports moderation tab (spec 036) ──────────────────────── -->
    <div v-if="tab === 'communityReports' && canAdmin" class="tab-content">
      <CommunityReportsPanel />
    </div>

    <!-- ── org_admin's read-only assigned-reports tab (spec 036, US5) ───────── -->
    <div v-if="tab === 'assignedCommunityReports' && isOrgAdmin" class="tab-content">
      <AssignedCommunityReportsPanel />
    </div>

  </div>
</template>

<style scoped>
.admin-page {
  height: 100vh;
  overflow-y: auto;
  background:
    linear-gradient(180deg, rgba(12, 19, 36, 0.96), rgba(7, 11, 20, 1) 240px),
    var(--color-bg, #0f1117);
  color: var(--color-text-primary, #e2e8f0);
  padding: 20px 24px 28px;
  font-family: var(--font-sans, 'Inter', sans-serif);
}
.admin-header {
  position: sticky;
  /* `top: 0` here was WRONG, not just imprecise — .admin-page (the
     scrollport, overflow-y: auto) has padding-top: 20px, and a sticky
     element's `top` offset is measured from the scrollport's PADDING edge,
     not the viewport edge. So "top: 0" actually meant "stick 20px below
     the real top", leaving a permanent 20px gap every other card kept
     peeking through while scrolled — that's the colored strip bleed-through
     in the 2026-07-25 screenshot. Live-verified via Playwright
     (page.locator('.admin-header').bounding_box() after a real scroll):
     with `top: 0` the header's y stayed at 20 no matter how far the page
     scrolled; with `top: -20px` it correctly reaches y: 0. */
  top: -20px;
  z-index: 20;
  margin: -20px -24px 18px;
  /* Extra top padding (was 18px) — at scroll position 0 the sticky header
     sat flush against the viewport edge with no breathing room above
     "← Harita"/"Çıkış Yap" (2026-07-25 feedback: "boşluk olmamış"). */
  padding: 26px 24px 16px;
  /* 0.9 opacity let a sliver of whatever's scrolled behind the sticky
     header show through the blur at the very top edge — bumped
     near-opaque so the header fully occludes content scrolled underneath
     it once the top:0 bug above is also fixed, matching every other
     sticky/glass panel's own near-opaque backgrounds in this app. */
  background: rgba(7, 11, 20, 0.98);
  border-bottom: 1px solid rgba(148, 163, 184, 0.16);
  backdrop-filter: blur(18px) saturate(130%);
  -webkit-backdrop-filter: blur(18px) saturate(130%);
}
.admin-header-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.btn-back {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  color: var(--color-text-secondary, #cbd5e1);
  padding: 7px 14px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  margin-bottom: 0;
  display: inline-block;
}
.btn-back:hover {
  background: rgba(77, 163, 255, 0.12);
  border-color: rgba(77, 163, 255, 0.38);
  color: var(--color-text-primary, #e2e8f0);
}
.admin-title {
  font-size: 1.35rem;
  font-weight: 800;
  margin: 10px 0 4px;
  letter-spacing: 0;
}
.admin-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.admin-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
.admin-metric {
  min-height: 54px;
  padding: 9px 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.58);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.metric-label {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #94a3b8);
}
.metric-value {
  font-size: 1rem;
  color: var(--color-text-primary, #e2e8f0);
}
.metric-success { border-color: rgba(34, 197, 94, 0.3); }
.metric-warning { border-color: rgba(245, 158, 11, 0.34); }
.metric-danger { border-color: rgba(239, 68, 68, 0.34); }
.metric-info { border-color: rgba(77, 163, 255, 0.28); }

/* Same shape/grid language as .admin-metrics above — rectangular cards with
   a tinted border, not pill buttons — so this row reads as part of the
   header rather than a bolted-on, differently-styled control. */
.tab-categories {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
  margin-top: 36px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
}
.tab-category {
  min-height: 54px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tab-category-icon {
  font-size: 1.1rem;
  line-height: 1;
}
.tab-category-label {
  text-align: left;
}
.tab-category:hover:not(.active) {
  color: var(--color-text-primary, #e2e8f0);
  background: rgba(255, 255, 255, 0.06);
}

/* One tone per category, matching the .metric-* accent palette above so the
   two rows read as the same "flagged card" pattern with different colors. */
.category-identity { border-color: rgba(77, 163, 255, 0.28); }
.category-data { border-color: rgba(34, 197, 94, 0.3); }
.category-operations { border-color: rgba(245, 158, 11, 0.34); }
.category-config { border-color: rgba(168, 85, 247, 0.32); }
.category-audit { border-color: rgba(239, 68, 68, 0.34); }

.category-identity.active { color: #dbeafe; background: rgba(77, 163, 255, 0.2); border-color: rgba(77, 163, 255, 0.65); }
.category-data.active { color: #dcfce7; background: rgba(34, 197, 94, 0.18); border-color: rgba(34, 197, 94, 0.65); }
.category-operations.active { color: #fef3c7; background: rgba(245, 158, 11, 0.2); border-color: rgba(245, 158, 11, 0.65); }
.category-config.active { color: #f3e8ff; background: rgba(168, 85, 247, 0.2); border-color: rgba(168, 85, 247, 0.65); }
.category-audit.active { color: #fee2e2; background: rgba(239, 68, 68, 0.2); border-color: rgba(239, 68, 68, 0.65); }

/* Sub-tab row transitions in when the active category changes instead of
   just snapping to the new set. */
.category-tabs-enter-active,
.category-tabs-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.category-tabs-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.category-tabs-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  align-content: flex-start;
  margin-top: 12px;
  margin-bottom: 18px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.5);
}
.tab {
  min-height: 32px;
  padding: 7px 12px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
  flex: 0 1 auto;
}
.tab.active {
  color: #dbeafe;
  border-color: rgba(77, 163, 255, 0.42);
  background: rgba(77, 163, 255, 0.14);
}
.tab:hover:not(.active) {
  color: var(--color-text-primary, #e2e8f0);
  background: rgba(255, 255, 255, 0.05);
}

.tab-content {
  animation: fade-in 0.2s ease;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.42);
  padding: 16px;
}
.risk-tab-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.tab-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
/* Sources tab's own action row needs Sırala on the left / Genel Sağlık
   Raporu + Kaynak Ekle on the right (2026-07-25 request), unlike every
   other tab-actions row which is just right-aligned buttons. */
.sources-tab-actions {
  justify-content: space-between;
  align-items: center;
}
.sources-tab-actions-right {
  display: flex;
  gap: 8px;
}
.btn-diagnostic {
  background: rgba(77, 163, 255, 0.12);
  border-color: rgba(77, 163, 255, 0.35);
}
.health-report {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
  font-size: 0.8rem;
}
.health-report-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.health-report-header strong { font-size: 0.88rem; }
.health-report-header .btn-cancel-form { margin-left: auto; }
.health-report-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-bottom: 10px;
  font-size: 0.76rem;
}
.health-count-healthy { color: #22c55e; }
.health-count-degraded, .health-count-overdue { color: #fbbf24; }
.health-count-down, .health-count-offline { color: #ef4444; }
.health-count-disabled, .health-count-pending { color: #94a3b8; }
.health-report-ok { color: #22c55e; font-size: 0.8rem; }
.health-report-problems {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.health-report-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  padding: 4px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}
.health-report-hint {
  margin-top: 10px;
  font-size: 0.72rem;
  line-height: 1.5;
}
.tab-loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted, #94a3b8);
}
.tab-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  color: #ef4444;
  font-size: 0.85rem;
  margin-bottom: 12px;
}

.btn-new {
  padding: 8px 16px;
  background: rgba(77, 163, 255, 0.18);
  border: 1px solid rgba(77, 163, 255, 0.4);
  border-radius: 8px;
  color: #4da3ff;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.15s;
}
.btn-new:hover {
  background: rgba(77, 163, 255, 0.28);
}

/* Table */
.users-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.28);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.data-table th {
  padding: 9px 12px;
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #94a3b8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.72);
}
.data-table td {
  padding: 9px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: middle;
}
.data-table tr:hover td {
  background: rgba(77, 163, 255, 0.04);
}
.muted {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.75rem;
}
.role-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.role-super_admin {
  background: rgba(124, 58, 237, 0.2);
  color: #a78bfa;
}
.role-country_admin {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.role-org_admin {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}
.role-viewer {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
.row-actions {
  display: flex;
  gap: 6px;
}
.compliance-reports-section {
  margin-top: 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 16px;
}
.compliance-reports-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.compliance-report-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.compliance-report-period {
  font-weight: 600;
}
.dead-letter-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.capability-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
}
.capability-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  cursor: pointer;
}
.btn-edit,
.btn-revoke,
.btn-save,
.btn-cancel {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s;
}
.btn-edit:hover {
  background: rgba(77, 163, 255, 0.2);
}
.btn-revoke:hover {
  background: rgba(239, 68, 68, 0.2);
}
.btn-save:hover {
  background: rgba(34, 197, 94, 0.2);
}
.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.2);
}
.inline-select,
.inline-input {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 8px;
  color: #e2e8f0;
  font-size: 0.8rem;
}
.inline-select {
  color-scheme: dark;
}
.inline-select option {
  background: #1e2330;
  color: #e2e8f0;
}

/* Orgs */
.orgs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.org-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.org-name {
  font-weight: 600;
  font-size: 0.88rem;
}
.org-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}
.org-type,
.org-country {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
}
.org-parent {
  font-size: 0.7rem;
  color: var(--color-text-muted, #94a3b8);
}

/* Drills */
.drills-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.drill-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
}
.drill-card.drill-active {
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(251, 191, 36, 0.04);
}
.drill-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.drill-status {
  font-size: 0.72rem;
  font-weight: 700;
}
.ds-active {
  color: #fbbf24;
}
.ds-inactive {
  color: #94a3b8;
}
.ds-completed {
  color: #22c55e;
}
.drill-country,
.drill-scenario {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
}
.drill-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.drill-summary {
  font-size: 0.78rem;
  color: #60a5fa;
  margin-top: 4px;
}
.drill-actions {
  margin-top: 10px;
}
.drill-feedback {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drill-feedback label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.drill-feedback textarea,
.drill-feedback select {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  color-scheme: dark;
}
.btn-end-drill {
  padding: 7px 16px;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;
  color: #f87171;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.15s;
}
.btn-end-drill:hover {
  background: rgba(239, 68, 68, 0.28);
}

/* Form shared */
.form-card {
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.span-2 {
  grid-column: span 3;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.form-field input,
.form-field select {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  width: 100%;
}
.form-field select {
  color-scheme: dark;
}
.form-field select option {
  background: #1e2330;
  color: #e2e8f0;
}
.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: rgba(77, 163, 255, 0.5);
}
.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.form-error {
  color: #ef4444;
  font-size: 0.8rem;
  flex: 1;
}
.btn-submit {
  padding: 8px 18px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 8px;
  color: #22c55e;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.15s;
}
.btn-submit.drill-start {
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.4);
  color: #fbbf24;
}
.btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-submit:not(:disabled):hover {
  background: rgba(34, 197, 94, 0.3);
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition:
    max-height 0.3s ease,
    opacity 0.25s ease;
  max-height: 600px;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}

/* Data Sources */
.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.sources-group-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 14px 0 8px;
}
.sources-sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.sources-sort-control select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--color-text-primary, #e2e8f0);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.78rem;
  /* Without this, Chromium/Windows renders the OPENED native option list
     with its default white/light styling regardless of the closed box's
     own background — live-verified 2026-07-25. .form-field select (this
     file, SourceFormModal.vue) already had this; this select was added
     later and missed it. */
  color-scheme: dark;
}
.sources-sort-control select option {
  background: #1e2330;
  color: #e2e8f0;
}
.sources-divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.14);
  margin: 18px 0 4px;
}
.feed-card {
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.feed-card:hover {
  background: rgba(77, 163, 255, 0.06);
  border-color: rgba(77, 163, 255, 0.24);
}
.feed-card-inactive {
  opacity: 0.45;
  filter: grayscale(0.6);
}
.feed-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}
.feed-state {
  font-weight: 700;
}
.feed-card-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
}
.source-name {
  flex: 1;
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
}
.audit-panel {
  margin-top: 20px;
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 14px;
}
.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.audit-header h3 {
  margin: 0;
  font-size: 1rem;
}
.audit-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.audit-hint {
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--color-text-muted, #94a3b8);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
}
.audit-hint strong { color: var(--color-text-primary, #e2e8f0); }
.audit-section h4 {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.audit-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.82rem;
  flex-wrap: wrap;
}

/* ── Audit & Compliance tab (spec 007) ─────────────────────────────────── */
.audit-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.audit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.audit-field input,
.audit-field select {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
}
.audit-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.btn-export,
.btn-verify,
.btn-history {
  padding: 6px 14px;
  background: rgba(77, 163, 255, 0.15);
  border: 1px solid rgba(77, 163, 255, 0.35);
  border-radius: 8px;
  color: #4da3ff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-export:hover,
.btn-verify:hover,
.btn-history:hover {
  background: rgba(77, 163, 255, 0.25);
}
.access-review-export {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.lock-badge {
  color: #ef4444;
  font-size: 0.78rem;
  font-weight: 600;
}
.btn-verify:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.audit-notice {
  font-size: 0.8rem;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
}
.audit-notice-ok {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}
.audit-notice-error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.audit-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  color: var(--color-text-muted, #94a3b8);
  background: rgba(15, 23, 42, 0.72);
}
.audit-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.audit-mono {
  font-family: monospace;
  font-size: 0.75rem;
}
.audit-pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  font-size: 0.82rem;
}
.audit-pagination button {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
}
.audit-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.history-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.history-modal {
  background: #1a1e29;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 20px;
  width: min(480px, 90vw);
  max-height: 70vh;
  overflow-y: auto;
}
.history-list {
  list-style: none;
  padding: 0;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.82rem;
}

@media (max-width: 1100px) {
  .admin-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tab-categories {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tab {
    flex-basis: calc(25% - 8px);
    text-align: center;
  }

  .form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .span-2 {
    grid-column: span 2;
  }
}

@media (max-width: 720px) {
  .admin-page {
    padding: 14px;
  }

  .admin-header {
    margin: -14px -14px 14px;
    padding: 14px;
  }

  .admin-header-top {
    flex-direction: column;
    align-items: stretch;
  }

  .admin-header-top .btn-back {
    margin-right: 6px;
  }

  .admin-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tab-categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .tab {
    flex-basis: calc(50% - 8px);
  }

  .tab-content {
    padding: 12px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: span 1;
  }
}
</style>
