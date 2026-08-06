<script setup>
// Flow visualization control panel — spec 053 (Wind/Currents) + spec 054
// (full Mode/Animate/Height/Overlay/Annotation menu, matching the reference
// tool's own layout exactly). A small square button (anchored on the
// severity legend panel's corner) that expands upward into the full menu.
//
// This panel owns no map of its own — every toggle here flows through
// uiStore, and MapView.vue's own watchers are what actually add/remove
// layers on the real map. This replaced a separate, isolated-map
// "standalone" view (FlowVisualizationView.vue) that existed only while
// debugging why particles weren't rendering on the main map; once that bug
// was fixed and confirmed working, the user asked for the standalone
// entry point to go away entirely — this panel, opened from the same blue
// button, IS the real feature now (2026-08-05: "o maviye bastığımızda...
// bu menü açılmalı... standalone'ın artık gerek yok").
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import { fetchLatestFlowSnapshot, fetchLatestOverlaySnapshot } from '@/utils/windLayerData.js'
import { isFlowSnapshotStale } from '@/utils/flowSnapshotStaleness.js'

const { t } = useI18n()
const uiStore = useUIStore()

// Every Mode the reference tool shows (spec 054 FR-007) — `functional`
// modes have at least one real Animate/Overlay entry; the rest render
// visible-but-disabled with modeDisabledNote.
const MODES = [
  { id: 'air', label: 'Air', functional: true },
  { id: 'ocean', label: 'Ocean', functional: true },
  { id: 'chem', label: 'Chem', functional: true },
  { id: 'particulates', label: 'Particulates', functional: true },
  { id: 'space', label: 'Space', functional: true },
  { id: 'bio', label: 'Bio', functional: false },
]
const MODE_SOURCE = {
  air: 'GFS / NCEP / US National Weather Service',
  ocean: 'Global Ocean Physics Analysis and Forecast / CMEMS',
  chem: 'GEOS-5 / GMAO / NASA',
  particulates: 'CAMS / Copernicus / European Commission + ECMWF',
  space: 'OVATION / SWPC / NCEP / NWS / NOAA',
  bio: 'OVATION / SWPC / NCEP / NWS / NOAA',
}
// Reference tool's own HD-mode overlay list appends fire-hotspot
// attribution to every Source line — this app already ingests NASA FIRMS
// hotspot data elsewhere, so this is a real, accurate attribution to show.
const FIRE_SOURCE_SUFFIX = ' + VIIRS NRT / FIRMS / EOSDIS / NASA'

function selectMode(mode) {
  uiStore.selectedMode = mode.id
}

// Air mode's pressure-level selector — real for Temp/RH (spec 054
// follow-up, 2026-08-06: wind-importer fetches both at all seven GFS
// pressure levels, not just surface). Height itself is global state
// (uiStore.selectedHeight), same reasoning as activeOverlayKey living
// there: MapView.vue needs to watch it directly to swap the active
// Overlay layer when it changes.
const HEIGHT_LEVELS = ['Sfc', '1000', '850', '700', '500', '250', '70', '10']

// ── Animate (global — same three regardless of Mode, matching the
//    reference tool's own screenshots) ─────────────────────────────────
const ANIMATE_LABELS = { wind: 'Rüzgar', ocean_current: 'Okyanus Akıntıları', wave: 'Dalgalar' }
const SOURCE_LABELS = {
  wind: 'GFS / NCEP / US National Weather Service',
  ocean_current: 'CMEMS / Copernicus Marine',
  wave: 'WAVEWATCH III / NCEP / NWS',
}

// One entry per layer_type/overlay_type — null until fetched, 'unavailable'
// on a failed/empty fetch (FR-006's graceful "unavailable" state).
const status = ref({ wind: null, ocean_current: null, wave: null })
async function refreshStatus(layerType) {
  const snapshot = await fetchLatestFlowSnapshot(layerType)
  status.value = { ...status.value, [layerType]: snapshot }
}

// Trigger button lives elsewhere now (the radar scan badge above the
// severity legend card, MapView.vue) — this panel just reacts to the
// shared uiStore.flowPanelOpen state instead of owning its own toggle.
watch(
  () => uiStore.flowPanelOpen,
  (isOpen) => {
    if (isOpen && !status.value.wind) refreshStatus('wind')
  },
)

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

