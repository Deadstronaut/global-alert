<script setup>
// Flow visualization control panel — spec 053 (Wind/Currents) + spec 054
// (Mode/Animate/Overlay structure). A small square button (anchored on the
// severity legend panel's corner) that expands, animated toward the
// top-right, into the nullschool/GEOS-5-style Mode -> Animate/Overlay
// control bar the user repeatedly referenced — mirrors that reference
// tool's own compact settings-icon affordance instead of always-visible
// standalone controls (live-testing ask, 2026-08-05).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import { fetchLatestFlowSnapshot, fetchLatestOverlaySnapshot } from '@/utils/windLayerData.js'
import { isFlowSnapshotStale } from '@/utils/flowSnapshotStaleness.js'

const { t } = useI18n()
const uiStore = useUIStore()

const open = ref(false)

// Every Mode the reference tool shows (spec 054 FR-007) — `functional`
// modes have at least one real Animate/Overlay entry; the rest render
// visible-but-disabled with modeDisabledNote, matching how Currents itself
// looked in this panel before spec 053 shipped it (never hidden, always
// honest about not being ready yet).
const MODES = [
  { id: 'air', labelKey: 'modeAir', functional: true },
  { id: 'ocean', labelKey: 'modeOcean', functional: true },
  { id: 'chem', labelKey: 'modeChem', functional: false },
  { id: 'particulates', labelKey: 'modeParticulates', functional: false },
  { id: 'space', labelKey: 'modeSpace', functional: false },
  { id: 'bio', labelKey: 'modeBio', functional: false },
]

function selectMode(mode) {
  if (!mode.functional) return // disabled modes have no click handler wired beyond this early return — spec 054 T022
  uiStore.selectedMode = mode.id
}

// One entry per layer_type/overlay_type — null until fetched, 'unavailable'
// on a failed/empty fetch (FR-006's graceful state, contracts/*-contract.md).
const status = ref({ wind: null, ocean_current: null, wave: null })

async function refreshStatus(layerType) {
  const snapshot = await fetchLatestFlowSnapshot(layerType)
  status.value = { ...status.value, [layerType]: snapshot }
}

function toggle() {
  open.value = !open.value
  if (open.value && !status.value.wind) refreshStatus('wind')
}

function toggleWind() {
  uiStore.toggleWind()
  if (uiStore.windEnabled && !status.value.wind) refreshStatus('wind')
}

function toggleCurrents() {
  uiStore.toggleCurrents()
  if (uiStore.currentsEnabled && !status.value.ocean_current) refreshStatus('ocean_current')
}

function toggleWaves() {
  uiStore.toggleWaves()
  if (uiStore.wavesEnabled && !status.value.wave) refreshStatus('wave')
}

// Overlay status is a separate small map (not `status`, whose entries are
// flow_snapshots-shaped) — fetchLatestOverlaySnapshot returns a differently
// -shaped object (valueRange, no dataRange) per contracts/overlay-snapshot-contract.md.
const overlayStatus = ref({ air_quality_pm25: null })

async function refreshOverlayStatus(overlayType) {
  const snapshot = await fetchLatestOverlaySnapshot(overlayType)
  overlayStatus.value = { ...overlayStatus.value, [overlayType]: snapshot }
}

function toggleAirQualityOverlay() {
  uiStore.toggleAirQualityOverlay()
  if (uiStore.airQualityOverlayEnabled && !overlayStatus.value.air_quality_pm25) refreshOverlayStatus('air_quality_pm25')
}

const overlayStale = computed(() => {
  const snap = overlayStatus.value.air_quality_pm25
  return snap ? isFlowSnapshotStale(snap.issuedAt) : false
})
const overlayIssuedAtLabel = computed(() => {
  const snap = overlayStatus.value.air_quality_pm25
  if (!snap) return null
  return new Date(snap.issuedAt).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
})

function makeStaleComputed(layerType) {
  return computed(() => {
    const snap = status.value[layerType]
    return snap ? isFlowSnapshotStale(snap.issuedAt) : false
  })
}
function makeIssuedAtLabelComputed(layerType) {
  return computed(() => {
    const snap = status.value[layerType]
    if (!snap) return null
    return new Date(snap.issuedAt).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  })
}

const windStale = makeStaleComputed('wind')
const windIssuedAtLabel = makeIssuedAtLabelComputed('wind')
const currentsStale = makeStaleComputed('ocean_current')
const currentsIssuedAtLabel = makeIssuedAtLabelComputed('ocean_current')
const waveStale = makeStaleComputed('wave')
const waveIssuedAtLabel = makeIssuedAtLabelComputed('wave')

