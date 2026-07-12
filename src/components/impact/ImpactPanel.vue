<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { supabase } from '@/services/api/config.js'
import { defaultBufferRadiusKm } from '@/lib/hazardBuffer.js'
import { classifyTrend } from '@/lib/trendSparkline.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'

const props = defineProps({
  selectedEvent: { type: Object, default: null },
})

const { t } = useI18n()
const auth = useAuthStore()
const disaster = useDisasterStore()

const datasets = ref([])
const selectedDatasetId = ref(null)
const radiusOverride = ref(null)
const result = ref(null) // null | { total_value, feature_count } | 'error'
const analyzing = ref(false)
const scenarios = ref([])
const scenarioName = ref('')
const loadedScenario = ref(null)

// spec 034 (US1/US3/US4): critical infrastructure list, sector/boundary
// breakdown, and data-completeness score, all derived from the same
// dataset/point/radius as the main compute_zonal_stats analysis above.
const criticalInfrastructure = ref(null) // null | [] | array | 'error'
const breakdownType = ref('sector') // 'sector' | 'boundary'
const breakdown = ref(null) // null | [] | array | 'error'
const completeness = ref(null) // null | { ratio: number|null } | 'error'

const canAnalyze = computed(() => auth.isSuperAdmin || ['country_admin', 'org_admin'].includes(auth.session?.role))

const effectiveRadiusKm = computed(() => {
  if (radiusOverride.value !== null && radiusOverride.value !== '') return Number(radiusOverride.value)
  return props.selectedEvent ? defaultBufferRadiusKm(props.selectedEvent) : null
})

// Lightweight, dependency-free 24h trend (research.md §6) — count of same-type
// events seen in each of six 4-hour buckets across the last 24h, purely from
// already-cached client-side event data (no new polling/backend query).
const BUCKET_HOURS = 4
const BUCKET_COUNT = 6
const trend = computed(() => {
  if (!props.selectedEvent) return null
  const sameType = (disaster.allEvents || []).filter((e) => e.type === props.selectedEvent.type)
  const now = Date.now()
  const buckets = new Array(BUCKET_COUNT).fill(0)
  for (const event of sameType) {
    const ageHours = (now - new Date(event.time).getTime()) / 3_600_000
    if (ageHours < 0 || ageHours >= BUCKET_COUNT * BUCKET_HOURS) continue
    const bucketIndex = BUCKET_COUNT - 1 - Math.floor(ageHours / BUCKET_HOURS)
    buckets[bucketIndex] += 1
  }
  return classifyTrend(buckets)
})

async function loadDatasets() {
  const { data } = await supabase.from('exposure_datasets').select('*').order('created_at', { ascending: false })
  datasets.value = data || []
}

async function loadScenarios() {
  const { data } = await supabase
    .from('impact_scenarios')
    .select('*, exposure_datasets(id,name)')
    .order('created_at', { ascending: false })
  scenarios.value = data || []
}

async function runAnalysis() {
  if (!props.selectedEvent || !selectedDatasetId.value) return
  analyzing.value = true
  result.value = null
  criticalInfrastructure.value = null
  breakdown.value = null
  completeness.value = null
  const rpcParams = {
    dataset_id: selectedDatasetId.value,
    center_lat: props.selectedEvent.lat,
    center_lng: props.selectedEvent.lng,
    radius_km: effectiveRadiusKm.value,
  }
  const { data, error } = await supabase.rpc('compute_zonal_stats', rpcParams)
  analyzing.value = false
  if (error) {
    result.value = 'error'
    return
  }
  result.value = data?.[0] ?? { total_value: 0, feature_count: 0 }
  await Promise.all([
    loadCriticalInfrastructure(rpcParams),
    loadBreakdown(rpcParams),
    loadCompleteness(rpcParams),
  ])
}

async function loadCriticalInfrastructure(rpcParams) {
  const { data, error } = await supabase.rpc('get_critical_infrastructure_features', rpcParams)
  criticalInfrastructure.value = error ? 'error' : (data ?? [])
}

async function loadBreakdown(rpcParams) {
  const fn = breakdownType.value === 'sector' ? 'compute_sector_breakdown' : 'compute_boundary_breakdown'
  const { data, error } = await supabase.rpc(fn, rpcParams)
  breakdown.value = error ? 'error' : (data ?? [])
}

