<script setup>
// spec 072 (Phase 5): top-left 2x2 quick-access icon grid, shared between
// MapView.vue (2D) and GlobeView.vue (3D) so it renders identically in both
// — see specs/072-live-flight-ship-tracking/research.md §4 for why this is
// a shared component rather than duplicated markup, and for why the radar
// visual here means "flights" specifically (the original radar-sweep icon
// used to double as the Wind/Currents/Waves panel trigger too; that trigger
// now uses its own plain wind icon — see MapView.vue's radar-trigger-btn —
// so the radar-sweep animation has exactly one meaning across the app).
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import RadarScanBadge from '@/components/RadarScanBadge.vue'

const props = defineProps({
  // Parent-supplied screenshot capture (MapView's downloadMap, GlobeView's
  // captureGlobeScreenshot) — this component doesn't know how to capture
  // either canvas itself, it just triggers whatever it's given.
  captureFn: { type: Function, required: true },
  // Optional override for the shelters icon's click — MapView.vue passes
  // its own local toggleShelters() (spec 072 follow-up, 2026-08-20:
  // "menü panel açılmaları falan tüm herşeyini alman lazım") so this icon
  // opens the SAME rich flyout (hints, mutual exclusion with the exposure/
  // WMS-WFS panels, both shelters+community-reports checkboxes) that used
  // to have its own separate trigger button, instead of a bare store
  // toggle. Falls back to a plain toggle if no parent needs that behavior.
  sheltersClick: { type: Function, default: null },
  // Exposure-layers panel toggle (MapView's toggleExposurePanelOpen()) —
  // spec 072 follow-up (2026-08-20): replaced the community-reports icon
  // with this ("vatandaş bildirimi ... ihtiyacımız yok"), then rewired from
  // the WMS/WFS panel to Exposure specifically + copied its exact blue icon
  // color (#4da3ff) once the user pointed out the two looked like unrelated
  // duplicates ("burada iki tane katman oldu") — this one now IS that icon,
  // the old standalone trigger for it was removed.
  layersClick: { type: Function, required: true },
})

const uiStore = useUIStore()
const { t } = useI18n()
</script>

<template>
  <div class="quick-access-grid" role="group" :aria-label="t('sidebar.globeLayersGroup')">
    <button
      type="button"
      class="quick-access-btn"
      :title="t('impact.downloadMap')"
      :aria-label="t('impact.downloadMap')"
      @click="props.captureFn()"
    >
      <svg class="quick-access-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button
      type="button"
      class="quick-access-btn"
      :class="{ active: uiStore.showFlights }"
      :title="t('sidebar.modeFlights')"
      :aria-label="t('sidebar.modeFlights')"
      @click="uiStore.toggleFlights()"
    >
      <RadarScanBadge />
    </button>
    <button
      type="button"
      class="quick-access-btn"
      :title="t('mapLayers.panelTitle')"
      :aria-label="t('mapLayers.panelTitle')"
      @click="layersClick()"
    >
      <svg class="quick-access-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 L2 7 L12 12 L22 7 Z" fill="#4da3ff" />
        <path d="M2 12 L12 17 L22 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M2 17 L12 22 L22 17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <button
      type="button"
      class="quick-access-btn"
      :class="{ active: uiStore.showShelters }"
      :title="t('shelters.map.toggleLabel')"
      :aria-label="t('shelters.map.toggleLabel')"
      @click="sheltersClick ? sheltersClick() : uiStore.toggleShelters()"
    >
      <svg class="quick-access-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7z" fill="#e0453f" />
        <circle cx="12" cy="9" r="2.6" fill="rgba(0,0,0,.35)" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.quick-access-grid {
  display: grid;
  grid-template-columns: repeat(2, 32px);
  grid-template-rows: repeat(2, 32px);
  gap: 6px;
}

.quick-access-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 14, 20, 0.85);
  color: rgba(255, 255, 255, 0.75);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, transform 0.15s;
}

.quick-access-btn:hover {
  transform: scale(1.06);
}

.quick-access-btn.active {
  border-color: rgba(120, 180, 255, 0.7);
  color: #7fd4ff;
}

.quick-access-icon {
  width: 17px;
  height: 17px;
}

/* RadarScanBadge is already a self-contained 32px circle with its own
   border/shadow — nesting it inside .quick-access-btn's own circle would
   double up both, so strip the inner copy's chrome via :deep() (needed
   because RadarScanBadge's root-element classes live in ITS OWN scoped
   style, not this component's). */
.quick-access-grid :deep(.radar-scan-badge) {
  width: 32px;
  height: 32px;
  border: none;
  box-shadow: none;
}
</style>