// Waves' particle "speed" is really wave height (meters), not m/s wind
// speed (contracts/wave-snapshot-contract.md's frontend note) — swap the
// shared legend's label whenever Waves is the active animated layer.
const speedLegendLabelKey = computed(() => (uiStore.wavesEnabled ? 'windLayer.waveHeightLegendLabel' : 'windLayer.speedLegendLabel'))
</script>

<template>
  <div class="flow-control-panel" :class="{ 'flow-control-panel--open': open }">
    <button
      type="button"
      class="flow-control-panel-btn"
      :aria-label="open ? t('windLayer.panelCollapse') : t('windLayer.panelExpand')"
      :title="open ? t('windLayer.panelCollapse') : t('windLayer.panelExpand')"
      @click="toggle"
    >
      🌬️
    </button>

    <Transition name="flow-panel-expand">
      <div v-if="open" class="flow-control-panel-body">
        <h4 class="flow-control-panel-title">{{ t('windLayer.panelTitle') }}</h4>

        <div class="flow-control-section">
          <span class="flow-control-section-label">{{ t('windLayer.modeLabel') }}</span>
          <div class="flow-mode-row">
            <button
              v-for="mode in MODES"
              :key="mode.id"
              type="button"
              class="flow-mode-btn"
              :class="{ 'flow-mode-btn--active': uiStore.selectedMode === mode.id, 'flow-mode-btn--disabled': !mode.functional }"
              :aria-disabled="!mode.functional"
              :title="mode.functional ? t('windLayer.' + mode.labelKey) : t('windLayer.modeDisabledNote')"
              @click="selectMode(mode)"
            >
              {{ t('windLayer.' + mode.labelKey) }}
            </button>
          </div>
          <p v-if="!MODES.find((m) => m.id === uiStore.selectedMode)?.functional" class="flow-control-note">
            {{ t('windLayer.modeDisabledNote') }}
          </p>
        </div>

        <div v-if="uiStore.selectedMode === 'air'" class="flow-control-section">
          <span class="flow-control-section-label">{{ t('windLayer.animateLabel') }}</span>
          <label class="flow-control-row">
            <input type="checkbox" :checked="uiStore.windEnabled" @change="toggleWind" />
            <span>{{ t('windLayer.toggleLabel') }}</span>
          </label>
          <p v-if="uiStore.windEnabled && status.wind === 'unavailable'" class="flow-control-note flow-control-note--warn">
            {{ t('windLayer.unavailable') }}
          </p>
          <p v-else-if="uiStore.windEnabled && windIssuedAtLabel" class="flow-control-note" :class="{ 'flow-control-note--warn': windStale }">
            {{ t('windLayer.asOf', { time: windIssuedAtLabel }) }}
            <span v-if="windStale">— {{ t('windLayer.stale') }}</span>
          </p>
        </div>

        <div v-if="uiStore.selectedMode === 'ocean'" class="flow-control-section">
          <span class="flow-control-section-label">{{ t('windLayer.animateLabel') }}</span>
          <label class="flow-control-row">
            <input type="checkbox" :checked="uiStore.currentsEnabled" @change="toggleCurrents" />
            <span>{{ t('windLayer.currentsToggleLabel') }}</span>
          </label>
          <p v-if="uiStore.currentsEnabled && status.ocean_current === 'unavailable'" class="flow-control-note flow-control-note--warn">
            {{ t('windLayer.unavailable') }}
          </p>
          <p v-else-if="uiStore.currentsEnabled && currentsIssuedAtLabel" class="flow-control-note" :class="{ 'flow-control-note--warn': currentsStale }">
            {{ t('windLayer.asOf', { time: currentsIssuedAtLabel }) }}
            <span v-if="currentsStale">— {{ t('windLayer.stale') }}</span>
          </p>

          <label class="flow-control-row">
            <input type="checkbox" :checked="uiStore.wavesEnabled" @change="toggleWaves" />
            <span>{{ t('windLayer.wavesToggleLabel') }}</span>
          </label>
          <p v-if="uiStore.wavesEnabled && status.wave === 'unavailable'" class="flow-control-note flow-control-note--warn">
            {{ t('windLayer.unavailable') }}
          </p>
          <p v-else-if="uiStore.wavesEnabled && waveIssuedAtLabel" class="flow-control-note" :class="{ 'flow-control-note--warn': waveStale }">
            {{ t('windLayer.asOf', { time: waveIssuedAtLabel }) }}
            <span v-if="waveStale">— {{ t('windLayer.stale') }}</span>
          </p>
        </div>

        <div v-if="uiStore.selectedMode === 'chem' || uiStore.selectedMode === 'particulates'" class="flow-control-section">
          <span class="flow-control-section-label">{{ t('windLayer.overlayLabel') }}</span>
          <label class="flow-control-row">
            <input type="checkbox" :checked="uiStore.airQualityOverlayEnabled" @change="toggleAirQualityOverlay" />
            <span>{{ t('windLayer.pm25ToggleLabel') }}</span>
          </label>
          <p v-if="uiStore.airQualityOverlayEnabled && overlayStatus.air_quality_pm25 === 'unavailable'" class="flow-control-note flow-control-note--warn">
            {{ t('windLayer.unavailable') }}
          </p>
          <p v-else-if="uiStore.airQualityOverlayEnabled && overlayIssuedAtLabel" class="flow-control-note" :class="{ 'flow-control-note--warn': overlayStale }">
            {{ t('windLayer.asOf', { time: overlayIssuedAtLabel }) }}
            <span v-if="overlayStale">— {{ t('windLayer.stale') }}</span>
          </p>

          <div v-if="uiStore.airQualityOverlayEnabled" class="flow-control-legend">
            <span class="flow-control-legend-label">{{ t('windLayer.pm25ToggleLabel') }}</span>
            <div class="flow-control-legend-gradient flow-control-legend-gradient--pm25"></div>
            <div class="flow-control-legend-scale">
              <span>{{ t('windLayer.speedLow') }}</span>
              <span>{{ t('windLayer.speedHigh') }}</span>
            </div>
          </div>
        </div>

        <div class="flow-control-legend">
          <span class="flow-control-legend-label">{{ t(speedLegendLabelKey) }}</span>
          <div class="flow-control-legend-gradient"></div>
          <div class="flow-control-legend-scale">
            <span>{{ t('windLayer.speedLow') }}</span>
            <span>{{ t('windLayer.speedHigh') }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.flow-control-panel {
  position: relative;
  z-index: 30;
}

.flow-control-panel-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(20, 24, 33, 0.92);
  color: #e2e8f0;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(8px);
  transition: background 0.15s ease;
}
.flow-control-panel-btn:hover {
  background: rgba(35, 41, 56, 0.95);
}