function formatIssuedAt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
// One row per currently-enabled Animate layer with real snapshot data —
// reference tool's "Source"/"Date" rows, but for every active layer at once.
const activeAnimateSources = computed(() => {
  const entries = []
  for (const [key, snap] of Object.entries(status.value)) {
    if (snap && snap !== 'unavailable') {
      entries.push({ key, label: ANIMATE_LABELS[key], source: SOURCE_LABELS[key], date: formatIssuedAt(snap.issuedAt) })
    }
  }
  return entries
})

// ── Overlay (per-mode lists) ────────────────────────────────────────────
// `key` present + one of the two `kind`s below = working; no `key` =
// visible-but-disabled placeholder (same honesty pattern as Chem/
// Particulates/Space/Bio elsewhere in this panel).
const OVERLAY_OPTIONS = {
  air: [
    { key: 'wind', kind: 'speed', label: 'Wind' },
    { key: 'temperature', kind: 'overlay', label: 'Temp' },
    { key: 'relative_humidity', kind: 'overlay', label: 'RH' },
    { key: 'dew_point', kind: 'overlay', label: 'Dew' },
    { key: 'wet_bulb_temp', kind: 'overlay', label: 'WBT' },
    { key: 'precip_3hr', kind: 'overlay', label: '3HPA' },
    { key: 'cape', kind: 'overlay', label: 'CAPE' },
    { key: 'total_precipitable_water', kind: 'overlay', label: 'TPW' },
    { key: 'total_cloud_water', kind: 'overlay', label: 'TCW' },
    { key: 'mean_sea_level_pressure', kind: 'overlay', label: 'MSLP' },
    { label: 'MI' }, { label: 'UVI' },
    { key: 'wind_power_density', kind: 'overlay', label: 'WPD' },
  ],
  ocean: [
    { key: 'ocean_current', kind: 'speed', label: 'Currents' },
    { key: 'wave', kind: 'speed', label: 'Waves' },
    { key: 'significant_wave_height', kind: 'overlay', label: 'HTSGW' },
    { label: 'SST' }, { label: 'SSTA' }, { label: 'BAA' },
  ],
  chem: [
    { key: 'co_surface', kind: 'overlay', label: 'COsc' },
    { label: 'CO2sc' }, // no CAMS data source for CO2 — see fetch_overlay_cams.py's own comment
    { key: 'so2_surface', kind: 'overlay', label: 'SO2sm' },
    { key: 'no2_surface', kind: 'overlay', label: 'NO2' },
  ],
  particulates: [
    { key: 'dust_aod', kind: 'overlay', label: 'DUex' },
    { key: 'pm1', kind: 'overlay', label: 'PM1' },
    { key: 'air_quality_pm25', kind: 'overlay', label: 'PM2.5' },
    { key: 'pm10', kind: 'overlay', label: 'PM10' },
    { key: 'organic_matter_aod', kind: 'overlay', label: 'OMaot' },
    { key: 'sulfate_aod', kind: 'overlay', label: 'SO4ex' },
  ],
  space: [{ key: 'aurora', kind: 'overlay', label: 'Aurora' }],
  bio: [{ label: 'BAA' }],
}
const BIO_ANNOTATIONS = [{ label: 'Fires' }, { label: 'None' }]

// Overlay status is separately keyed from `status` (speed overlays reuse
// flow_snapshots; PM2.5 reads overlay_snapshots, a differently-shaped row).
const overlayStatus = ref({})
async function refreshOverlayStatus(key, kind) {
  const snapshot = kind === 'speed' ? await fetchLatestFlowSnapshot(key) : await fetchLatestOverlaySnapshot(key)
  overlayStatus.value = { ...overlayStatus.value, [key]: snapshot }
}

function overlayActive(option) {
  return !!option.key && uiStore.activeOverlayKey === option.key
}

