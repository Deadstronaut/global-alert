<script setup>
import { ref, computed, watch } from 'vue'
import { useUIStore } from '@/stores/ui.js'
import { useAuthStore } from '@/stores/auth.js'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import AppSidebar from '@/components/dashboard/AppSidebar.vue'
import EarthquakeHourlyChart from '@/components/dashboard/charts/EarthquakeHourlyChart.vue'
import EarthquakeSeverityChart from '@/components/dashboard/charts/EarthquakeSeverityChart.vue'
import EarthquakeMagnitudeChart from '@/components/dashboard/charts/EarthquakeMagnitudeChart.vue'
import EarthquakeDepthChart from '@/components/dashboard/charts/EarthquakeDepthChart.vue'
import EarthquakeSourceChart from '@/components/dashboard/charts/EarthquakeSourceChart.vue'
import EarthquakeMagnitudeTrendChart from '@/components/dashboard/charts/EarthquakeMagnitudeTrendChart.vue'
import EarthquakeTrendChart from '@/components/dashboard/charts/EarthquakeTrendChart.vue'
import ForecastPanel from '@/components/dashboard/ForecastPanel.vue'
import UsersPanel from '@/components/admin/UsersPanel.vue'
import OrgsPanel from '@/components/admin/OrgsPanel.vue'
import DrillPanel from '@/components/admin/DrillPanel.vue'
import SourcesPanel from '@/components/admin/SourcesPanel.vue'
import AuditPanel from '@/components/admin/AuditPanel.vue'
import ManualEntryForm from '@/components/admin/ManualEntryForm.vue'
import FileImportForm from '@/components/admin/FileImportForm.vue'
import BoundaryUploadForm from '@/components/admin/BoundaryUploadForm.vue'
import ContactsPanel from '@/components/admin/ContactsPanel.vue'
import DispatchPanel from '@/components/admin/DispatchPanel.vue'
import IntegrationsPanel from '@/components/admin/IntegrationsPanel.vue'
import HazardTaxonomyPanel from '@/components/admin/HazardTaxonomyPanel.vue'
import SopRepositoryPanel from '@/components/admin/SopRepositoryPanel.vue'
import MapLayerRegistryPanel from '@/components/admin/MapLayerRegistryPanel.vue'
import ExposureDatasetManager from '@/components/impact/ExposureDatasetManager.vue'
import CommunityReportsPanel from '@/components/admin/CommunityReportsPanel.vue'
import AssignedCommunityReportsPanel from '@/components/admin/AssignedCommunityReportsPanel.vue'
import AiCapabilityTogglePanel from '@/components/admin/AiCapabilityTogglePanel.vue'
import AiAnomalyFlagsPanel from '@/components/admin/AiAnomalyFlagsPanel.vue'
import RiskIndicatorConfig from '@/components/risk/RiskIndicatorConfig.vue'
import RiskScoreDashboard from '@/components/risk/RiskScoreDashboard.vue'
import ScenarioBuilder from '@/components/risk/ScenarioBuilder.vue'
import CountryRiskIndexPanel from '@/components/risk/CountryRiskIndexPanel.vue'
import CascadeRuleConfig from '@/components/risk/CascadeRuleConfig.vue'
import CapView from '@/views/CapView.vue'
import IncidentsView from '@/views/IncidentsView.vue'
import ShelterInfoView from '@/views/ShelterInfoView.vue'
import HazardEncyclopediaView from '@/views/HazardEncyclopediaView.vue'
import ReportHazardView from '@/views/ReportHazardView.vue'

const uiStore = useUIStore()
const authStore = useAuthStore()
const { t } = useI18n()

