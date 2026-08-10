<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ChartContainer } from '@/components/ui/chart'
import { Slider } from '@/components/ui/slider'
import { VisXYContainer, VisLine, VisArea, VisAxis, VisCrosshair, VisTooltip } from '@unovis/vue'
import {
  fetchForecastSnapshots,
  fetchForecastOutlook,
  toDailySeries,
  freshnessAgeHours,
} from '@/utils/forecastData.js'

const { t, locale } = useI18n()

// Full GFS_OVERLAY_FIELDS expansion (spec 055 follow-up, 2026-08-06 — all
// 13 GFS-native overlay variables the 15-day horizon now ingests, not just
// the original wind/precip/temp trio).
const VARIABLES_15D = [
  'wind_speed', 'precipitation', 'temperature',
  'relative_humidity', 'mean_sea_level_pressure', 'cape',
  'total_precipitable_water', 'total_cloud_water', 'dew_point',
  'wet_bulb_temp', 'wind_power_density', 'misery_index',
  'significant_wave_height', 'uv_index',
]
// forecast_outlooks only classifies precipitation/temperature
// (data-model.md's ForecastOutlook CHECK constraint) — the 1mo/3mo
// variable selector only ever offers these two.
const VARIABLES_OUTLOOK = ['precipitation', 'temperature']

const horizon = ref('15d')
const dayCount = ref(15)
function onDaySliderChange(values) {
  dayCount.value = values[0]
  horizon.value = '15d'
}
function selectOutlookHorizon(h) {
  horizon.value = h
}
// Only drives the 1mo/3mo outlook selector now — the 15-day view shows
// every variable at once (grid below) instead of one at a time, per the
// 2026-08-07 follow-up ask ("dropdown menü değiştirmemize gerek yok
// hepsini görelim").
const variable = ref('precipitation')
const availableVariables = computed(() => VARIABLES_OUTLOOK)
watch(availableVariables, (list) => {
  if (!list.includes(variable.value)) variable.value = list[0]
})
// forecast_snapshots has no region_code column (data-model.md — it's a
// global raster per day, not a per-region number), so region only applies
// to the 1mo/3mo probabilistic outlook, which IS per-region.
const regionCode = ref('')

const loading = ref(false)
const errorMessage = ref(null)
const outlookRow = ref(null)