// Single-select "radio button with toggle-off" — corrected 2026-08-05
// after an earlier independent-multi-toggle attempt let several Overlay
// layers stack at once ("hiçbiri kapanmadı hepsi üst üste açılıyor").
// Only one Overlay color layer should ever be on the map: clicking a
// different option switches to it (uiStore.toggleOverlay turns off
// whichever was active via the single shared key); clicking the
// already-active one again turns it off.
function toggleOverlayOption(option) {
  if (!option.key) return // disabled placeholder — no handler beyond this early return
  uiStore.toggleOverlay(option.key)
  if (uiStore.activeOverlayKey === option.key && !overlayStatus.value[option.key]) {
    refreshOverlayStatus(option.key, option.kind)
  }
}

// ── Live tuning (gear icon) ─────────────────────────────────────────────
const showSettings = ref(false)
function onSpeedInput(e) {
  uiStore.setFlowSpeedMultiplier(Number(e.target.value))
}
function onTrailInput(e) {
  uiStore.setFlowTrailLength(Number(e.target.value))
}
function onThicknessInput(e) {
  uiStore.setFlowTrailThickness(Number(e.target.value))
}

const activeModeInfo = computed(() => MODES.find((m) => m.id === uiStore.selectedMode))
</script>

<template>
  <div class="flow-control-panel" :class="{ 'flow-control-panel--open': uiStore.flowPanelOpen }">
    <Transition name="flow-panel-expand">
      <div v-if="uiStore.flowPanelOpen" class="flow-control-panel-body">
        <div class="flow-control-panel-header">
          <h4 class="flow-control-panel-title">{{ t('windLayer.panelTitle') }}</h4>
        </div>

        <div class="flow-view-bar-row">
          <span class="flow-view-bar-label">Source</span>
          <span class="flow-view-source-text">{{ MODE_SOURCE[uiStore.selectedMode] }}{{ FIRE_SOURCE_SUFFIX }}</span>
        </div>

        <div class="flow-view-legend">
          <span class="flow-view-bar-label">{{ uiStore.wavesEnabled ? t('windLayer.waveHeightLegendLabel') : t('windLayer.speedLegendLabel') }}</span>
          <div class="flow-view-legend-gradient"></div>
        </div>

        <div class="flow-view-bar-row">
          <span class="flow-view-bar-label">Mode</span>
          <button
            v-for="mode in MODES"
            :key="mode.id"
            type="button"
            class="flow-view-chip flow-view-mode-btn"
            :class="{ 'flow-view-mode-btn--active': uiStore.selectedMode === mode.id, 'flow-view-mode-btn--disabled': !mode.functional }"
            :title="mode.functional ? '' : t('windLayer.modeDisabledNote')"
            @click="selectMode(mode)"
          >{{ mode.label }}</button>
        </div>
        <p v-if="activeModeInfo && !activeModeInfo.functional" class="flow-control-note">
          {{ t('windLayer.modeDisabledNote') }}
        </p>

        <div v-if="uiStore.selectedMode === 'air'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Animate</span>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.windEnabled }" @click="toggleWind">{{ t('windLayer.toggleLabel') }}</button>
        </div>
        <div v-if="uiStore.selectedMode === 'ocean'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Animate</span>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.currentsEnabled }" @click="toggleCurrents">{{ t('windLayer.currentsToggleLabel') }}</button>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.wavesEnabled }" @click="toggleWaves">{{ t('windLayer.wavesToggleLabel') }}</button>
        </div>

        <div v-if="uiStore.selectedMode === 'air'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Height</span>
          <button
            v-for="level in HEIGHT_LEVELS"
            :key="level"
            type="button"
            class="flow-view-chip flow-view-mode-btn"
            :class="{ 'flow-view-mode-btn--active': uiStore.selectedHeight === level }"
            @click="uiStore.setSelectedHeight(level)"
          >{{ level }}</button>
        </div>

        <div class="flow-view-bar-row">
          <span class="flow-view-bar-label">Overlay</span>
          <button
            v-for="option in OVERLAY_OPTIONS[uiStore.selectedMode]"
            :key="option.label"
            type="button"
            class="flow-view-chip"
            :class="option.key ? ['flow-view-mode-btn', { 'flow-view-mode-btn--active': overlayActive(option) }] : 'flow-view-chip--disabled'"
            :title="option.key ? '' : 'Yakında — veri kaynağı henüz eklenmedi'"
            @click="toggleOverlayOption(option)"
          >{{ option.label }}</button>
        </div>

        <div v-if="uiStore.selectedMode === 'bio'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Annotation</span>
          <span v-for="a in BIO_ANNOTATIONS" :key="a.label" class="flow-view-chip flow-view-chip--disabled" title="Yakında">{{ a.label }}</span>
        </div>

        <div v-if="activeAnimateSources.length" class="flow-view-source-block">
          <div v-for="s in activeAnimateSources" :key="s.key" class="flow-view-source-row">
            <span class="flow-view-bar-label">{{ s.label }}</span>
            <span class="flow-view-source-text">{{ s.source }}<template v-if="s.date"> — {{ s.date }}</template></span>
          </div>
        </div>

        <button type="button" class="flow-view-gear" @click="showSettings = !showSettings">⚙️</button>
        <div v-if="showSettings" class="flow-view-settings">
          <label class="flow-view-settings-label">
            Hız çarpanı: {{ uiStore.flowSpeedMultiplier.toFixed(1) }}x
            <input type="range" min="0.5" max="1000" step="0.5" :value="uiStore.flowSpeedMultiplier" @input="onSpeedInput" />
          </label>
          <label class="flow-view-settings-label">
            İz uzunluğu: {{ uiStore.flowTrailLength }}
            <input type="range" min="2" max="2000" step="1" :value="uiStore.flowTrailLength" @input="onTrailInput" />
          </label>
          <label class="flow-view-settings-label">
            İz kalınlığı: {{ uiStore.flowTrailThickness.toFixed(1) }}px
            <input type="range" min="0.1" max="5" step="0.1" :value="uiStore.flowTrailThickness" @input="onThicknessInput" />
          </label>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.flow-control-panel {
  position: relative;
  z-index: 30;
  /* This component now renders inside MapView.vue's centered
     .severity-legend-stack (live-testing ask, 2026-08-06) — align-self
     pins its own (otherwise 0-width when closed) box to that stack's
     left edge regardless of the stack's own center-alignment, so the
     expanded panel body (anchored to THIS element, left: -8px below)
     opens flush with the severity card's left edge instead of from the
     stack's horizontal center. */
  align-self: flex-start;
}