// Admin tabs rendered inline (see AppSidebar.vue's INLINE_ADMIN_TABS) — one
// entry per tab already extracted out of / already standalone in
// AdminView.vue. 'aiAssistance' is handled separately below (it's two
// components stacked, not a single one, in the original tab too).
const ADMIN_TAB_PANELS = {
  users: UsersPanel,
  orgs: OrgsPanel,
  drill: DrillPanel,
  sources: SourcesPanel,
  manual: ManualEntryForm,
  csv: FileImportForm,
  boundaries: BoundaryUploadForm,
  contacts: ContactsPanel,
  dispatch: DispatchPanel,
  integrations: IntegrationsPanel,
  hazardTaxonomy: HazardTaxonomyPanel,
  sopRepository: SopRepositoryPanel,
  mapLayers: MapLayerRegistryPanel,
  exposure: ExposureDatasetManager,
  communityReports: CommunityReportsPanel,
  assignedCommunityReports: AssignedCommunityReportsPanel,
  audit: AuditPanel,
  cap: CapView,
  incidents: IncidentsView,
  shelters: ShelterInfoView,
  hazards: HazardEncyclopediaView,
  report: ReportHazardView,
}
// Top-level pages (AppSidebar.vue's navItems) — same inline-render pipeline
// as the admin tabs above, but these need the `embedded` prop so they hide
// their own "back to map" button and fit the dialog's height instead of the
// full viewport (see CapView.vue's `embedded` prop comment).
const PAGE_TAB_IDS = new Set(['cap', 'incidents', 'shelters', 'hazards', 'report'])
const ADMIN_TAB_LABEL_KEYS = {
  users: 'admin.tabs.users',
  orgs: 'admin.tabs.orgs',
  drill: 'admin.tabs.drill',
  sources: 'admin.tabs.sources',
  manual: 'admin.tabs.manual',
  csv: 'admin.tabs.csv',
  boundaries: 'admin.tabs.boundaries',
  contacts: 'contacts.tabLabel',
  dispatch: 'dispatch.panelTitle',
  integrations: 'integrations.tabLabel',
  hazardTaxonomy: 'hazardTaxonomy.tabLabel',
  sopRepository: 'incidentTracking.sopTabLabel',
  mapLayers: 'mapLayers.tabLabel',
  exposure: 'impact.exposure.tabLabel',
  communityReports: 'communityReport.moderation.tabLabel',
  assignedCommunityReports: 'communityReport.assigned.tabLabel',
  aiAssistance: 'ai.panelTitle',
  risk: 'risk.tabLabel',
  audit: 'audit.tabLabel',
  cap: 'dashboard.navCap',
  incidents: 'dashboard.navIncidents',
  shelters: 'dashboard.navShelters',
  hazards: 'dashboard.navHazards',
  report: 'dashboard.navReport',
}

// Mirrors AdminView.vue's own per-tab capability/role gates (hasCapability,
// canAdmin, isOrgAdmin) — the Dashboard's "Yönetim" nav group is already
// gated coarsely by canAccessAdmin, but a country_admin/org_admin without
// the specific named capability shouldn't see a tab's real content just
// because they can see the Dashboard at all, matching /admin's own behavior.
function hasCapability(cap) {
  return authStore.isSuperAdmin || (authStore.session?.capabilities ?? []).includes(cap)
}
const canAdmin = computed(() => authStore.isSuperAdmin || authStore.session?.role === 'country_admin')
const isOrgAdmin = computed(() => authStore.session?.role === 'org_admin')
const ADMIN_TAB_GATES = {
  hazardTaxonomy: () => hasCapability('hazard_taxonomy'),
  sopRepository: () => hasCapability('sop_repository'),
  mapLayers: () => hasCapability('map_layers'),
  aiAssistance: () => canAdmin.value,
  risk: () => canAdmin.value,
  exposure: () => canAdmin.value,
  communityReports: () => canAdmin.value,
  assignedCommunityReports: () => isOrgAdmin.value,
  audit: () => hasCapability('audit'),
}
function canRenderAdminTab(tabId) {
  const gate = ADMIN_TAB_GATES[tabId]
  return !gate || gate()
}

const activeAdminTab = ref(null)
const activeAdminTabLabel = computed(() =>
  activeAdminTab.value ? t(ADMIN_TAB_LABEL_KEYS[activeAdminTab.value]) : null
)

function resetToOverview() {
  activeAdminTab.value = null
}

// Reopening the dashboard later should always land back on the overview,
// not silently resume whichever admin tab was open when it was last closed.
watch(() => uiStore.dashboardPanelOpen, (open) => {
  if (!open) activeAdminTab.value = null
})
</script>