async function load() {
  if (horizon.value === '15d') return // handled by loadAllVariables below
  loading.value = true
  errorMessage.value = null
  try {
    if (regionCode.value.trim()) {
      outlookRow.value = await fetchForecastOutlook(horizon.value, regionCode.value.trim(), variable.value)
    } else {
      outlookRow.value = null
    }
  } catch (err) {
    errorMessage.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([horizon, variable, regionCode], load)

// 15-day landing view: instead of a one-variable-at-a-time dropdown, show
// every GFS-ingested variable as its own small chart at once, 3 per row,
// stacked as needed — fetched independently per variable so one
// missing/failed variable doesn't blank the rest (FR-010).
const allVariableRows = ref({})
const allVariablesLoading = ref(false)
async function loadAllVariables() {
  allVariablesLoading.value = true
  await Promise.all(
    VARIABLES_15D.map(async (v) => {
      try {
        const rows = await fetchForecastSnapshots(v)
        allVariableRows.value = { ...allVariableRows.value, [v]: rows }
      } catch {
        allVariableRows.value = { ...allVariableRows.value, [v]: [] }
      }
    }),
  )
  allVariablesLoading.value = false
}
onMounted(loadAllVariables)

function seriesFor(v) {
  return toDailySeries(allVariableRows.value[v] ?? []).slice(0, dayCount.value)
}
function latestValueFor(v) {
  const series = seriesFor(v)
  return series.length ? series[series.length - 1].valueMax : null
}
// The big detailed chart below the grid — defaults to wind_speed, but
// clicking any of the 14 small cards focuses that variable here instead,
// per the 2026-08-07 follow-up ("altta grafik gibi bir şey de vardı... o
// çok güzel duruyordu" — bring the large chart back alongside the grid,
// not instead of it).
const detailVariable = ref('wind_speed')
function selectDetailVariable(v) {
  detailVariable.value = v
}
const detailSeries = computed(() => seriesFor(detailVariable.value))
// spec 059: which model cycle produced the currently-shown detail series,
// so an analyst can tell one GFS run's data apart from the next.
const detailModelVersion = computed(() => detailSeries.value.find((d) => d.modelVersion)?.modelVersion ?? null)
const detailChartConfig = computed(() => ({
  valueMax: { label: variableLabel(detailVariable.value), color: '#42a5f5' },
}))
// Per-variable "no data at all" (FR-010) — each of the 14 cards/the big
// chart hides itself only when there are truly zero ingested rows, not
// merely because the latest cycle is older than STALE_AFTER_HOURS. A
// stale-but-present forecast still has a real line to draw; per spec.md's
// Edge Cases, staleness should be surfaced via the "as of" age (FR-007),
// not used to blank a chart that actually has data (this was hiding every
// card's sparkline even though its latest-value number was showing).
function isVariableUnavailable(v) {
  if (allVariablesLoading.value) return false
  return seriesFor(v).length === 0
}
const latestIssuedAt15d = computed(() =>
  Object.values(allVariableRows.value)
    .flat()
    .reduce((latest, row) => (!latest || row.issued_at > latest ? row.issued_at : latest), null),
)

const unavailable = computed(() => {
  if (horizon.value === '15d') return false // handled per-card in the grid instead
  if (!regionCode.value.trim()) return false // not "unavailable", just nothing selected yet
  return !loading.value && !outlookRow.value
})
const notConfigured = computed(() => horizon.value !== '15d' && !loading.value && regionCode.value.trim() && !outlookRow.value)

const asOfLabel = computed(() => {
  const issuedAt = horizon.value === '15d' ? latestIssuedAt15d.value : outlookRow.value?.issued_at
  if (!issuedAt) return null
  const ageHours = freshnessAgeHours(issuedAt)
  return t('dashboard.forecast.asOf', { time: `${new Date(issuedAt).toLocaleString(locale.value)} (${Math.round(ageHours)}h)` })
})

const VARIABLE_I18N_KEYS = {
  wind_speed: 'WindSpeed',
  precipitation: 'Precipitation',
  temperature: 'Temperature',
  relative_humidity: 'RelativeHumidity',
  mean_sea_level_pressure: 'MeanSeaLevelPressure',
  cape: 'Cape',
  total_precipitable_water: 'TotalPrecipitableWater',
  total_cloud_water: 'TotalCloudWater',
  dew_point: 'DewPoint',
  wet_bulb_temp: 'WetBulbTemp',
  wind_power_density: 'WindPowerDensity',
  misery_index: 'MiseryIndex',
  significant_wave_height: 'SignificantWaveHeight',
  uv_index: 'UvIndex',
}
function variableLabel(v) {
  return t(`dashboard.forecast.variable${VARIABLE_I18N_KEYS[v]}`)
}
// Same unit convention as FlowControlPanel.vue's OVERLAY_UNITS, extended
// with wind_speed (not an Overlay-layer variable there, so absent from
// that map).
const VARIABLE_UNITS = {
  wind_speed: 'm/s', precipitation: 'mm', temperature: '°C',
  relative_humidity: '%', mean_sea_level_pressure: 'hPa', cape: 'J/kg',
  total_precipitable_water: 'mm', total_cloud_water: 'kg/m²', dew_point: '°C',
  wet_bulb_temp: '°C', wind_power_density: 'W/m²', misery_index: '°C',
  significant_wave_height: 'm', uv_index: '',
}

const classificationLabel = computed(() => {
  if (!outlookRow.value) return null
  return outlookRow.value.classification
})
// The only other real field CFSv2 ingestion populates besides the
// classification itself (data-model.md's ForecastOutlook.valid_period_*)
// — which actual month/season this specific outlook is *for*, so it reads
// as "the outlook for September 2026" rather than a bare, context-free
// label. `confidence` stays unused here on purpose: live data confirms
// wind-importer never populates it (always null), so showing a percentage
// would be fabricated, not real (Constitution Principle IV).
const validPeriodLabel = computed(() => {
  if (!outlookRow.value?.valid_period_start || !outlookRow.value?.valid_period_end) return null
  const start = new Date(outlookRow.value.valid_period_start)
  const end = new Date(outlookRow.value.valid_period_end)
  const fmt = (d, opts) => d.toLocaleDateString(locale.value, opts)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return fmt(start, { month: 'long', year: 'numeric' })
  }
  return `${fmt(start, { month: 'long', year: 'numeric' })} – ${fmt(end, { month: 'long', year: 'numeric' })}`
})
const TERCILES = ['below_normal', 'near_normal', 'above_normal']
const CLASSIFICATION_I18N_KEYS = {
  below_normal: 'classificationBelowNormal',
  near_normal: 'classificationNearNormal',
  above_normal: 'classificationAboveNormal',
}
function tercileLabel(key) {
  return t(`dashboard.forecast.${CLASSIFICATION_I18N_KEYS[key]}`)
}
// confidence (data-model.md's ForecastOutlook.confidence, 0.0-1.0) is
// nullable — CFSv2 ingestion may not populate it yet, so this stays null
// rather than fabricating a percentage (FR-010/Constitution Principle IV).
const confidencePct = computed(() =>
  outlookRow.value?.confidence != null ? Math.round(outlookRow.value.confidence * 100) : null,
)
</script>

<template>
  <Card class="forecast-panel">
    <CardHeader>
      <CardTitle>🌦️ {{ t('dashboard.forecast.panelTitle') }}</CardTitle>
      <CardDescription>{{ asOfLabel }}</CardDescription>
    </CardHeader>
    <CardContent class="forecast-panel-content">
      <div class="forecast-horizon-row">
        <div class="forecast-day-slider">
          <span class="forecast-day-slider-label">{{ t('dashboard.forecast.dayLabel', { n: dayCount }) }}</span>
          <Slider
            :model-value="[dayCount]"
            :min="1"
            :max="15"
            :step="1"
            class="forecast-day-slider-control"
            @update:model-value="onDaySliderChange"
          />
        </div>
        <div class="forecast-outlook-buttons">
          <button
            type="button"
            class="forecast-outlook-btn"
            :class="{ 'forecast-outlook-btn--active': horizon === '1mo' }"
            @click="selectOutlookHorizon('1mo')"
          >
            {{ t('dashboard.forecast.horizon1mo') }}
          </button>
          <button
            type="button"
            class="forecast-outlook-btn"
            :class="{ 'forecast-outlook-btn--active': horizon === '3mo' }"
            @click="selectOutlookHorizon('3mo')"
          >
            {{ t('dashboard.forecast.horizon3mo') }}
          </button>
        </div>
      </div>

      <div v-if="horizon !== '15d'" class="forecast-controls">
        <label>
          <select v-model="variable">
            <option v-for="v in availableVariables" :key="v" :value="v">{{ variableLabel(v) }}</option>
          </select>
        </label>
        <label>
          <input
            v-model="regionCode"
            type="text"
            :placeholder="t('dashboard.forecast.regionPlaceholder')"
            :aria-label="t('dashboard.forecast.regionLabel')"
          />
        </label>
      </div>

      <p v-if="horizon === '15d' && allVariablesLoading" class="forecast-status">{{ t('dashboard.forecast.loading') }}</p>
      <p v-else-if="notConfigured" class="forecast-status">{{ t('dashboard.forecast.notConfigured') }}</p>
      <p v-else-if="horizon !== '15d' && !regionCode.trim()" class="forecast-status">{{ t('dashboard.forecast.regionRequiredHint') }}</p>
      <p v-else-if="unavailable" class="forecast-status">{{ t('dashboard.forecast.unavailable') }}</p>

      <template v-else-if="horizon === '15d'">
        <div class="forecast-overview-grid">
          <button
            v-for="v in VARIABLES_15D"
            :key="v"
            type="button"
            class="forecast-overview-card"
            :class="{ 'forecast-overview-card--active': detailVariable === v }"
            @click="selectDetailVariable(v)"
          >
            <div class="forecast-overview-card-header">
              <span class="forecast-overview-card-label">{{ variableLabel(v) }}</span>
              <span v-if="latestValueFor(v) !== null" class="forecast-overview-card-value">
                {{ latestValueFor(v).toFixed(1) }}{{ VARIABLE_UNITS[v] }}
              </span>
            </div>
            <p v-if="isVariableUnavailable(v)" class="forecast-overview-card-unavailable">
              {{ t('dashboard.forecast.unavailable') }}
            </p>
            <ChartContainer v-else :config="{ valueMax: { label: variableLabel(v), color: '#42a5f5' } }" class="aspect-auto h-10 w-full">
              <VisXYContainer :data="seriesFor(v)" :margin="{ left: 0, right: 0, top: 2, bottom: 2 }">
                <VisArea :x="(d) => d.day" :y="(d) => d.valueMax" color="var(--color-valueMax)" :opacity="0.25" />
                <VisLine :x="(d) => d.day" :y="(d) => d.valueMax" :color="() => 'var(--color-valueMax)'" :line-width="1.5" />
              </VisXYContainer>
            </ChartContainer>
          </button>
        </div>

        <p v-if="isVariableUnavailable(detailVariable)" class="forecast-status">{{ t('dashboard.forecast.unavailable') }}</p>
        <ChartContainer v-else :config="detailChartConfig" class="aspect-auto h-35 w-full">
          <VisXYContainer :data="detailSeries" :margin="{ left: 4, right: 4 }">
            <VisArea :x="(d) => d.day" :y="(d) => d.valueMax" color="var(--color-valueMax)" :opacity="0.3" />
            <VisLine :x="(d) => d.day" :y="(d) => d.valueMax" :color="() => 'var(--color-valueMax)'" />
            <VisAxis
              type="x"
              :tick-format="(i) => detailSeries[i] !== undefined ? t('dashboard.forecast.dayLabel', { n: detailSeries[i].day }) : ''"
              :num-ticks="detailSeries.length"
              :grid-line="false"
              :domain-line="false"
            />
            <VisCrosshair
              :template="(d) => `${t('dashboard.forecast.dayLabel', { n: d.day })}: ${d.valueMin.toFixed(1)}–${d.valueMax.toFixed(1)}` +
                (d.confidenceScore !== null && d.confidenceScore !== undefined
                  ? ` · ${t('dashboard.forecast.confidenceLabel', { pct: Math.round(d.confidenceScore * 100) })}`
                  : '')"
            />
            <VisTooltip />
          </VisXYContainer>
        </ChartContainer>
        <p v-if="detailModelVersion" class="forecast-model-version">
          {{ t('dashboard.forecast.modelVersion', { version: detailModelVersion }) }}
        </p>
      </template>

      <template v-else>
        <p class="forecast-probabilistic-notice">
          {{ horizon === '1mo' ? t('dashboard.forecast.probabilisticNotice') : t('dashboard.forecast.seasonalNotice') }}
        </p>
        <p v-if="validPeriodLabel" class="forecast-valid-period">
          {{ t('dashboard.forecast.validPeriodLabel', { period: validPeriodLabel }) }}
        </p>
        <div
          class="forecast-tercile-chart"
          role="img"
          :aria-label="`${variableLabel(variable)}: ${tercileLabel(classificationLabel)}`"
        >
          <div v-for="tercile in TERCILES" :key="tercile" class="forecast-tercile-column">
            <span v-if="classificationLabel === tercile && confidencePct !== null" class="forecast-tercile-bar-value">
              {{ confidencePct }}%
            </span>
            <div
              class="forecast-tercile-bar"
              :class="[`forecast-tercile-bar--${tercile}`, { 'forecast-tercile-bar--active': classificationLabel === tercile }]"
              :style="{ height: classificationLabel === tercile ? `${confidencePct ?? 100}%` : '6%' }"
            />
            <span class="forecast-tercile-label">{{ tercileLabel(tercile) }}</span>
          </div>
        </div>
      </template>

      <p v-if="errorMessage" class="forecast-status forecast-status--error">{{ errorMessage }}</p>
    </CardContent>
  </Card>
</template>

<style scoped>
.forecast-panel-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.forecast-controls {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.forecast-overview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.5rem;
}
.forecast-overview-card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.5rem;
  background: var(--background);
  text-align: left;
  cursor: pointer;
}
.forecast-overview-card:hover {
  background: var(--muted);
}
.forecast-overview-card--active {
  border-color: var(--primary);
}
.forecast-overview-card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.forecast-overview-card-label {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.forecast-overview-card-value {
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}
.forecast-overview-card-unavailable {
  height: 2.5rem;
  display: flex;
  align-items: center;
  font-size: 0.6875rem;
  color: var(--muted-foreground);
}
.forecast-horizon-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.forecast-day-slider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1 1 12rem;
  min-width: 10rem;
}
.forecast-day-slider-label {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  white-space: nowrap;
  min-width: 5.5rem;
}
.forecast-day-slider-control {
  flex: 1 1 auto;
}
.forecast-outlook-buttons {
  display: flex;
  gap: 0.375rem;
}
.forecast-outlook-btn {
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.25rem 0.75rem;
  background: var(--background);
  color: var(--foreground);
  font-size: 0.8125rem;
  cursor: pointer;
}
.forecast-outlook-btn:hover {
  background: var(--muted);
}
.forecast-outlook-btn--active {
  background: var(--primary);
  color: var(--primary-foreground);
  border-color: var(--primary);
}
.forecast-controls select,
.forecast-controls input {
  border: 1px solid var(--border);
  border-radius: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: var(--background);
  color: var(--foreground);
}
.forecast-status {
  color: var(--muted-foreground);
  font-size: 0.875rem;
}
.forecast-status--error {
  color: var(--destructive);
}
.forecast-probabilistic-notice {
  font-size: 0.75rem;
  color: var(--muted-foreground);
}
.forecast-model-version {
  font-size: 0.75rem;
  color: var(--muted-foreground);
  margin-top: 4px;
}
.forecast-valid-period {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--foreground);
}
.forecast-tercile-chart {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  height: 6rem;
  padding-top: 1.25rem;
}
.forecast-tercile-column {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 0.25rem;
}
.forecast-tercile-bar-value {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--foreground);
}
.forecast-tercile-bar {
  width: 100%;
  border-radius: 0.25rem 0.25rem 0 0;
  background: var(--muted);
  min-height: 4px;
  transition: height 0.2s ease;
}
.forecast-tercile-bar--active.forecast-tercile-bar--below_normal {
  background: #d97706;
}
.forecast-tercile-bar--active.forecast-tercile-bar--near_normal {
  background: #6b7280;
}
.forecast-tercile-bar--active.forecast-tercile-bar--above_normal {
  background: #059669;
}
.forecast-tercile-label {
  font-size: 0.6875rem;
  color: var(--muted-foreground);
  text-align: center;
}
</style>