async function loadCompleteness(rpcParams) {
  const { data, error } = await supabase.rpc('compute_data_completeness', rpcParams)
  if (error) {
    completeness.value = 'error'
    return
  }
  const row = data?.[0]
  completeness.value = { ratio: row?.completeness_ratio ?? null }
}

async function switchBreakdownType(type) {
  breakdownType.value = type
  if (!props.selectedEvent || !selectedDatasetId.value || !result.value || result.value === 'error') return
  await loadBreakdown({
    dataset_id: selectedDatasetId.value,
    center_lat: props.selectedEvent.lat,
    center_lng: props.selectedEvent.lng,
    radius_km: effectiveRadiusKm.value,
  })
}

async function saveScenario() {
  if (!scenarioName.value.trim() || !props.selectedEvent || !selectedDatasetId.value || !result.value || result.value === 'error') return
  await supabase.from('impact_scenarios').insert({
    name: scenarioName.value.trim(),
    hazard_event_snapshot: props.selectedEvent,
    exposure_dataset_id: selectedDatasetId.value,
    radius_km_override: radiusOverride.value ? Number(radiusOverride.value) : null,
    result_snapshot: result.value,
    country_code: auth.countryCode,
    org_id: auth.session?.orgId ?? null,
  })
  scenarioName.value = ''
  await loadScenarios()
}

function loadScenario(scenario) {
  loadedScenario.value = scenario
  selectedDatasetId.value = scenario.exposure_dataset_id
  radiusOverride.value = scenario.radius_km_override
  result.value = scenario.result_snapshot
  // A saved scenario only stores compute_zonal_stats' result_snapshot
  // (spec 008); the derived US1/US3/US4 views require a fresh analysis run.
  criticalInfrastructure.value = null
  breakdown.value = null
  completeness.value = null
}

function exportSummary(format) {
  if (!result.value || result.value === 'error' || !props.selectedEvent) return
  const row = {
    hazard: props.selectedEvent.title,
    dataset: datasets.value.find((d) => d.id === selectedDatasetId.value)?.name ?? '',
    radius_km: effectiveRadiusKm.value,
    total_value: result.value.total_value,
    feature_count: result.value.feature_count,
  }
  const stamp = Date.now()
  if (format === 'csv') triggerDownload(rowsToCsv([row]), `impact-analysis-${stamp}.csv`, 'text/csv')
  else triggerDownload(rowsToJson([row]), `impact-analysis-${stamp}.json`, 'application/json')
}

async function exportGeoJson() {
  if (!props.selectedEvent || !selectedDatasetId.value) return
  const { data } = await supabase.rpc('get_intersecting_features', {
    dataset_id: selectedDatasetId.value,
    center_lat: props.selectedEvent.lat,
    center_lng: props.selectedEvent.lng,
    radius_km: effectiveRadiusKm.value,
  })
  const featureCollection = {
    type: 'FeatureCollection',
    features: (data || []).map((row) => ({
      type: 'Feature',
      geometry: JSON.parse(row.geom_geojson),
      properties: { ...row.properties, metric_value: row.metric_value },
    })),
  }
  triggerDownload(JSON.stringify(featureCollection, null, 2), `impact-analysis-${Date.now()}.geojson`, 'application/geo+json')
}

watch(() => props.selectedEvent, () => {
  result.value = null
  radiusOverride.value = null
  loadedScenario.value = null
  criticalInfrastructure.value = null
  breakdown.value = null
  completeness.value = null
})

onMounted(() => {
  loadDatasets()
  loadScenarios()
})
</script>

