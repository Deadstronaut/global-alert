<script setup>
import { computed } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import { useAuthStore } from '@/stores/auth.js'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar'

const props = defineProps({
  variant: { type: String, default: 'inset' },
  activeAdminTab: { type: String, default: null },
})

const emit = defineEmits(['select-admin-tab'])

// Admin tabs that already have a standalone panel component and render
// inline in the dashboard's own content area instead of navigating to
// /admin — grows one entry at a time as each tab gets extracted out of
// AdminView.vue (see components/admin/UsersPanel.vue for the pattern).
// Anything not in this set still falls back to the old /admin?tab=<id>
// navigation until it's been extracted too.
const INLINE_ADMIN_TABS = new Set([
  'users', 'orgs', 'drill', 'sources', 'satelliteImagery', 'manual', 'csv', 'boundaries', 'contacts', 'dispatch', 'integrations',
  'hazardTaxonomy', 'sopRepository', 'mapLayers', 'exposure', 'communityReports',
  'assignedCommunityReports', 'aiAssistance', 'risk', 'audit', 'resourceInventory', 'capInbound',
])

const router = useRouter()
const { t } = useI18n()
const uiStore = useUIStore()
const authStore = useAuthStore()

// Mirrors AdminView.vue's own CATEGORIES/ADMIN_TABS nav structure (same
// ids/icons/i18n keys) so this reads as "the same admin menu, here too" —
// kept as a static list rather than importing AdminView's arrays directly
// since those close over a dozen AdminView-local permission computeds
// (hasCapability, canAdmin, isOrgAdmin...) that don't exist outside it.
// The coarse gate that matters (canAccessAdmin below, matching the /admin
// route's own role meta) still applies; AdminView's per-tab capability
// checks keep enforcing the finer-grained ones once you're on the page.
const adminCategories = [
  {
    id: 'identity', icon: '👥', labelKey: 'admin.categories.identity',
    tabs: [
      { id: 'users', icon: '👥', labelKey: 'admin.tabs.users' },
      { id: 'orgs', icon: '🏢', labelKey: 'admin.tabs.orgs' },
      { id: 'contacts', icon: '📇', labelKey: 'contacts.tabLabel' },
    ],
  },
  {
    id: 'data', icon: '📡', labelKey: 'admin.categories.data',
    tabs: [
      { id: 'satelliteImagery', icon: '🛰️', labelKey: 'satelliteImagery.tabLabel' },
      { id: 'sources', icon: '📡', labelKey: 'admin.tabs.sources' },
      { id: 'csv', icon: '📁', labelKey: 'admin.tabs.csv' },
      { id: 'manual', icon: '✍️', labelKey: 'admin.tabs.manual' },
      { id: 'boundaries', icon: '🗺️', labelKey: 'admin.tabs.boundaries' },
      { id: 'mapLayers', icon: '🗺️', labelKey: 'mapLayers.tabLabel' },
      { id: 'exposure', icon: '📊', labelKey: 'impact.exposure.tabLabel' },
    ],
  },
  {
    id: 'operations', icon: '🎯', labelKey: 'admin.categories.operations',
    tabs: [
      { id: 'drill', icon: '🎯', labelKey: 'admin.tabs.drill' },
      { id: 'dispatch', icon: '📨', labelKey: 'dispatch.panelTitle' },
      { id: 'communityReports', icon: '📢', labelKey: 'communityReport.moderation.tabLabel' },
      { id: 'risk', icon: '🧭', labelKey: 'risk.tabLabel' },
      { id: 'resourceInventory', icon: '🧰', labelKey: 'resourceInventory.tabLabel' },
    ],
  },
  {
    id: 'config', icon: '⚙️', labelKey: 'admin.categories.config',
    tabs: [
      { id: 'hazardTaxonomy', icon: '🌋', labelKey: 'hazardTaxonomy.tabLabel' },
      { id: 'sopRepository', icon: '📋', labelKey: 'incidentTracking.sopTabLabel' },
      { id: 'capInbound', icon: '📥', labelKey: 'capInbound.tabLabel' },
      { id: 'aiAssistance', icon: '🤖', labelKey: 'ai.panelTitle' },
      { id: 'integrations', icon: '🔌', labelKey: 'integrations.tabLabel' },
    ],
  },
  {
    id: 'audit', icon: '🛡️', labelKey: 'admin.categories.audit',
    tabs: [
      { id: 'audit', icon: '🛡️', labelKey: 'audit.tabLabel' },
    ],
  },
]

