<script setup>
// spec 068 follow-up (partner review, page 3 annotation: "Foresight, Shelter
// points, and Exposure layers can be allocated in Dashboard / Monitoring
// page" — the reviewer specifically flagged the Forecast/"Foresight" row for
// not having its own place, previously buried inside FlowControlPanel.vue's
// Wind & Current panel). Extracted into its own standalone panel + trigger,
// same shared-open-state pattern as FlowControlPanel (uiStore.flowPanelOpen /
// toggleFlowPanel) via uiStore.forecastPanelOpen / toggleForecastPanel.
import { ref, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Play, Pause } from '@lucide/vue'
import { useUIStore } from '@/stores/ui.js'
import { Slider } from '@/components/ui/slider'
import { fetchForecastDayList, fetchForecastSnapshot } from '@/utils/forecastLayerData.js'

const { t } = useI18n()
const uiStore = useUIStore()

// spec 069 follow-up: moved out of .severity-legend-stack (left side of the
// map, disappeared whenever Isı/heatmap mode hid that whole stack) into its
// own always-visible anchor stacked above .radar-trigger-anchor on the
// right side — same opens-leftward escape hatch FlowControlPanel.vue
// already needed for that same right-hand column, so this panel's body
// doesn't run off the right edge of the screen from its new position.
// spec 069 follow-up: opensDownward — Forecast moved to the BOTTOM of the
// right-hand control column (below Radar, per request: "radarla öngörünün
// yerini değiştir, altüst"), so its flyout body (which grows upward by
// default, per .forecast-panel-body's own `bottom: calc(100% + 10px)`)
// would now open on top of the Radar trigger/panel above it — same
// escape-hatch pattern as opensLeftward, just for the vertical axis.
defineProps({ opensLeftward: { type: Boolean, default: false }, opensDownward: { type: Boolean, default: false } })

// Same wording/keys as FlowControlPanel.vue's former Forecast row (spec
// 056) — kept identical so no translation/meaning drift between the two.
// spec 069 follow-up: `unit` added per variable — previously the unit only
// existed buried inside `description` (a hover-only title tooltip), which
// is easy to miss ("rüzgar rakamları hangi barem, m mi km mi fit mi?" —
// user report). Now shown as its own always-visible badge next to the day
// label (see .forecast-unit-badge below) once a variable is selected, no
// hover required — description/title tooltip kept too for the fuller text.
const FORECAST_VARIABLES = [
  { key: 'wind_speed', label: 'Wind', unit: 'm/s', description: 'Rüzgar hızı öngörüsü (10m yükseklikte, metre/saniye) — statik ısı haritası, animasyonlu değil' },
  { key: 'precipitation', label: 'Precip', unit: 'mm', description: '6 saatlik birikimli yağış öngörüsü (milimetre)' },
  { key: 'temperature', label: 'Temp', unit: '°C', description: 'Sıcaklık öngörüsü (2m yükseklikte, santigrat derece)' },
  { key: 'relative_humidity', label: 'RH', unit: '%', description: 'Bağıl nem öngörüsü (yüzde)' },
  { key: 'mean_sea_level_pressure', label: 'MSLP', unit: 'hPa', description: 'Deniz seviyesine indirgenmiş basınç öngörüsü (hektopaskal)' },
  { key: 'cape', label: 'CAPE', unit: 'J/kg', description: 'Konvektif kullanılabilir potansiyel enerji öngörüsü — fırtına potansiyeli (joule/kilogram)' },
  { key: 'total_precipitable_water', label: 'TPW', unit: 'mm', description: 'Toplam yağabilir su öngörüsü (milimetre)' },
  { key: 'total_cloud_water', label: 'TCW', unit: 'kg/m²', description: 'Toplam bulut suyu öngörüsü (kilogram/metrekare)' },
  { key: 'dew_point', label: 'Dew', unit: '°C', description: 'Çiy noktası sıcaklığı öngörüsü (santigrat derece)' },
  { key: 'wet_bulb_temp', label: 'WBT', unit: '°C', description: 'Yaş termometre sıcaklığı öngörüsü (santigrat derece)' },
  { key: 'wind_power_density', label: 'WPD', unit: 'W/m²', description: 'Rüzgar güç yoğunluğu öngörüsü (watt/metrekare)' },
  { key: 'misery_index', label: 'MI', unit: '°C', description: 'Sıkıntı indeksi (Misery Index) öngörüsü — hissedilen sıcaklık (santigrat derece)' },
  { key: 'significant_wave_height', label: 'HTSGW', unit: 'm', description: 'Belirgin dalga yüksekliği öngörüsü (metre)' },
  { key: 'uv_index', label: 'UVI', unit: '', description: 'UV indeksi öngörüsü (birimsiz endeks, 0-11+) — yalnızca ilk 5 gün için veri var (kaynağın sınırı)' },
]

