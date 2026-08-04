<script setup>
import { computed } from 'vue'
import { AlertTriangle, Siren, Home, Mountain, Megaphone, ChevronRight, ChevronsUpDown, LogOut, UserCircle } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import { useAuthStore } from '@/stores/auth.js'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import SettingsPanel from '@/components/SettingsPanel.vue'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  'users', 'orgs', 'drill', 'sources', 'manual', 'csv', 'boundaries', 'contacts', 'dispatch', 'integrations',
  'hazardTaxonomy', 'sopRepository', 'mapLayers', 'exposure', 'communityReports',
  'assignedCommunityReports', 'aiAssistance', 'risk', 'audit',
])

const router = useRouter()
const { t } = useI18n()
const uiStore = useUIStore()
const authStore = useAuthStore()

// Same set of pages Settings' quick-access list links to (SettingsPanel.vue)
// — rendered inline in the Dashboard's own content area (see
// DashboardPlaceholder.vue's ADMIN_TAB_PANELS), same pattern as the admin
// tabs below, instead of navigating away to their own /alerts/cap etc. route.
const navItems = [
  { id: 'cap', titleKey: 'dashboard.navCap', icon: AlertTriangle },
  { id: 'incidents', titleKey: 'dashboard.navIncidents', icon: Siren },
  { id: 'shelters', titleKey: 'dashboard.navShelters', icon: Home },
  { id: 'hazards', titleKey: 'dashboard.navHazards', icon: Mountain },
  { id: 'report', titleKey: 'dashboard.navReport', icon: Megaphone },
]

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
    ],
  },
  {
    id: 'config', icon: '⚙️', labelKey: 'admin.categories.config',
    tabs: [
      { id: 'hazardTaxonomy', icon: '🌋', labelKey: 'hazardTaxonomy.tabLabel' },
      { id: 'sopRepository', icon: '📋', labelKey: 'incidentTracking.sopTabLabel' },
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
const userInitials = computed(() => (userEmail.value ? userEmail.value.slice(0, 2).toUpperCase() : '?'))
const userRoleLabel = computed(() => authStore.session?.role?.replace(/_/g, ' ') ?? '')

async function handleLogout() {
  await authStore.logout()
  router.push('/login')
}

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
            <Collapsible v-for="cat in adminCategories" :key="cat.id" as-child class="group/collapsible">
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

      <SidebarGroup>
        <SidebarGroupLabel>{{ t('dashboard.navGroupTitle') }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in navItems" :key="item.id">
              <SidebarMenuButton :is-active="activeAdminTab === item.id" @click="emit('select-admin-tab', item.id)">
                <component :is="item.icon" />
                <span>{{ t(item.titleKey) }}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <!-- The old right-hand "⚙️ Ayarlar" panel (SidebarPanel.vue's gear
           button, now removed) folded in here instead — same SettingsPanel
           component, `embedded` hides its Quick Access / Account sections
           since those are already covered by the Sayfalar group above and
           the account footer below. -->
      <SidebarGroup>
        <SidebarMenu>
          <Collapsible as-child class="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger as-child>
                <SidebarMenuButton :tooltip="t('settings.title')">
                  <span>⚙️</span>
                  <span>{{ t('settings.title') }}</span>
                  <ChevronRight class="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SettingsPanel embedded hide-header />
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton size="lg">
                <Avatar class="size-8 rounded-lg">
                  <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-medium">{{ userEmail }}</span>
                  <span class="truncate text-xs capitalize">{{ userRoleLabel }}</span>
                </div>
                <ChevronsUpDown class="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg" side="top" align="start">
              <DropdownMenuLabel class="p-0 font-normal">
                <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar class="size-8 rounded-lg">
                    <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
                  </Avatar>
                  <div class="grid flex-1 text-left text-sm leading-tight">
                    <span class="truncate font-medium">{{ userEmail }}</span>
                    <span class="truncate text-xs capitalize">{{ userRoleLabel }}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="navigateTo('/account-security')">
                <UserCircle />
                {{ t('accountSecurity.title') }}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="handleLogout">
                <LogOut />
                {{ t('admin.header.logout') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  </Sidebar>
</template>