const canAccessAdmin = computed(() =>
  ['super_admin', 'country_admin', 'org_admin'].includes(authStore.session?.role)
)

const userEmail = computed(() => authStore.session?.email ?? '')
const userRoleLabel = computed(() => authStore.session?.role?.replace(/_/g, ' ') ?? '')

function navigateTo(url) {
  uiStore.toggleDashboardPanel()
  router.push(url)
}

function navigateToAdminTab(tabId) {
  if (INLINE_ADMIN_TABS.has(tabId)) {
    emit('select-admin-tab', tabId)
    return
  }
  navigateTo(`/admin?tab=${tabId}`)
}
</script>

<template>
  <!-- shadcn-vue's desktop Sidebar column is `fixed` + `h-svh` by design
       (a real full-page app shell pinned to the true browser viewport) — we
       only ever render this inside the Dashboard's own dialog
       (DashboardPlaceholder.vue), which is shorter than the full viewport,
       so that made the sidebar (and its footer) overflow past the dialog's
       clipped bottom edge. `absolute h-full` scopes it to the dialog
       instead, which is `position: relative` for exactly this reason. -->
  <Sidebar :variant="variant" class="absolute h-full">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg">
            <div class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              📊
            </div>
            <div class="grid flex-1 text-left text-sm leading-tight">
              <span class="truncate font-medium">{{ t('app.dashboard') }}</span>
              <span class="truncate text-xs">MHEWS</span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup v-if="canAccessAdmin">
        <SidebarGroupLabel>{{ t('settings.admin') }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <!-- Kullanıcı isteği (2026-08-18): panel ilk açıldığında tüm
                 kategoriler kapalı geliyordu, kullanıcı her birini tek tek
                 açmak zorunda kalıyordu — default-open ile hepsi baştan
                 açık, tüm alt seçenekler ilk bakışta görünür durumda. -->
            <Collapsible v-for="cat in adminCategories" :key="cat.id" as-child default-open class="group/collapsible">
              <SidebarMenuItem>
                <CollapsibleTrigger as-child>
                  <SidebarMenuButton :tooltip="t(cat.labelKey)">
                    <span>{{ cat.icon }}</span>
                    <span>{{ t(cat.labelKey) }}</span>
                    <ChevronRight class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem v-for="tabItem in cat.tabs" :key="tabItem.id">
                      <SidebarMenuSubButton as-child :is-active="activeAdminTab === tabItem.id">
                        <a href="#" @click.prevent="navigateToAdminTab(tabItem.id)">
                          <span>{{ tabItem.icon }} {{ t(tabItem.labelKey) }}</span>
                        </a>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <!-- 2026-08-19: the standalone public portal page (/portal,
           PublicPortalView.vue) was removed — its citizen web-push opt-in
           moved into IntegrationsPanel.vue (below the credential form), and
           the page itself (anonymous alert listing) is retired. No link to
           it belongs here anymore. -->

      <!-- spec 069 follow-up: the "Sayfalar" group (CAP/Olay Takibi/
           Barınaklar/Tehlike Ansiklopedisi/Vatandaş Bildirimi) that used to
           render here is removed — the same five pages are already reachable
           without opening this Panel dialog at all now, via AppHeader.vue's
           quick-access icons and HazardTypeNav.vue's "?" button (both open
           the same QuickPageDialog), so keeping a second, redundant entry
           point to them here was no longer earning its place (explicit
           request, confirmed 2026-08-18).
           The "⚙️ Ayarlar" collapsible that used to embed SettingsPanel.vue
           here is removed too — that panel's only embedded-mode content
           (Language, Appearance & Accessibility) has moved to
           AppHeader.vue's dropdowns (its Quick Access/Account sections were
           already hidden here via the `embedded` prop, in favor of the
           Sayfalar group above and the account footer below), so embedding
           it here would now render nothing. -->
    </SidebarContent>
    <!-- spec 069 follow-up: this used to be a DropdownMenu (avatar/email/
         role trigger opening account-security/logout actions) — those
         actions now live in AppHeader.vue's own account dropdown (069
         shell work), so keeping a second, duplicate menu here would edit
         the same state from two places. Kept as a plain, non-interactive
         identity readout (email + role text only, no avatar) instead of
         removing it outright, per request. -->
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <div class="flex flex-col gap-0.5 px-2 py-1.5 text-sm leading-tight">
            <span class="truncate text-xs capitalize text-muted-foreground">{{ userRoleLabel }}</span>
            <span class="truncate font-medium">{{ userEmail }}</span>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