.flow-control-panel-body {
  position: absolute;
  bottom: calc(100% + 10px);
  left: -8px;
  width: 260px;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 18, 26, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  /* Expands up-and-right from the button (live-testing ask, 2026-08-05:
     "sağ üstüne doğru") — anchoring via `left` (not `right`) is what
     makes the panel grow rightward from the button instead of leftward
     off the edge of the screen, since this button sits near the left
     edge of the map (end of the bottom-left legend group). */
  transform-origin: bottom left;
  /* Sits well above the other bottom-left legend cards (.map-legend is
     part of the same flex group, unstacked) so the expanded panel never
     reads as merged with the severity card next to it. */
  z-index: 40;
  max-height: 70vh;
  overflow-y: auto;
}

.flow-control-panel-title {
  margin: 0 0 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #e2e8f0;
}

.flow-control-section {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.flow-control-section:last-of-type {
  border-bottom: none;
}

.flow-control-section-label {
  display: block;
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.flow-mode-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.flow-mode-btn {
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  font-size: 0.7rem;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}
.flow-mode-btn:hover:not(.flow-mode-btn--disabled) {
  background: rgba(255, 255, 255, 0.1);
}
.flow-mode-btn--active {
  background: #2f81f7;
  border-color: #2f81f7;
  color: #0b1220;
  font-weight: 700;
}
.flow-mode-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.flow-control-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: #e2e8f0;
  margin-bottom: 4px;
  cursor: pointer;
}
.flow-control-row--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.flow-control-note {
  font-size: 0.68rem;
  color: #8c97a8;
  margin: 0 0 4px 24px;
}
.flow-control-note--warn {
  color: #f0b84a;
}

.flow-control-legend {
  margin-top: 4px;
}
.flow-control-legend-label {
  display: block;
  font-size: 0.68rem;
  color: #8c97a8;
  margin-bottom: 4px;
}
.flow-control-legend-gradient {
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgb(64, 140, 242), rgb(242, 89, 38));
}
/* Matches wind-importer/overlay_texture.py's PM25_RAMP exactly (same 5
   colors, same order) so the legend never drifts from what's actually
   drawn on the map. */
.flow-control-legend-gradient--pm25 {
  background: linear-gradient(
    90deg,
    rgb(0, 228, 0),
    rgb(255, 255, 0),
    rgb(255, 126, 0),
    rgb(255, 0, 0),
    rgb(126, 0, 35)
  );
}
.flow-control-legend-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #8c97a8;
  margin-top: 2px;
}

/* Expands from the button toward the top-right — matches the reference
   tool's own icon-that-expands affordance (live-testing ask, 2026-08-05). */
.flow-panel-expand-enter-active,
.flow-panel-expand-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.flow-panel-expand-enter-from,
.flow-panel-expand-leave-to {
  opacity: 0;
  transform: translate(8px, 8px) scale(0.92);
}
</style>
