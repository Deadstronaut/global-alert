<script setup>
// spec 068 follow-up (partner review, page 3 annotation: "Foresight, Shelter
// points, and Exposure layers can be allocated in Dashboard / Monitoring
// page" — the reviewer specifically flagged the Forecast/"Foresight" row for
// not having its own place, previously buried inside FlowControlPanel.vue's
// Wind & Current panel). Extracted into its own standalone panel + trigger,
// same shared-open-state pattern as FlowControlPanel (uiStore.flowPanelOpen /
// toggleFlowPanel) via uiStore.forecastPanelOpen / toggleForecastPanel.
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui.js'
import { Slider } from '@/components/ui/slider'
import { fetchForecastDayList, fetchForecastSnapshot } from '@/utils/forecastLayerData.js'

const { t } = useI18n()
const uiStore = useUIStore()

// Same wording/keys as FlowControlPanel.vue's former Forecast row (spec
// 056) — kept identical so no translation/meaning drift between the two.
const FORECAST_VARIABLES = [
  { key: 'wind_speed', label: 'Wind', description: 'Rüzgar hızı öngörüsü (10m, m/s) — statik ısı haritası, animasyonlu değil' },
  { key: 'precipitation', label: 'Precip', description: '6 saatlik birikimli yağış öngörüsü (mm)' },
  { key: 'temperature', label: 'Temp', description: 'Sıcaklık öngörüsü (2m, °C)' },
  { key: 'relative_humidity', label: 'RH', description: 'Bağıl nem öngörüsü (%)' },
  { key: 'mean_sea_level_pressure', label: 'MSLP', description: 'Deniz seviyesine indirgenmiş basınç öngörüsü (hPa)' },
  { key: 'cape', label: 'CAPE', description: 'Konvektif kullanılabilir potansiyel enerji öngörüsü — fırtına potansiyeli (J/kg)' },
  { key: 'total_precipitable_water', label: 'TPW', description: 'Toplam yağabilir su öngörüsü (mm)' },
  { key: 'total_cloud_water', label: 'TCW', description: 'Toplam bulut suyu öngörüsü (kg/m²)' },
  { key: 'dew_point', label: 'Dew', description: 'Çiy noktası sıcaklığı öngörüsü (°C)' },
  { key: 'wet_bulb_temp', label: 'WBT', description: 'Yaş termometre sıcaklığı öngörüsü (°C)' },
  { key: 'wind_power_density', label: 'WPD', description: 'Rüzgar güç yoğunluğu öngörüsü (W/m²)' },
  { key: 'misery_index', label: 'MI', description: 'Sıkıntı indeksi (Misery Index) öngörüsü — hissedilen sıcaklık (°C)' },
  { key: 'significant_wave_height', label: 'HTSGW', description: 'Belirgin dalga yüksekliği öngörüsü (m)' },
  { key: 'uv_index', label: 'UVI', description: 'UV indeksi öngörüsü — yalnızca ilk 5 gün için veri var (kaynağın sınırı)' },
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
</script>

<template>
  <div class="forecast-panel">
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
          <template v-if="forecastDayList.length">
            <span class="forecast-day-label">
              {{ t('flowPanel.forecast.dayLabel', {
                n: selectedForecastDayEntry() ? Math.round(selectedForecastDayEntry().forecastStepHours / 24) : null,
                date: selectedForecastDayEntry() ? new Date(selectedForecastDayEntry().validAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '',
              }) }}
            </span>
            <Slider
              :min="0"
              :max="forecastDayList.length - 1"
              :step="1"
              :model-value="[uiStore.selectedForecastDayIndex]"
              @update:model-value="(v) => selectForecastDay(v[0])"
              class="forecast-day-slider"
            />
            <p v-if="forecastSnapshotStatus === 'unavailable'" class="forecast-nodata">
              {{ t('flowPanel.forecast.noData') }}
            </p>
            <p v-else-if="forecastSnapshotStatus" class="forecast-asof">
              {{ t('windLayer.asOf', { time: formatIssuedAt(forecastSnapshotStatus.issuedAt) }) }}
            </p>
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
  width: 320px;
  max-width: min(380px, calc(100vw - 32px));
  padding: 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(15, 18, 26, 0.98);
  backdrop-filter: blur(10px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55);
  transform-origin: bottom left;
  z-index: 40;
  max-height: 70vh;
  overflow-y: auto;
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
.forecast-day-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.5);
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
