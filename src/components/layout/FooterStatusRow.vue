<script setup>
import { useI18n } from 'vue-i18n'
import { useUIStore, MIN_HEX_RES, MAX_HEX_RES } from '@/stores/ui.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { useSourcesStore } from '@/stores/sources.js'
import { useAuthStore } from '@/stores/auth.js'
import { computed, onMounted, ref } from 'vue'
import { Slider } from '@/components/ui/slider'

// Moved verbatim from SidebarPanel.vue's viewMode-section hex-panel block +
// severityLegend section (spec 069 research.md §9) — same store bindings,
// not reimplemented.
const uiStore = useUIStore()
const disasterStore = useDisasterStore()
const sourcesStore = useSourcesStore()
const authStore = useAuthStore()
const { t } = useI18n()

// Mirrors AppSidebar.vue's canAccessAdmin exactly — the Sources tab has no
// per-tab gate of its own inside the panel (ADMIN_TAB_GATES), it relies on
// the sidebar only ever offering it to these roles. Opening it from here
// bypasses that sidebar entirely, so this check has to be duplicated or a
// viewer could reach it straight from the footer.
const canAccessSourceHealth = computed(() =>
  ['super_admin', 'country_admin', 'org_admin'].includes(authStore.session?.role)
)

onMounted(() => {
  if (!sourcesStore.sources.length) sourcesStore.fetchSources()
})

// ↻ used to only refresh disaster events — the source-count badge next to it
// never changed until the next unrelated re-mount, so a real aggregator
// outage (see 2026-08-19 live incident) looked identical to a healthy one
// until someone opened /admin manually. Now it re-pulls source health too.
const refreshingSources = ref(false)
async function refreshAll() {
  const sourcesRefresh = (async () => {
    refreshingSources.value = true
    try {
      await sourcesStore.fetchSources()
    } finally {
      refreshingSources.value = false
    }
  })()
  await Promise.all([disasterStore.refreshAll(), sourcesRefresh])
}

// Opens the Dashboard panel straight to the Sources tab with the same
// read-only "Genel Sağlık Raporu" the tab's own 🩺 button runs, pre-
// triggered — admin lives inside the Dashboard panel now (DashboardPlaceholder.vue),
// not its own /admin page, so this opens that panel rather than navigating.
// canRenderAdminTab('sources') inside the panel still gates actual content
// for non-admin viewers; this just opens the panel shell.
function openSourceHealthReport() {
  if (!canAccessSourceHealth.value) return
  uiStore.openDashboardAdminTab('sources', { openHealth: true })
}

const totalKnownSources = computed(() => sourcesStore.sources.filter((s) => s.is_active).length || 10)
const healthySourcesCount = computed(
  () => sourcesStore.sources.filter((s) => s.is_active && s.health_state === 'healthy').length,
)

function getSourceStatusClass(count, total = totalKnownSources.value) {
  const ratio = total > 0 ? count / total : 0
  if (ratio >= 0.8) return 'source-level-4'
  if (ratio >= 0.6) return 'source-level-3'
  if (ratio >= 0.4) return 'source-level-2'
  if (ratio > 0) return 'source-level-1'
  return 'source-level-0'
}

const severityLevels = ['critical', 'high', 'moderate', 'low', 'minimal']
</script>