.flow-control-panel-body {
  position: absolute;
  bottom: calc(100% + 10px);
  left: -8px;
  width: 360px;
  max-width: min(420px, calc(100vw - 32px));
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
  z-index: 40;
  max-height: 78vh;
  overflow-y: auto;
}

.flow-control-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.flow-control-panel-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #e2e8f0;
}

.flow-control-note {
  font-size: 0.68rem;
  color: #8c97a8;
  margin: 0 0 8px 0;
}

.flow-view-legend {
  margin-bottom: 8px;
}
.flow-view-legend-gradient {
  margin-top: 4px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(90deg, rgb(64, 140, 242), rgb(242, 89, 38));
}

.flow-view-bar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}
.flow-view-bar-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
  min-width: 56px;
}
.flow-view-chip {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: #e2e8f0;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
}
.flow-view-chip--disabled {
  color: rgba(255, 255, 255, 0.32);
  cursor: not-allowed;
}

.flow-view-mode-btn {
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
}
.flow-view-mode-btn:hover:not(.flow-view-mode-btn--disabled) {
  background: rgba(255, 255, 255, 0.1);
}
.flow-view-mode-btn--active {
  background: #d4a94a;
  border-color: #d4a94a;
  color: #0b1220;
  font-weight: 700;
  box-shadow: 0 0 8px 1px rgba(212, 169, 74, 0.6);
}
.flow-view-mode-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.flow-view-source-block {
  margin-bottom: 8px;
  padding: 8px 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.flow-view-source-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin-bottom: 5px;
}
.flow-view-source-row:last-child {
  margin-bottom: 0;
}
.flow-view-source-text {
  font-size: 0.7rem;
  color: #8c97a8;
}

.flow-view-gear {
  margin-top: 8px;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 0.85rem;
}
.flow-view-gear:hover {
  background: rgba(255, 255, 255, 0.14);
}

.flow-view-settings {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.flow-view-settings-label {
  display: block;
  font-size: 0.75rem;
  color: #cbd5e1;
}
.flow-view-settings-label input[type='range'] {
  display: block;
  width: 100%;
  margin-top: 6px;
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