<template>
  <Transition name="dashboard-fade">
    <div
      v-if="uiStore.dashboardPanelOpen"
      class="dashboard-backdrop"
      @click.self="uiStore.toggleDashboardPanel()"
    >
      <div class="dashboard-dialog glass-panel" role="dialog" aria-modal="true">
        <SidebarProvider class="h-full min-h-0">
          <AppSidebar
            variant="inset"
            :active-admin-tab="activeAdminTab"
            @select-admin-tab="activeAdminTab = $event"
          />
          <SidebarInset>
            <header class="flex h-14 shrink-0 items-center gap-2 border-b">
              <div class="flex flex-1 items-center gap-2 px-4">
                <SidebarTrigger class="-ml-1" />
                <Separator orientation="vertical" class="mr-2 data-[orientation=vertical]:h-4" />
                <button
                  type="button"
                  class="font-medium"
                  :class="{ 'text-muted-foreground hover:text-foreground': activeAdminTab }"
                  @click="resetToOverview"
                >
                  {{ t('app.dashboard') }}
                </button>
                <template v-if="activeAdminTabLabel">
                  <span class="text-muted-foreground">/</span>
                  <span class="font-medium">{{ activeAdminTabLabel }}</span>
                </template>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="mr-2"
                @click="uiStore.toggleDashboardPanel()"
                :title="t('app.close')"
              >
                ✕
              </Button>
            </header>
            <div v-if="!activeAdminTab" class="flex flex-1 flex-col gap-4 overflow-auto p-4">
              <h3 class="text-sm font-semibold text-muted-foreground">{{ t('dashboard.overviewTitle') }}</h3>
              <ForecastPanel />
              <div class="grid auto-rows-min gap-4 md:grid-cols-3">
                <EarthquakeHourlyChart />
                <EarthquakeSeverityChart />
                <EarthquakeMagnitudeChart />
                <EarthquakeDepthChart />
                <EarthquakeSourceChart />
                <EarthquakeMagnitudeTrendChart />
              </div>
              <EarthquakeTrendChart />
            </div>
            <div v-else class="flex flex-1 flex-col overflow-auto p-4">
              <p v-if="!canRenderAdminTab(activeAdminTab)" class="text-muted-foreground text-sm">
                {{ t('dashboard.noPermission') }}
              </p>
              <template v-else-if="activeAdminTab === 'aiAssistance'">
                <AiCapabilityTogglePanel />
                <hr class="my-6 border-border" />
                <AiAnomalyFlagsPanel />
              </template>
              <div v-else-if="activeAdminTab === 'risk'" class="flex flex-col gap-6">
                <RiskIndicatorConfig />
                <RiskScoreDashboard />
                <ScenarioBuilder />
                <CountryRiskIndexPanel />
                <CascadeRuleConfig />
              </div>
              <component
                :is="ADMIN_TAB_PANELS[activeAdminTab]"
                v-else
                :embedded="PAGE_TAB_IDS.has(activeAdminTab) ? true : undefined"
                @go-to-hazard-taxonomy="activeAdminTab = 'hazardTaxonomy'"
              />
            </div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.dashboard-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-alerts);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
}

.dashboard-dialog {
  /* shadcn-vue's Sidebar renders its desktop column as `fixed` + `h-svh`,
     designed for a real full-page app shell pinned to the true viewport.
     Nested in this dialog that overflowed the dialog's own (shorter)
     bounds — the sidebar's footer sat below the dialog's clipped edge and
     got cut off. `position: relative` here gives that `fixed` column a
     containing block scoped to the dialog instead of the viewport; see
     AppSidebar.vue's `absolute h-full` override on <Sidebar> for the other
     half of the fix. */
  position: relative;
  width: 96vw;
  max-width: 96vw;
  height: 92dvh;
  max-height: 92dvh;
  display: flex;
  flex-direction: column;
  background: rgba(15, 17, 23, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.dashboard-fade-enter-active,
.dashboard-fade-leave-active {
  transition: opacity var(--transition-slow);
}

.dashboard-fade-enter-from,
.dashboard-fade-leave-to {
  opacity: 0;
}
</style>
