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
import { Slider } from '@/components/ui/slider'
import { fetchLatestFlowSnapshot, fetchLatestOverlaySnapshot } from '@/utils/windLayerData.js'
import { isFlowSnapshotStale } from '@/utils/flowSnapshotStaleness.js'

const { t } = useI18n()
const uiStore = useUIStore()

// spec 068 follow-up: this panel can now mount in two places — its
// original spot near the left-side severity legend (opens rightward, the
// default), or the new radar-trigger-anchor near the bottom-right basemap
// picker (opens leftward, via this prop) — see MapView.vue's two mount
// points and .flow-control-panel--opens-leftward below.
defineProps({ opensLeftward: { type: Boolean, default: false } })

// Every Mode the reference tool shows (spec 054 FR-007) — `functional`
// modes have at least one real Animate/Overlay entry; the rest render
// visible-but-disabled with modeDisabledNote.
const MODES = [
  { id: 'air', label: 'Air', functional: true, description: 'Atmosfer / hava katmanları' },
  { id: 'ocean', label: 'Ocean', functional: true, description: 'Okyanus katmanları' },
  { id: 'chem', label: 'Chem', functional: true, description: 'Atmosferik kimyasal gazlar' },
  { id: 'particulates', label: 'Particulates', functional: true, description: 'Havadaki partikül madde ve aerosoller' },
  { id: 'space', label: 'Space', functional: true, description: 'Uzay hava durumu' },
  { id: 'bio', label: 'Bio', functional: false, description: 'Biyosfer (henüz aktif değil)' },
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
  // uiStore.setMode (not a raw assignment) — clears the prior Mode's
  // Animate/Overlay/Forecast selection so its chip doesn't read as still
  // active after switching to a Mode where it no longer applies.
  uiStore.setMode(mode.id)
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
    // Value-range legend (2026-08-06 ask) — populates overlayStatus for
    // whatever Overlay is already active when the panel is (re)opened.
    // Without this, the legend only ever appeared right after clicking an
    // Overlay chip in THIS session (toggleOverlayOption's own refresh) —
    // reopening the panel with an Overlay left active from before showed
    // nothing, since overlayStatus starts empty every mount ("nerede
    // duruyor, bulamadım" — live-testing finding).
    if (isOpen && uiStore.activeOverlayKey && !overlayStatus.value[uiStore.activeOverlayKey]) {
      const activeOption = Object.values(OVERLAY_OPTIONS)
        .flat()
        .find((o) => o.key === uiStore.activeOverlayKey)
      if (activeOption) refreshOverlayStatus(activeOption.key, activeOption.kind)
    }
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
// `description` on every real (keyed) entry — same
// docs/plans/HAVA_OKYANUS_KATMANLARI_SOZLUGU.md wording as FORECAST_VARIABLES'
// own descriptions, surfaced as a hover title (2026-08-07 ask, applied to
// the whole panel for consistency, not just the new Forecast row).
const OVERLAY_OPTIONS = {
  air: [
    { key: 'wind', kind: 'speed', label: 'Wind', description: 'Rüzgar hızı ısı haritası (10m)' },
    { key: 'temperature', kind: 'overlay', label: 'Temp', description: 'Sıcaklık (2m, °C)' },
    { key: 'relative_humidity', kind: 'overlay', label: 'RH', description: 'Bağıl nem (%)' },
    { key: 'dew_point', kind: 'overlay', label: 'Dew', description: 'Çiy noktası sıcaklığı (°C)' },
    { key: 'wet_bulb_temp', kind: 'overlay', label: 'WBT', description: 'Yaş termometre sıcaklığı — nem+sıcaklığın birleşik etkisi (°C)' },
    { key: 'precip_3hr', kind: 'overlay', label: '3HPA', description: '3 saatlik toplam yağış (mm)' },
    { key: 'cape', kind: 'overlay', label: 'CAPE', description: 'Konvektif kullanılabilir potansiyel enerji — fırtına potansiyeli (J/kg)' },
    { key: 'total_precipitable_water', kind: 'overlay', label: 'TPW', description: 'Toplam yağabilir su — atmosferdeki toplam nem sütunu (mm)' },
    { key: 'total_cloud_water', kind: 'overlay', label: 'TCW', description: 'Toplam bulut suyu (kg/m²)' },
    { key: 'mean_sea_level_pressure', kind: 'overlay', label: 'MSLP', description: 'Deniz seviyesine indirgenmiş basınç (hPa)' },
    { key: 'misery_index', kind: 'overlay', label: 'MI', description: 'Sıkıntı indeksi (Misery Index) — hissedilen sıcaklık' },
    { key: 'uv_index', kind: 'overlay', label: 'UVI', description: 'UV indeksi' },
    { key: 'wind_power_density', kind: 'overlay', label: 'WPD', description: 'Rüzgar güç yoğunluğu (W/m²)' },
  ],
  ocean: [
    { key: 'ocean_current', kind: 'speed', label: 'Currents', description: 'Akıntı hızı ısı haritası' },
    { key: 'wave', kind: 'speed', label: 'Waves', description: 'Dalga hızı/yüksekliği ısı haritası' },
    { key: 'significant_wave_height', kind: 'overlay', label: 'HTSGW', description: 'Belirgin dalga yüksekliği (m)' },
    { key: 'sea_surface_temperature', kind: 'overlay', label: 'SST', description: 'Deniz yüzeyi sıcaklığı (°C)' },
    { key: 'coral_bleaching_alert', kind: 'overlay', label: 'BAA', description: 'Mercan ağarması uyarı alanı — ısı stresi seviyesi (0-8+)' },
    { key: 'sea_surface_temperature_anomaly', kind: 'overlay', label: 'SSTA', description: 'Deniz yüzeyi sıcaklık anomalisi — 1991-2020 ortalamasından sapma (°C)' },
  ],
  chem: [
    { key: 'co_surface', kind: 'overlay', label: 'COsc', description: 'Karbon monoksit, yüzey seviyesi (ppb)' },
    { key: 'co2_surface', kind: 'overlay', label: 'CO2sc', description: 'Karbondioksit, yüzey seviyesi (ppm)' },
    { key: 'so2_surface', kind: 'overlay', label: 'SO2sm', description: 'Kükürt dioksit (ppb)' },
    { key: 'no2_surface', kind: 'overlay', label: 'NO2', description: 'Azot dioksit (ppb)' },
  ],
  particulates: [
    { key: 'dust_aod', kind: 'overlay', label: 'DUex', description: 'Toz aerosol optik derinliği (550nm)' },
    { key: 'pm1', kind: 'overlay', label: 'PM1', description: 'İnce partikül madde, çap < 1µm (µg/m³)' },
    { key: 'air_quality_pm25', kind: 'overlay', label: 'PM2.5', description: 'İnce partikül madde, çap < 2.5µm (µg/m³)' },
    { key: 'pm10', kind: 'overlay', label: 'PM10', description: 'Kaba partikül madde, çap < 10µm (µg/m³)' },
    { key: 'organic_matter_aod', kind: 'overlay', label: 'OMaot', description: 'Organik madde aerosol optik derinliği (550nm)' },
    { key: 'sulfate_aod', kind: 'overlay', label: 'SO4ex', description: 'Sülfat aerosol optik derinliği (550nm)' },
  ],
  space: [{ key: 'aurora', kind: 'overlay', label: 'Aurora', description: 'Kutup ışığı (aurora) görülme olasılığı' }],
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

// Real min/max legend for the active Overlay field (2026-08-06 ask: "renk
// değerleri var mı... varsa şiddet kartı gibi göster, yoksa hiç çözüm
// üretmeye çalışma" — only shown where we actually have real fetched
// numbers, not fabricated). `overlayStatus[key].valueRange` is the exact
// value_min/value_max the importer measured in that day's real data
// (fetchLatestOverlaySnapshot, already fetched for the status row above) —
// only present for 'overlay'-kind fields (pre-colored overlay_snapshots);
// 'speed'-kind fields (Wind/Currents/Waves Overlay) have no single stored
// scalar range, so they're deliberately left out here rather than guessed.
const OVERLAY_UNITS = {
  temperature: '°C', relative_humidity: '%', dew_point: '°C', wet_bulb_temp: '°C',
  precip_3hr: 'mm', cape: 'J/kg', total_precipitable_water: 'mm', total_cloud_water: 'kg/m²',
  mean_sea_level_pressure: 'hPa', misery_index: '°C', wind_power_density: 'W/m²',
  significant_wave_height: 'm', sea_surface_temperature: '°C', sea_surface_temperature_anomaly: '°C',
  co_surface: 'ppb', co2_surface: 'ppm', so2_surface: 'ppb', no2_surface: 'ppb',
  pm1: 'µg/m³', air_quality_pm25: 'µg/m³', pm10: 'µg/m³',
}
const activeOverlayLegend = computed(() => {
  const key = uiStore.activeOverlayKey
  if (!key) return null
  const snapshot = overlayStatus.value[key]
  if (!snapshot || snapshot === 'unavailable' || !snapshot.valueRange) return null
  const [min, max] = snapshot.valueRange
  const unit = OVERLAY_UNITS[key] ?? ''
  return { min: min.toFixed(1), max: max.toFixed(1), unit }
})

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

// Forecast row (spec 056) moved out to ForecastPanel.vue — see that
// component for FORECAST_VARIABLES, forecastDayList, and related state.

// ── Live tuning (gear icon) ─────────────────────────────────────────────
// Edits whichever layer_type is currently selected in the Animate row
// (falls back to 'wind' when nothing's animating yet) — each layer_type has
// its own independent settings slot (uiStore.flowSettings, 2026-08-06 split:
// tuning one must never move another's sliders, see FlowControlPanel's own
// header for why).
const showSettings = ref(false)
const tuningLayerKey = computed(() => uiStore.activeAnimateLayer || 'wind')
const tuningSettings = computed(() => uiStore.flowSettings[tuningLayerKey.value])
function onParticleCountInput(e) {
  uiStore.setFlowParticleCount(tuningLayerKey.value, Number(e.target.value))
}
function onSpeedInput(e) {
  uiStore.setFlowSpeedMultiplier(tuningLayerKey.value, Number(e.target.value))
}
function onTrailInput(e) {
  uiStore.setFlowTrailLength(tuningLayerKey.value, Number(e.target.value))
}
function onThicknessInput(e) {
  uiStore.setFlowTrailThickness(tuningLayerKey.value, Number(e.target.value))
}
// 2026-08-06 ask: "her şey için geçerli olsun" — dims both this layer_type's
// Animate particles and its own Overlay heatmap together (the heatmap's
// real colors were "good but hard to read the map underneath" at full
// strength).
function onOpacityInput(e) {
  uiStore.setFlowOpacity(tuningLayerKey.value, Number(e.target.value))
}

const activeModeInfo = computed(() => MODES.find((m) => m.id === uiStore.selectedMode))
</script>

<template>
  <div
    class="flow-control-panel"
    :class="{ 'flow-control-panel--open': uiStore.flowPanelOpen, 'flow-control-panel--opens-leftward': opensLeftward }"
  >
    <Transition name="flow-panel-expand">
      <div v-if="uiStore.flowPanelOpen" class="flow-control-panel-body">
        <div class="flow-control-panel-header">
          <h4 class="flow-control-panel-title">{{ t('windLayer.panelTitle') }}</h4>
          <!-- spec 069 follow-up: too many independent selections in this
               panel (Overlay/Height/Mode/Animate) to hunt down and turn off
               one at a time. Deliberately a labeled action button, not a
               switch/pill-with-dot — a switch shape implies a bidirectional
               on/off control the user flips both ways themselves, but this
               only ever does one thing (clear everything back to the
               opening-state defaults); there's no "turn it back on"
               action, so it shouldn't look like there is one. Red +
               disabled once nothing is left to clear, green + clickable
               the moment anything differs from default — explicit user
               correction after the first (switch-shaped) version. -->
          <button
            type="button"
            class="flow-control-clear-btn"
            :class="{ 'flow-control-clear-btn--active': uiStore.hasActiveFlowSelections }"
            :disabled="!uiStore.hasActiveFlowSelections"
            :title="uiStore.hasActiveFlowSelections ? t('windLayer.masterToggleOff') : t('windLayer.masterToggleAllOff')"
            :aria-label="uiStore.hasActiveFlowSelections ? t('windLayer.masterToggleOff') : t('windLayer.masterToggleAllOff')"
            @click="uiStore.resetAllFlowSettings()"
          >{{ t('windLayer.masterClearLabel') }}</button>
        </div>

        <div class="flow-view-bar-row">
          <span class="flow-view-bar-label">Source</span>
          <span class="flow-view-source-text">{{ MODE_SOURCE[uiStore.selectedMode] }}{{ FIRE_SOURCE_SUFFIX }}</span>
        </div>

        <!-- Spec 070 (US1) — Kaynak / Rüzgar Yön / Hız / Mod sırası
             (live-testing ask 2026-08-18: yön bilgisi hızın üstünde, kaynağın
             hemen altında görünsün). Only rendered while Wind Animate is on
             AND we actually have a decoded direction for the current map
             center (FR-005: never a fabricated/default arrow). -->
        <div v-if="uiStore.windEnabled && uiStore.currentWindDirection" class="flow-view-bar-row flow-wind-direction-row">
          <span class="flow-view-bar-label">{{ t('windLayer.directionLabel') }}</span>
          <span class="flow-wind-direction-value">
            <svg
              class="flow-wind-direction-arrow"
              :style="{ transform: `rotate(${uiStore.currentWindDirection.windDirectionDeg}deg)` }"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <path d="M12 2 L18 14 L12 10.5 L6 14 Z" fill="currentColor" />
            </svg>
            {{ Math.round(uiStore.currentWindDirection.windDirectionDeg) }}° · {{ uiStore.currentWindDirection.windSpeed.toFixed(1) }} m/s
          </span>
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
            :title="mode.functional ? mode.description : t('windLayer.modeDisabledNote')"
            @click="selectMode(mode)"
          >{{ mode.label }}</button>
        </div>
        <p v-if="activeModeInfo && !activeModeInfo.functional" class="flow-control-note">
          {{ t('windLayer.modeDisabledNote') }}
        </p>

        <div v-if="uiStore.selectedMode === 'air'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Animate</span>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.windEnabled }" title="Rüzgar — 10m yükseklikte hava hareketi (yön + hız)" @click="toggleWind">{{ t('windLayer.toggleLabel') }}</button>
        </div>
        <div v-if="uiStore.selectedMode === 'ocean'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Animate</span>
          <!-- Reference tool's own Ocean mode Animate row includes Wind
               alongside Currents/Waves (wind blowing over the ocean surface,
               live-testing ask 2026-08-06: "okyanustan içinde rüzgar şey de
               var... bizde o da yok") — same toggleWind/windEnabled Air mode
               already uses, just also exposed here; wind's own engine file
               is untouched by this, this is purely a UI exposure change. -->
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.windEnabled }" title="Rüzgar — 10m yükseklikte hava hareketi (yön + hız)" @click="toggleWind">{{ t('windLayer.toggleLabel') }}</button>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.currentsEnabled }" title="Okyanus akıntıları — deniz yüzeyi su hareketi" @click="toggleCurrents">{{ t('windLayer.currentsToggleLabel') }}</button>
          <button type="button" class="flow-view-chip flow-view-mode-btn" :class="{ 'flow-view-mode-btn--active': uiStore.wavesEnabled }" title="Dalgalar — anlık dalga yönü/yüksekliği" @click="toggleWaves">{{ t('windLayer.wavesToggleLabel') }}</button>
        </div>

        <div v-if="uiStore.selectedMode === 'air'" class="flow-view-bar-row">
          <span class="flow-view-bar-label">Height</span>
          <button
            v-for="level in HEIGHT_LEVELS"
            :key="level"
            type="button"
            class="flow-view-chip flow-view-mode-btn"
            :class="{ 'flow-view-mode-btn--active': uiStore.selectedHeight === level }"
            :title="level === 'Sfc' ? 'Yüzey / yakın-yüzey (2m veya 10m)' : `Basınç seviyesi ${level} hPa — sadece Temp ve RH için geçerli`"
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
            :title="option.key ? option.description : 'Yakında — veri kaynağı henüz eklenmedi'"
            @click="toggleOverlayOption(option)"
          >{{ option.label }}</button>
        </div>

        <!-- Real value range for the active Overlay — only rendered when we
             actually have fetched numbers for it (activeOverlayLegend's own
             comment), same "şiddet kartı" (severity card) visual language
             as the map's own left-side legend: a color bar + numeric ends. -->
        <div v-if="activeOverlayLegend" class="flow-view-legend flow-view-overlay-legend">
          <span class="flow-view-bar-label">Değer Aralığı</span>
          <div class="flow-view-legend-gradient"></div>
          <div class="flow-view-legend-scale">
            <span>{{ activeOverlayLegend.min }}{{ activeOverlayLegend.unit }}</span>
            <span>{{ activeOverlayLegend.max }}{{ activeOverlayLegend.unit }}</span>
          </div>
        </div>

        <!-- Forecast row (spec 056) moved out to ForecastPanel.vue as its
             own standalone panel/trigger, per partner review (page 3
             annotation: "Foresight ... can be allocated in Dashboard /
             Monitoring page" — flagged for not having its own place). -->

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

        <!-- Opacity: kept next to the gear icon itself, always visible (not
             behind the ⚙️ toggle like the other sliders) — 2026-08-06 ask:
             this is the one most worth reaching for quickly, to see the map
             underneath a strong heatmap without opening the full settings. -->
        <div class="flow-view-gear-row">
          <button type="button" class="flow-view-gear" @click="showSettings = !showSettings">⚙️</button>
          <label class="flow-view-opacity-inline">
            <span>Şeffaflık</span>
            <input type="range" min="0.05" max="1" step="0.05" :value="tuningSettings.opacity" @input="onOpacityInput" />
          </label>
        </div>
        <div v-if="showSettings" class="flow-view-settings">
          <p class="flow-view-settings-target">{{ ANIMATE_LABELS[tuningLayerKey] || tuningLayerKey }} ayarları</p>
          <label class="flow-view-settings-label">
            Parçacık sayısı: {{ tuningSettings.particleCount }}
            <input type="range" min="200" max="20000" step="100" :value="tuningSettings.particleCount" @input="onParticleCountInput" />
          </label>
          <label class="flow-view-settings-label">
            Hız çarpanı: {{ tuningSettings.speedMultiplier.toFixed(1) }}x
            <input type="range" min="0.5" max="1000" step="0.5" :value="tuningSettings.speedMultiplier" @input="onSpeedInput" />
          </label>
          <label class="flow-view-settings-label">
            İz uzunluğu: {{ tuningSettings.trailLength }}
            <input type="range" min="2" max="2000" step="1" :value="tuningSettings.trailLength" @input="onTrailInput" />
          </label>
          <label class="flow-view-settings-label">
            İz kalınlığı: {{ tuningSettings.trailThickness.toFixed(1) }}px
            <input type="range" min="0.1" max="40" step="0.5" :value="tuningSettings.trailThickness" @input="onThicknessInput" />
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
  /* Kullanıcı bulgusu (2026-08-18): kısa bir viewport'ta panel yukarı doğru
     78vh'ye kadar büyüyünce üst kısmı (başlık, "Temizle" butonu) header'ın
     ARKASINDA kalıyordu — header'ın z-index'i (--z-shell: 96) bu panelin
     kendi z-index'inden (40) yüksek olduğu için üstüne biniyor. Panel
     kendi kutusunun asla header'ın kapladığı alana taşmamasını garantiye
     alan bir üst sınır eklendi — --shell-header-height (MainLayout.vue'nun
     canlı ölçtüğü gerçek header yüksekliği) ne olursa olsun, panel artık
     header'ın ALTINDA kalan boşluğu asla aşamıyor. */
  max-height: min(78vh, calc(100vh - var(--shell-header-height, 0px) - 20px));
  overflow-y: auto;
}

/* spec 068 follow-up: when mounted near the right edge (radar-trigger-anchor
   in MapView.vue, above the basemap picker), open leftward instead so the
   panel doesn't run off the right edge of the screen.
   spec 069 follow-up: briefly tried anchoring this to `top: 0` (opening
   flush with the trigger's own height, no vertical growth) to dodge an
   off-screen-clipping issue at short viewports — but that made the panel
   grow DOWNWARD from a fixed top, which then genuinely overlapped
   Forecast's own downward-opening panel below it (live screenshot: Öngörü
   floating on top of Rüzgar & Akıntı's middle). Reverted: Radar (now the
   TOP item of .right-center-control-stack) keeps opening UPWARD — away
   from Forecast below it — while Forecast opens downward — away from
   Radar above it. Two panels growing in OPPOSITE directions from
   adjacent-but-separate triggers is what actually avoids the overlap
   (explicit correction: "üst üste açılmamalıdır" — up/down, not "on top of
   each other"). */
.flow-control-panel--opens-leftward .flow-control-panel-body {
  left: auto;
  /* spec 069 follow-up: net +3vw left, then -3vw right ("çok oldu" —
     too much, walked back), then corrected to -2vw right = +1vw overall
     from the original -8px; -5vh lower from the first request still
     applies. Final micro-nudge (explicit ask: "bir piksel sağ bir piksel
     yukarı olacak şekilde bir yüzdelik" — a percentage sized to read as
     about a single pixel at typical screen sizes) — 0.1vw/0.1vh is ~1-2px
     at common desktop widths/heights. vw/vh throughout (not flat px) so
     every shift scales with the viewport, matching how each request was
     phrased as a percentage. */
  right: calc(-8px + 1vw - 0.1vw);
  bottom: calc(100% + 10px - 5vh + 0.1vh);
  transform-origin: bottom right;
  /* spec 069 follow-up: the base 78vh max-height assumed the trigger sits
     near the bottom of the screen (its original mount point) — plenty of
     room to grow upward underneath it. This trigger now sits in
     .right-center-control-stack, vertically centered — originally on the
     full viewport, which is exactly why this cap kept being wrong.
     2026-08-18: MapView.vue's .right-center-control-stack now centers on
     the actual content band BETWEEN header and footer (not the raw
     viewport), so this cap is rewritten to match: half of that same
     content band, minus ~70px for the stack's own button+gap footprint
     above the trigger. Plain 50vh-70px (pre-fix) or a 100vh-header-only
     cap (this file's own first follow-up attempt) both still let a short
     viewport's panel top land behind the header — verified live via
     Playwright at 1920x1080 (panel top landed at y=74, header bottom at
     y=107, a 33px overlap) before this fix; content-band-relative math is
     what actually closes that gap regardless of header/footer height. */
  max-height: min(
    78vh,
    calc((100vh - var(--shell-header-height, 0px) - var(--shell-footer-height, 0px)) / 2 - 70px)
  );
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

/* spec 069 follow-up: labeled clear-all action button (was a switch/
   pill-with-dot — corrected per explicit feedback: a switch shape reads as
   a control the user flips both ways, but this only ever clears, never
   "turns on"). Disabled + dim red once there's nothing left to clear;
   solid green + clickable while anything differs from default. */
.flow-control-clear-btn {
  flex-shrink: 0;
  padding: 3px 9px;
  border-radius: 5px;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.12);
  color: rgba(255, 255, 255, 0.4);
  font-size: 0.65rem;
  font-weight: 700;
  cursor: default;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}
.flow-control-clear-btn--active {
  border-color: #22c55e;
  background: #22c55e;
  color: #0b1220;
  cursor: pointer;
  box-shadow: 0 0 8px 1px rgba(34, 197, 94, 0.5);
}
.flow-control-clear-btn--active:hover {
  background: #1fae54;
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
.flow-view-legend-scale {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: #8c97a8;
  margin-top: 2px;
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

.flow-view-forecast-row {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 8px;
  margin-top: 4px;
}
.flow-view-forecast-day {
  margin-bottom: 8px;
}
.flow-view-forecast-slider {
  width: 100%;
  margin: 4px 0 6px;
}
.flow-view-forecast-nodata {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
}
.flow-view-forecast-asof {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
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

.flow-wind-direction-row {
  align-items: center;
}
.flow-wind-direction-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: #e6ebf2;
}
.flow-wind-direction-arrow {
  color: #7ec8ff;
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.flow-view-gear-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}
.flow-view-gear {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 0.85rem;
}
.flow-view-gear:hover {
  background: rgba(255, 255, 255, 0.14);
}
.flow-view-opacity-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 0.68rem;
  color: rgba(255, 255, 255, 0.6);
}
.flow-view-opacity-inline input[type='range'] {
  flex: 1;
}

.flow-view-settings {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}
.flow-view-settings-target {
  margin: 0 0 8px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
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