<template>
  <div class="impact-panel">
    <div v-if="!selectedEvent" class="impact-empty">{{ t('impact.panel.selectPrompt') }}</div>

    <template v-else>
      <div class="impact-event">
        <h4>{{ selectedEvent.title }}</h4>
        <div class="impact-event-meta">
          <span>{{ t('disasters.' + selectedEvent.type) }}</span>
          <span>{{ t('severity.' + selectedEvent.severity) }}</span>
        </div>
        <svg v-if="trend" class="trend-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline
            :points="trend.points.map((v, i) => `${(i / (trend.points.length - 1 || 1)) * 100},${30 - (v / Math.max(...trend.points, 1)) * 28}`).join(' ')"
            :class="'trend-' + trend.direction"
          />
        </svg>
      </div>

      <div v-if="canAnalyze" class="impact-workflow">
        <label class="impact-field">
          <span>{{ t('impact.panel.step1') }}: {{ t('impact.panel.datasetLabel') }}</span>
          <select v-model="selectedDatasetId">
            <option :value="null">—</option>
            <option v-for="d in datasets" :key="d.id" :value="d.id">{{ d.name }}{{ d.source_name ? ` (${d.source_name})` : '' }}</option>
          </select>
        </label>
        <label class="impact-field">
          <span>{{ t('impact.panel.radiusOverride') }} ({{ t('impact.panel.defaultRadius', { km: defaultBufferRadiusKm(selectedEvent) }) }})</span>
          <input type="number" v-model="radiusOverride" :placeholder="String(defaultBufferRadiusKm(selectedEvent))" />
        </label>
        <button class="btn-analyze" :disabled="!selectedDatasetId || analyzing" @click="runAnalysis">
          {{ analyzing ? t('impact.panel.analyzing') : t('impact.panel.runAnalysis') }}
        </button>

        <div v-if="result === 'error'" class="impact-notice impact-notice-error">{{ t('impact.panel.error') }}</div>
        <div v-else-if="result && result.feature_count === 0" class="impact-notice">{{ t('impact.panel.noOverlap') }}</div>
        <div v-else-if="result" class="impact-result">
          <div class="impact-result-value">{{ result.total_value }}</div>
          <div class="impact-result-label">{{ t('impact.panel.featuresCount', { count: result.feature_count }) }}</div>
          <div v-if="completeness && completeness !== 'error'" class="impact-completeness">
            {{ t('impact.panel.completenessLabel') }}:
            <strong v-if="completeness.ratio !== null">{{ Math.round(completeness.ratio * 100) }}%</strong>
            <strong v-else>{{ t('impact.panel.completenessNoData') }}</strong>
          </div>
          <div class="impact-export-row">
            <button class="btn-export" @click="exportSummary('csv')">{{ t('impact.panel.exportCsv') }}</button>
            <button class="btn-export" @click="exportSummary('json')">{{ t('impact.panel.exportJson') }}</button>
            <button class="btn-export" @click="exportGeoJson">{{ t('impact.panel.exportGeoJson') }}</button>
          </div>
        </div>

        <div v-if="result && result !== 'error'" class="impact-critical">
          <h5>{{ t('impact.panel.criticalInfrastructureTitle') }}</h5>
          <div v-if="criticalInfrastructure === 'error'" class="impact-notice impact-notice-error">{{ t('impact.panel.error') }}</div>
          <div v-else-if="!criticalInfrastructure || !criticalInfrastructure.length" class="impact-notice">{{ t('impact.panel.criticalInfrastructureEmpty') }}</div>
          <ul v-else class="impact-critical-list">
            <li v-for="f in criticalInfrastructure" :key="f.id">
              {{ t('assetCategory.' + f.asset_category, f.asset_category) }} — {{ f.metric_value }}
            </li>
          </ul>
        </div>

        <div v-if="result && result !== 'error'" class="impact-breakdown">
          <h5>{{ t('impact.panel.breakdownTitle') }}</h5>
          <div class="impact-breakdown-toggle">
            <button :class="{ active: breakdownType === 'sector' }" @click="switchBreakdownType('sector')">{{ t('impact.panel.breakdownBySector') }}</button>
            <button :class="{ active: breakdownType === 'boundary' }" @click="switchBreakdownType('boundary')">{{ t('impact.panel.breakdownByBoundary') }}</button>
          </div>
          <div v-if="breakdown === 'error'" class="impact-notice impact-notice-error">{{ t('impact.panel.error') }}</div>
          <div v-else-if="!breakdown || !breakdown.length" class="impact-notice">{{ t('impact.panel.breakdownEmpty') }}</div>
          <ul v-else class="impact-breakdown-list">
            <li v-for="g in breakdown" :key="g.group_key">
              <span>{{ g.group_key === 'unclassified' ? t('impact.panel.unclassified') : g.group_key }}</span>
              <span>{{ g.total_value }} ({{ g.feature_count }})</span>
            </li>
          </ul>
        </div>

        <div v-if="result && result !== 'error'" class="impact-save">
          <input v-model="scenarioName" :placeholder="t('impact.panel.scenarioNamePlaceholder')" />
          <button class="btn-save" @click="saveScenario">{{ t('impact.panel.saveScenario') }}</button>
        </div>

        <div v-if="scenarios.length" class="impact-scenarios">
          <h5>{{ t('impact.panel.savedScenarios') }}</h5>
          <div v-for="s in scenarios" :key="s.id" class="scenario-row" @click="loadScenario(s)">
            <span>{{ s.name }}</span>
            <span v-if="!s.exposure_datasets" class="scenario-missing">{{ t('impact.panel.dataUnavailable') }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.impact-panel {
  width: 320px; max-width: 90vw; height: 100%; overflow-y: auto;
  background: rgba(15,17,23,.92); border-left: 1px solid rgba(255,255,255,.1);
  padding: 16px; color: #e2e8f0; font-size: .85rem;
}
.impact-empty { color: var(--color-text-muted, #94a3b8); text-align: center; padding: 40px 10px; }
.impact-event h4 { margin: 0 0 6px; font-size: 1rem; }
.impact-event-meta { display: flex; gap: 8px; font-size: .75rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 8px; }
.trend-sparkline { width: 100%; height: 30px; margin-bottom: 12px; }
.trend-sparkline polyline { fill: none; stroke-width: 2; }
.trend-up { stroke: #ef4444; }
.trend-down { stroke: #22c55e; }
.trend-stable { stroke: #94a3b8; }
.impact-field { display: flex; flex-direction: column; gap: 4px; font-size: .75rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 10px; }
.impact-field input, .impact-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem;
}
.btn-analyze {
  width: 100%; padding: 8px; background: rgba(77,163,255,.2); border: 1px solid rgba(77,163,255,.4);
  border-radius: 8px; color: #4da3ff; font-weight: 600; cursor: pointer; margin-bottom: 10px;
}
.btn-analyze:disabled { opacity: .5; cursor: not-allowed; }
.impact-notice { padding: 8px 10px; border-radius: 8px; background: rgba(255,255,255,.06); font-size: .78rem; margin-bottom: 10px; }
.impact-notice-error { background: rgba(239,68,68,.12); color: #ef4444; }
.impact-result { text-align: center; padding: 10px; background: rgba(34,197,94,.08); border-radius: 8px; margin-bottom: 10px; }
.impact-result-value { font-size: 1.6rem; font-weight: 800; color: #22c55e; }
.impact-result-label { font-size: .72rem; color: var(--color-text-muted, #94a3b8); }
.impact-completeness { font-size: .72rem; color: var(--color-text-muted, #94a3b8); margin-top: 6px; }
.impact-export-row { display: flex; gap: 6px; justify-content: center; margin-top: 8px; flex-wrap: wrap; }
.btn-export {
  padding: 4px 10px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; color: #e2e8f0; font-size: .72rem; cursor: pointer;
}
.impact-save { display: flex; gap: 6px; margin-bottom: 14px; }
.impact-save input { flex: 1; background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 6px 10px; color: #e2e8f0; font-size: .8rem; }
.btn-save { padding: 6px 12px; background: rgba(77,163,255,.2); border: 1px solid rgba(77,163,255,.4); border-radius: 8px; color: #4da3ff; font-size: .78rem; cursor: pointer; }
.impact-scenarios h5 { margin: 0 0 8px; font-size: .8rem; }
.scenario-row {
  display: flex; justify-content: space-between; padding: 6px 8px; border-radius: 6px;
  cursor: pointer; font-size: .78rem;
}
.scenario-row:hover { background: rgba(255,255,255,.06); }
.scenario-missing { color: #f97316; font-size: .7rem; }
.impact-critical, .impact-breakdown { margin-bottom: 14px; }
.impact-critical h5, .impact-breakdown h5 { margin: 0 0 8px; font-size: .8rem; }
.impact-critical-list, .impact-breakdown-list { list-style: none; padding: 0; margin: 0; font-size: .78rem; display: flex; flex-direction: column; gap: 6px; }
.impact-breakdown-list li { display: flex; justify-content: space-between; }
.impact-breakdown-toggle { display: flex; gap: 6px; margin-bottom: 8px; }
.impact-breakdown-toggle button {
  flex: 1; padding: 5px 8px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; color: #e2e8f0; font-size: .72rem; cursor: pointer;
}
.impact-breakdown-toggle button.active { background: rgba(77,163,255,.2); border-color: rgba(77,163,255,.4); color: #4da3ff; }

@media (max-width: 768px) {
  .impact-panel {
    width: 100%;
    max-width: none;
    height: 100%;
    border-left: none;
    padding: 14px 16px 18px;
  }

  .impact-empty {
    padding: 24px 10px;
  }
}
</style>