function formatIssuedAt(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const forecastDayList = ref([])
const forecastSnapshotStatus = ref(null) // null | 'unavailable' | snapshot

async function refreshForecastSnapshotStatus() {
  const variable = uiStore.selectedForecastVariable
  const entry = forecastDayList.value[uiStore.selectedForecastDayIndex]
  if (!variable || !entry) {
    forecastSnapshotStatus.value = null
    return
  }
  const snapshot = await fetchForecastSnapshot(variable, entry.forecastStepHours)
  forecastSnapshotStatus.value = snapshot ?? 'unavailable'
}

async function selectForecastVariable(option) {
  stopForecastPlayback() // switching variables mid-playback would otherwise keep advancing an index into the new (differently-sized) day list
  const nextVariable = uiStore.selectedForecastVariable === option.key ? null : option.key
  uiStore.setSelectedForecastVariable(nextVariable)
  if (!nextVariable) {
    forecastDayList.value = []
    forecastSnapshotStatus.value = null
    return
  }
  forecastDayList.value = await fetchForecastDayList(nextVariable)
  await refreshForecastSnapshotStatus()
}

function selectForecastDay(index) {
  uiStore.setSelectedForecastDayIndex(index)
  refreshForecastSnapshotStatus()
}

const selectedForecastDayEntry = () => forecastDayList.value[uiStore.selectedForecastDayIndex] ?? null

// spec 069 follow-up: "film gibi" playback through the available forecast
// days — request came with the observation that the day list is sparse
// (only the actually-ingested steps, e.g. day 1/3/5, not every day —
// intentional, see fetchForecastDayList's own Constitution IV comment, not
// something to fake a denser range for), so clicking through by hand is
// tedious for even a handful of frames. Loops back to the start rather than
// stopping at the end, matching a looping preview/GIF feel over a one-shot
// slideshow.
const PLAYBACK_INTERVAL_MS = 2200
const isPlayingForecast = ref(false)
// spec 069 follow-up: first Play press pre-fetches every frame (into
// fetchForecastSnapshot's own module-level cache, see forecastLayerData.js)
// BEFORE the interval starts, so the crossfade loop itself never waits on
// the network mid-playback — request was specifically to gate this behind
// a loading state on the play button itself (visual treatment left to the
// caller — this only exposes the boolean via .forecast-play-btn.loading).
const isPreloadingForecast = ref(false)
let playbackTimer = null
let preloadToken = 0

function stopForecastPlayback() {
  isPlayingForecast.value = false
  isPreloadingForecast.value = false
  preloadToken++ // invalidates any in-flight preload so it won't start the interval after a stop/variable-change
  clearInterval(playbackTimer)
  playbackTimer = null
}

async function startForecastPlayback() {
  if (forecastDayList.value.length <= 1) return
  const variable = uiStore.selectedForecastVariable
  const token = ++preloadToken
  isPreloadingForecast.value = true
  await Promise.all(
    forecastDayList.value.map((entry) => fetchForecastSnapshot(variable, entry.forecastStepHours)),
  )
  if (token !== preloadToken) return // stopped, or a different variable/play cycle started, while this was in flight
  isPreloadingForecast.value = false

  isPlayingForecast.value = true
  playbackTimer = setInterval(() => {
    const next = (uiStore.selectedForecastDayIndex + 1) % forecastDayList.value.length
    selectForecastDay(next)
  }, PLAYBACK_INTERVAL_MS)
}

function toggleForecastPlayback() {
  if (isPlayingForecast.value || isPreloadingForecast.value) stopForecastPlayback()
  else startForecastPlayback()
}

onBeforeUnmount(stopForecastPlayback)

const selectedForecastVariableMeta = computed(() =>
  FORECAST_VARIABLES.find((v) => v.key === uiStore.selectedForecastVariable) ?? null,
)

// Rounds to 1 decimal — these are forecast values (wind m/s, temp °C, etc.),
// not exact measurements, so more precision would be false confidence.
function formatRangeValue(n) {
  return Math.round(n * 10) / 10
}
</script>

<template>
  <div class="forecast-panel" :class="{ 'forecast-panel--opens-leftward': opensLeftward, 'forecast-panel--opens-downward': opensDownward }">
    <Transition name="flow-panel-expand">
      <div v-if="uiStore.forecastPanelOpen" class="forecast-panel-body">
        <div class="forecast-panel-header">
          <h4 class="forecast-panel-title">{{ t('flowPanel.forecast.rowLabel') }}</h4>
        </div>

        <div class="forecast-chip-row">
          <button
            v-for="option in FORECAST_VARIABLES"
            :key="option.key"
            type="button"
            class="forecast-chip"
            :class="{ 'forecast-chip--active': uiStore.selectedForecastVariable === option.key }"
            :title="option.description"
            @click="selectForecastVariable(option)"
          >{{ option.label }}</button>
        </div>

        <div v-if="uiStore.selectedForecastVariable" class="forecast-day-block">
          <div class="forecast-day-header">
            <div v-if="forecastDayList.length" class="forecast-day-header-left">
              <!-- spec 069 follow-up: play/pause through the (sparse —
                   only real ingested steps, e.g. day 1/3/5) day list like a
                   loop, instead of clicking the slider through each frame
                   by hand. Disabled rather than hidden when there's only
                   one frame, so the control doesn't jump around. -->
              <button
                type="button"
                class="forecast-play-btn"
                :class="{ active: isPlayingForecast, loading: isPreloadingForecast }"
                :disabled="forecastDayList.length <= 1 && !isPreloadingForecast"
                :title="isPreloadingForecast ? t('flowPanel.forecast.loadingFrames') : isPlayingForecast ? t('flowPanel.forecast.pause') : t('flowPanel.forecast.play')"
                :aria-label="isPreloadingForecast ? t('flowPanel.forecast.loadingFrames') : isPlayingForecast ? t('flowPanel.forecast.pause') : t('flowPanel.forecast.play')"
                @click="toggleForecastPlayback"
              >
                <Pause v-if="isPlayingForecast" class="forecast-play-icon" />
                <Play v-else class="forecast-play-icon" />
              </button>
              <span class="forecast-day-label">
                {{ t('flowPanel.forecast.dayLabel', {
                  n: selectedForecastDayEntry() ? Math.round(selectedForecastDayEntry().forecastStepHours / 24) : null,
                  date: selectedForecastDayEntry() ? new Date(selectedForecastDayEntry().validAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
                }) }}
              </span>
            </div>
            <span
              v-if="selectedForecastVariableMeta?.unit"
              class="forecast-unit-badge"
              :title="selectedForecastVariableMeta.description"
            >{{ selectedForecastVariableMeta.unit }}</span>
          </div>
          <template v-if="forecastDayList.length">
            <Slider
              :min="0"
              :max="forecastDayList.length - 1"
              :step="1"
              :model-value="[uiStore.selectedForecastDayIndex]"
              @update:model-value="(v) => { stopForecastPlayback(); selectForecastDay(v[0]) }"
              class="forecast-day-slider"
            />
            <p v-if="forecastSnapshotStatus === 'unavailable'" class="forecast-nodata">
              {{ t('flowPanel.forecast.noData') }}
            </p>
            <template v-else-if="forecastSnapshotStatus">
              <p class="forecast-asof">
                {{ t('windLayer.asOf', { time: formatIssuedAt(forecastSnapshotStatus.issuedAt) }) }}
              </p>
              <!-- spec 069 follow-up: the raw min/max the raster's color scale
                   uses, shown with its unit — user report: numbers seen
                   somewhere in this panel's context with no clear barem
                   (m? km? feet?) attached. -->
              <p v-if="forecastSnapshotStatus.valueRange" class="forecast-range">
                {{ t('flowPanel.forecast.rangeLabel', {
                  min: formatRangeValue(forecastSnapshotStatus.valueRange[0]),
                  max: formatRangeValue(forecastSnapshotStatus.valueRange[1]),
                  unit: selectedForecastVariableMeta?.unit,
                }) }}
              </p>
            </template>
          </template>
          <p v-else class="forecast-nodata">{{ t('flowPanel.forecast.noData') }}</p>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* Same visual language as FlowControlPanel.vue's flyout (dark blurred
   card, same expand-from-trigger animation) — deliberately not a new
   pattern, this panel is a sibling of that one, just given its own place
   per the partner review. */
.forecast-panel {
  position: relative;
  z-index: 30;
  align-self: flex-start;
}

.forecast-panel-body {
  position: absolute;
  bottom: calc(100% + 10px);
  left: -8px;
  /* Kullanıcı isteği (2026-08-18): Rüzgar & Akıntı ile aynı genişlik
     ("1'de onları... aynı genişlikte yapalım... genişleyip") —
     FlowControlPanel.vue'nun .flow-control-panel-body'siyle birebir
     eşleşiyor (360px / aynı max-width tavanı), altlı üstlü aynı sütunda
     duran iki panel artık aynı ölçekte okunuyor. */
  width: 360px;
  max-width: min(420px, calc(100vw - 32px));
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 18, 26, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  transform-origin: bottom left;
  z-index: 40;
  /* Kullanıcı bulgusu (2026-08-18) — FlowControlPanel.vue'nun kardeşi bu
     panel de aynı hataya sahipti: kısa viewport'ta 70vh'ye kadar yukarı
     büyüyünce üst kısmı header'ın (z-index 96, bu panelin 40'ından yüksek)
     ARKASINDA kalıyordu. Aynı düzeltme: --shell-header-height ne olursa
     olsun panel artık header'ın altındaki boşluğu asla aşamıyor. */
  max-height: min(70vh, calc(100vh - var(--shell-header-height, 0px) - 20px));
  overflow-y: auto;
}

/* spec 069 follow-up: same escape hatch as
   .flow-control-panel--opens-leftward — this panel now anchors from the
   right-hand control column, so its body must grow leftward instead of
   running off the viewport's right edge.
   spec 069 follow-up (second pass): nudged further left than the flush
   -8px Radar panel uses (360px wide) — at this panel's own narrower 320px,
   the same -8px right-offset left its own left edge sitting noticeably
   right of Radar's, so the two didn't read as cleanly stacked one above
   the other ("iki panel altlı üstlü olacak" — explicit ask). 40px roughly
   lines the two panels' left edges up instead. */
.forecast-panel--opens-leftward .forecast-panel-body {
  left: auto;
  /* Kullanıcı isteği (2026-08-18): artık Wind panelıyla (360px)
     aynı genişlikte olduğu için, sol kenarları da hizalansın diye
     FlowControlPanel.vue'nun .flow-control-panel--opens-leftward ile
     BİREBİR aynı right formülü kullanılıyor — eskiden bu ikisi farklı
     formüllerdi (320px'lik dar panel için elle ayarlanmış "40px - 2vw"),
     aynı genişlik + aynı formül artık iki panelin kenarlarını otomatik
     hizalıyor, ayrı bir "hizalama" sabiti tutmaya gerek kalmadı. Aynı
     formül zaten Wind tarafında her viewport genişliğinde (800-3440px)
     güvenli bir boşluk bırakıyor (canlı test edildi), o yüzden ikon
     çakışması riski de burada aynı şekilde ortadan kalkıyor. */
  right: calc(-8px + 1vw - 0.1vw);
  transform-origin: bottom right;
}

/* spec 069 follow-up: grows downward from the trigger instead of upward —
   for when this panel sits at the bottom of a stacked column (Radar above
   it), where opening upward would run straight into whatever's above. */
.forecast-panel--opens-downward .forecast-panel-body {
  bottom: auto;
  top: calc(100% + 10px);
  transform-origin: top left;
  /* Yukarı-büyüme durumunun header karşılığı — aşağı büyüyen panel de
     kendi kutusunun footer'ın (tarih scrubber'ı, durum satırı) arkasında
     kalmasını önlemek için --shell-footer-height'e göre sınırlandı. */
  max-height: min(70vh, calc(100vh - var(--shell-footer-height, 0px) - 20px));
}
.forecast-panel--opens-downward.forecast-panel--opens-leftward .forecast-panel-body {
  transform-origin: top right;
}

.forecast-panel-header {
  margin-bottom: 10px;
}
.forecast-panel-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: #e2e8f0;
}