<template>
  <div class="footer-status-row glass-panel">
    <div class="footer-status-group">
      <span class="footer-status-label">{{ t('sidebar.viewModeSection') }}</span>
      <!-- spec 069 follow-up: reordered to Isı/Durum/Petek per request
           (was Durum/Petek/Isı) — values/store bindings unchanged, only
           display order. Switched from shadcn's ToggleGroup to plain
           buttons + a manually-computed `active` class — the ToggleGroup's
           own data-state="on" never reliably reflected uiStore.mapMode
           (mismatch between its internal selection tracking and this
           store-driven :model-value, even with the selector at
           !important). Same reliable pattern HazardTypeNav.vue/
           DateScrubberFooter.vue already use successfully. -->
      <div class="footer-mode-selector" role="group" :aria-label="t('sidebar.viewModeSection')">
        <button
          type="button"
          class="footer-mode-btn"
          :class="{ active: uiStore.mapMode === 'heatmap' }"
          @click="uiStore.toggleMapMode('heatmap')"
          :title="`${t('sidebar.modeHeatmap')} (3)`"
        >
          🔥 {{ t('sidebar.modeHeatmap') }}
        </button>
        <button
          type="button"
          class="footer-mode-btn"
          :class="{ active: uiStore.mapMode === 'normal' }"
          @click="uiStore.toggleMapMode('normal')"
          :title="`${t('sidebar.modeNormal')} (1)`"
        >
          📍 {{ t('sidebar.modeNormal') }}
        </button>
        <button
          type="button"
          class="footer-mode-btn"
          :class="{ active: uiStore.mapMode === 'hexagon' }"
          @click="uiStore.toggleMapMode('hexagon')"
          :title="`${t('sidebar.modeHexagon')} (2)`"
        >
          ⬡ {{ t('sidebar.modeHexagon') }}
        </button>
      </div>
      <div class="footer-hex-resolution">
        <Slider
          :min="MIN_HEX_RES"
          :max="MAX_HEX_RES"
          :step="1"
          :model-value="[uiStore.manualHexResolution ?? MIN_HEX_RES]"
          :disabled="uiStore.mapMode !== 'hexagon'"
          @update:model-value="(v) => uiStore.setManualHexResolution(v[0])"
          class="footer-hex-slider"
          :title="t('sidebar.hexResolution.label')"
          :aria-label="t('sidebar.hexResolution.label')"
        />
        <span class="footer-hex-value">H{{ uiStore.manualHexResolution ?? MIN_HEX_RES }}</span>
      </div>
    </div>

    <div class="footer-status-legend">
      <button
        v-for="severity in severityLevels"
        :key="severity"
        class="footer-legend-item"
        :class="{ inactive: !disasterStore.isSeverityActive(severity) }"
        @click="disasterStore.toggleSeverity(severity)"
      >
        <span class="footer-legend-dot" :class="severity"></span>
        <span>{{ t(`severity.${severity}`) }}</span>
      </button>
    </div>

    <div v-if="disasterStore.lastUpdated" class="footer-status-badge">
      <button
        class="footer-refresh-icon"
        :class="{ spinning: disasterStore.isLoading || refreshingSources }"
        @click="refreshAll"
        :disabled="disasterStore.isLoading || refreshingSources"
        :title="t('app.refreshAll')"
        :aria-label="t('app.refreshAll')"
      >
        ↻
      </button>
      <component
        :is="canAccessSourceHealth ? 'button' : 'span'"
        type="button"
        class="footer-status-sources"
        :class="[getSourceStatusClass(healthySourcesCount), { 'footer-status-sources-btn': canAccessSourceHealth }]"
        @click="openSourceHealthReport"
        :title="canAccessSourceHealth ? t('stats.sourcesOnlineDetails') : undefined"
      >
        {{ healthySourcesCount }}/{{ totalKnownSources }} {{ t('stats.sourcesOnline') }}
      </component>
    </div>
  </div>
</template>

<style scoped>
.footer-status-row {
  position: relative;
  z-index: var(--z-shell);
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  padding: var(--space-xs) var(--space-md);
  border-left: none;
  border-right: none;
  border-bottom: none;
  font-size: 0.85rem;
}

.footer-status-group {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.footer-status-label {
  font-size: 0.75rem;
  opacity: 0.7;
  white-space: nowrap;
}

.footer-mode-selector {
  display: flex;
  gap: 6px;
}

.footer-mode-btn {
  flex: none;
  border: 1px solid var(--glass-border);
  background: transparent;
  color: var(--color-text-primary);
  border-radius: var(--radius);
  font-size: 0.78rem;
  padding: 4px 8px;
  cursor: pointer;
  transition: background var(--transition-normal), border-color var(--transition-normal);
}

.footer-mode-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* Matches HazardTypeNav.vue's .hazard-type-btn.active exactly (same rgba
   fill + border color) — one consistent "selected" look across hazard
   chips, this mode selector, and the date scrubber's selected day. */
.footer-mode-btn.active {
  background: rgba(33, 150, 243, 0.25);
  border-color: var(--color-flood);
}

.footer-hex-resolution {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 120px;
}

.footer-hex-slider {
  flex: 1;
}

.footer-hex-value {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.footer-status-legend {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex: 1;
  flex-wrap: wrap;
}

.footer-legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 0.78rem;
  opacity: 1;
  transition: opacity var(--transition-normal);
}

.footer-legend-item.inactive {
  opacity: 0.4;
}

.footer-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.footer-legend-dot.critical { background: var(--color-critical); }
.footer-legend-dot.high { background: var(--color-high); }
.footer-legend-dot.moderate { background: var(--color-moderate); }
.footer-legend-dot.low { background: var(--color-low); }
.footer-legend-dot.minimal { background: var(--color-minimal); }

.footer-status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.footer-refresh-icon {
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: 0.9rem;
}

.footer-refresh-icon.spinning {
  animation: footer-refresh-spin 1s linear infinite;
}

@keyframes footer-refresh-spin {
  to { transform: rotate(360deg); }
}

.footer-status-sources {
  font-size: 0.75rem;
  opacity: 0.8;
}

.footer-status-sources-btn {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
}

.footer-status-sources-btn:hover {
  opacity: 1;
}

.footer-status-sources.source-level-0 { color: #8a8f99; }
.footer-status-sources.source-level-1 { color: #ef4444; }
.footer-status-sources.source-level-2 { color: #f59e0b; }
.footer-status-sources.source-level-3 { color: #eab308; }
.footer-status-sources.source-level-4 { color: #22c55e; }
</style>
