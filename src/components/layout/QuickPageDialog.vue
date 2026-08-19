<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import CapView from '@/views/CapView.vue'
import IncidentsView from '@/views/IncidentsView.vue'
import ShelterInfoView from '@/views/ShelterInfoView.vue'
import HazardEncyclopediaView from '@/views/HazardEncyclopediaView.vue'
import ReportHazardView from '@/views/ReportHazardView.vue'

// spec 069 follow-up: header/hazard-row quick-access — reuses the exact
// same components + `embedded` prop DashboardPlaceholder.vue's
// ADMIN_TAB_PANELS/PAGE_TAB_IDS already render inline in the Panel dialog,
// just triggered directly from the shell instead of requiring
// Panel -> Sayfalar -> click first. Not a duplicate implementation — same
// view components, same `embedded` contract, a second entry point only.
const PAGE_PANELS = {
  cap: CapView,
  incidents: IncidentsView,
  shelters: ShelterInfoView,
  hazards: HazardEncyclopediaView,
  report: ReportHazardView,
}

const PAGE_TITLE_KEYS = {
  cap: 'dashboard.navCap',
  incidents: 'dashboard.navIncidents',
  shelters: 'dashboard.navShelters',
  hazards: 'dashboard.navHazards',
  report: 'dashboard.navReport',
}

const props = defineProps({
  pageId: { type: String, default: null }, // 'cap' | 'incidents' | 'shelters' | 'hazards' | 'report' | null
})
const emit = defineEmits(['close'])

const { t } = useI18n()
const activeComponent = computed(() => (props.pageId ? PAGE_PANELS[props.pageId] : null))
const activeTitle = computed(() => (props.pageId ? t(PAGE_TITLE_KEYS[props.pageId]) : ''))
</script>

<template>
  <Teleport to="body">
    <div v-if="pageId" class="quick-page-overlay" @click.self="emit('close')">
      <div class="quick-page-card">
        <div class="quick-page-header">
          <h3>{{ activeTitle }}</h3>
          <button type="button" class="quick-page-close" @click="emit('close')" :aria-label="t('app.close')">✕</button>
        </div>
        <div class="quick-page-body">
          <component :is="activeComponent" embedded />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same overlay/card pattern as ImpactPanel.vue's scenario dialog and
   ConfirmDialog.vue — the app's established "real modal" convention. */
.quick-page-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.quick-page-card {
  background: #161b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  width: min(1100px, 92vw);
  height: min(820px, 84dvh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.quick-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.quick-page-header h3 { margin: 0; font-size: 1rem; color: #e2e8f0; }
.quick-page-close {
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 1rem;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.quick-page-close:hover { background: rgba(255, 255, 255, 0.1); }
.quick-page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
</style>