.forecast-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.forecast-chip {
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: #e2e8f0;
  font-size: 0.75rem;
  cursor: pointer;
  font-family: inherit;
}
.forecast-chip:hover {
  background: rgba(255, 255, 255, 0.1);
}
.forecast-chip--active {
  background: #d4a94a;
  border-color: #d4a94a;
  color: #0b1220;
  font-weight: 700;
  box-shadow: 0 0 8px 1px rgba(212, 169, 74, 0.6);
}

.forecast-day-block {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.forecast-day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.forecast-day-header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.forecast-play-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.forecast-play-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.forecast-play-btn.active {
  border-color: #d4a94a;
  color: #d4a94a;
}
.forecast-play-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
/* spec 069 follow-up: pre-fetching every frame before playback starts —
   minimal placeholder state only (cursor + hint color), the user asked to
   add the actual loading animation/effect themselves. */
.forecast-play-btn.loading {
  cursor: wait;
  border-color: #d4a94a;
}
.forecast-play-icon {
  width: 10px;
  height: 10px;
}
.forecast-day-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
}
/* spec 069 follow-up: always-visible unit badge (was only in the chip's
   hover title before — easy to miss, user report). */
.forecast-unit-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(212, 169, 74, 0.15);
  border: 1px solid rgba(212, 169, 74, 0.35);
  color: #d4a94a;
  font-size: 0.62rem;
  font-weight: 700;
}
.forecast-day-slider {
  width: 100%;
  margin: 6px 0;
}
.forecast-nodata {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.45);
  margin: 0;
}
.forecast-asof {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  margin: 0;
}
.forecast-range {
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.55);
  margin: 2px 0 0;
}

.flow-panel-expand-enter-active,
.flow-panel-expand-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.flow-panel-expand-enter-from,
.flow-panel-expand-leave-to {
  opacity: 0;
  transform: scale(0.96) translateY(6px);
}
</style>
