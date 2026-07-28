<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { supabase } from '@/services/api/config.js'
import { defaultBufferRadiusKm } from '@/lib/hazardBuffer.js'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'
import { classifyTrend } from '@/lib/trendSparkline.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'
import { loadRegionBoundaries } from '@/data/boundaries/index.js'
import { findRegion } from '@/utils/pointInPolygon.js'
import CascadingRiskPanel from '@/components/risk/CascadingRiskPanel.vue'

const props = defineProps({
  selectedEvent: { type: Object, default: null },
  // MapView's currently-selected country (map polygon click) — used below
  // to scope the exposure-dataset dropdown to just that country instead of
  // listing every served country's datasets mixed together. Country-locked
  // admins (auth.countryCode) take priority over this when both are set,
  // since their own account scope is a stronger signal than whatever
  // happens to be focused on the map.
  countryCode: { type: String, default: null },
  // spec 050 US1: MapView owns the actual halo layer/opacity (it has the
  // map instance); this panel only hosts the slider control, v-model'd back
  // up via update:haloOpacity so the two stay in sync without duplicating
  // halo state here.
  haloOpacity: { type: Number, default: 0.6 },
})

const emit = defineEmits(['update:haloOpacity', 'update:haloRadiusKm'])

const { t } = useI18n()
const auth = useAuthStore()
const disaster = useDisasterStore()

const datasets = ref([])
const selectedDatasetId = ref(null)
const radiusOverride = ref(null)
// spec 050 follow-up: earthquake-only magnitude slider — the halo/analysis
// radius already comes from defaultBufferRadiusKm() (2^magnitude km for
// earthquakes), so dragging THIS should recompute the radius through that
// same formula automatically rather than requiring a manual km typed into
// radiusOverride. Mutually exclusive with radiusOverride (same "one
// control wins, not two silently fighting" lesson as the sidebar's
// duration-slider/calendar fix) — moving one clears the other.
const magnitudeOverride = ref(null)
const result = ref(null) // null | { total_value, feature_count } | 'error'
const analyzing = ref(false)
const scenarios = ref([])
const scenarioName = ref('')
const loadedScenario = ref(null)

// spec 034 (US1/US3/US4): critical infrastructure list, sector/boundary
// breakdown, and data-completeness score, all derived from the same
// dataset/point/radius as the main compute_zonal_stats analysis above.
const criticalInfrastructure = ref(null) // null | [] | array | 'error'
// live-testing finding: listing every single critical-infrastructure
// feature one row at a time (e.g. "Eğitim Kurumu — 1" repeated dozens of
// times for a large campus/city) is unreadable — grouped into a per-
// category count instead ("14 Eğitim Kurumu" etc.), matching how the user
// actually wants to read this ("14 okul, 22 hastane" style).
const criticalInfrastructureSummary = computed(() => {
  if (!Array.isArray(criticalInfrastructure.value)) return []
  const counts = new Map()
  for (const f of criticalInfrastructure.value) {
    counts.set(f.asset_category, (counts.get(f.asset_category) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
})
const breakdownType = ref('sector') // 'sector' | 'boundary'
const breakdown = ref(null) // null | [] | array | 'error'
const completeness = ref(null) // null | { ratio: number|null } | 'error'

const canAnalyze = computed(() => auth.isSuperAdmin || ['country_admin', 'org_admin'].includes(auth.session?.role))

// spec 049 US1: resolves the selected event's administrative boundary via
// this project's existing client-side point-in-polygon utilities (same
// ones used elsewhere for country/province tagging) rather than inventing
// new boundary-resolution logic — CascadingRiskPanel needs an
// admin_boundary_code, but map events only carry lat/lng.
const cascadeBoundaryCode = ref(null)
const cascadeBoundaryResolving = ref(false)
const cascadeBoundaryUnresolvable = ref(false)

async function resolveCascadeBoundary() {
  cascadeBoundaryCode.value = null
  cascadeBoundaryUnresolvable.value = false
  if (!props.selectedEvent) return
  // No country in focus at all (e.g. an event outside every served
  // country) is itself an "unresolvable area" outcome — must be shown
  // explicitly (FR-002), not silently omitted like the earlier version of
  // this function did (live-testing finding).
  if (!effectiveCountryCode.value) {
    cascadeBoundaryUnresolvable.value = true
    return
  }
  cascadeBoundaryResolving.value = true
  const boundary = await loadRegionBoundaries(effectiveCountryCode.value, 'province')
  if (boundary) {
    cascadeBoundaryCode.value = findRegion(
      props.selectedEvent.lat, props.selectedEvent.lng, boundary.featureCollection, boundary.nameProperty,
    )
  }
  cascadeBoundaryUnresolvable.value = !cascadeBoundaryCode.value
  cascadeBoundaryResolving.value = false
}

// Hazard types with a real, dedicated magnitude-based radius formula
// (src/lib/hazardBuffer.js's BUFFER_STRATEGIES) get a slider; anything else
// only has the generic severity-tier fallback, which isn't a single
// continuous number a slider could meaningfully drive.
const MAGNITUDE_SLIDER_CONFIG = {
  earthquake: { min: 4, max: 9.5, step: 0.1, decimals: 1 },
  // Wildfire's magnitude is FRP (MW) — real satellite-measured intensity,
  // heavily right-skewed (most fires are single-digit MW; the slider's
  // range covers the practical/common range, not rare extreme outliers —
  // the plain km override field below remains the escape hatch for those).
  wildfire: { min: 0, max: 500, step: 5, decimals: 0 },
}
const magnitudeSliderConfig = computed(() => MAGNITUDE_SLIDER_CONFIG[props.selectedEvent?.type] ?? null)

const effectiveRadiusKm = computed(() => {
  if (radiusOverride.value !== null && radiusOverride.value !== '') return Number(radiusOverride.value)
  if (magnitudeOverride.value !== null && magnitudeSliderConfig.value) {
    return defaultBufferRadiusKm({ ...props.selectedEvent, magnitude: magnitudeOverride.value })
  }
  return props.selectedEvent ? defaultBufferRadiusKm(props.selectedEvent) : null
})

function applyMagnitudeOverride(value) {
  magnitudeOverride.value = Number(value)
  radiusOverride.value = null // mutually exclusive — a magnitude change should drive the radius, not fight a manual km value
}

function clearMagnitudeOverride() {
  magnitudeOverride.value = null
}

// spec 050 US1 follow-up (live-testing finding, user-reported): the map's
// impact halo used to compute its own radius independently from the raw
// selected event, so typing a value into "Yarıçap geçersiz kılma" here had
// no effect on it — the halo and this panel's own analysis radius
// silently disagreed. Emitting effectiveRadiusKm up makes MapView's halo
// track whatever radius this panel is actually using (override or default),
// so the two can never drift apart.
watch(effectiveRadiusKm, (km) => emit('update:haloRadiusKm', km), { immediate: true })

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

// Auto-run summary (live-testing finding): the manual step1→step2→step3
// workflow below requires picking one dataset and clicking "Run Analysis"
// at a time, which is invisible/confusing for a user expecting to just
// select a hazard and immediately see what's affected (river/buildings/
// population) side by side. This runs compute_zonal_stats for every
// dataset scoped to the event's country in parallel, keyed by dataset id,
// as soon as an event is selected — no button, no per-layer clicking. The
// manual workflow further down is left intact for radius overrides,
// critical-infrastructure/breakdown drill-down, export, and saved
// scenarios, which still make sense as an explicit single-dataset action.
const autoSummary = ref({}) // datasetId -> { analyzing, result: null|{total_value,feature_count}|'error' }

// live-testing finding: running every served dataset (climate anomaly
// layers included) for every hazard type produced a long, mostly-irrelevant
// list (e.g. rainfall/vegetation anomaly rows for an earthquake) and multiplied
// the number of parallel compute_zonal_stats calls well past what's actually
// useful to a user checking "what did this hazard hit". Scopes the automatic
// summary to the exposure sources that are actually meaningful for a given
// hazard type; the full dataset list (including climate layers) remains
// available below via the manual per-dataset "Detailed Analysis" dropdown.
const HAZARD_RELEVANT_SOURCES = {
  earthquake: ['worldpop', 'osm-buildings', 'hydrorivers', 'dem_slope'],
  flood: ['hydrorivers', 'hydrobasins', 'worldpop', 'osm-buildings', 'glofas_river_discharge'],
  drought: ['chirps', 'gdo_soil_moisture_anomaly', 'gdo_fapar_anomaly', 'worldpop'],
  wildfire: ['gdo_fapar_anomaly', 'worldpop', 'osm-buildings'],
  cyclone: ['worldpop', 'osm-buildings', 'ghsl'],
  tsunami: ['worldpop', 'osm-buildings'],
  volcano: ['worldpop', 'osm-buildings'],
  epidemic: ['worldpop', 'kontur'],
  food_security: ['chirps', 'gdo_fapar_anomaly', 'worldpop'],
}
const DEFAULT_RELEVANT_SOURCES = ['worldpop', 'osm-buildings']

const relevantDatasets = computed(() => {
  const sources = HAZARD_RELEVANT_SOURCES[props.selectedEvent?.type] ?? DEFAULT_RELEVANT_SOURCES
  return filteredDatasets.value.filter((d) => sources.includes(d.source_name))
})

// Always this country's own critical-infrastructure (osm-buildings) dataset
// — never whatever the user happens to have picked in the manual step-1
// dropdown (see runAnalysis's comment on why that was wrong).
const criticalInfraDatasetId = computed(() => filteredDatasets.value.find((d) => d.source_name === 'osm-buildings')?.id ?? null)

async function runAutoSummary() {
  autoSummary.value = {}
  if (!props.selectedEvent) return
  const targets = relevantDatasets.value
  const { lat, lng } = props.selectedEvent
  const radius = effectiveRadiusKm.value
  autoSummary.value = Object.fromEntries(targets.map((d) => [d.id, { analyzing: true, result: null }]))
  await Promise.all(targets.map(async (d) => {
    const { data, error } = await supabase.rpc('compute_zonal_stats', {
      dataset_id: d.id,
      center_lat: lat,
      center_lng: lng,
      radius_km: radius,
    })
    autoSummary.value[d.id] = {
      analyzing: false,
      result: error ? 'error' : (data?.[0] ?? { total_value: 0, feature_count: 0 }),
    }
  }))
}

// Scopes the "Etkilenme veri seti" dropdown to the relevant country instead
// of listing every served country's datasets mixed together (e.g. a
// Malatya/Turkey earthquake showing Malaysia/Madagascar population layers
// right alongside Turkey's) — falls back to every dataset if neither the
// account nor the map has a country in focus, so this never hides options
// a superadmin browsing with no country selected still needs.
const effectiveCountryCode = computed(() => auth.countryCode || props.countryCode || null)
const filteredDatasets = computed(() => {
  if (!effectiveCountryCode.value) return datasets.value
  return datasets.value.filter((d) => !d.country_code || d.country_code === effectiveCountryCode.value)
})

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
  // live-testing finding: this used to reuse rpcParams.dataset_id (whatever
  // the user picked in step 1) for the critical-infrastructure lookup too —
  // so analyzing e.g. the river or population layer always came back
  // "no critical infrastructure" even when real critical facilities existed
  // nearby (visible on the map / in the auto-summary above), simply because
  // that OTHER dataset's features never carry an asset_category. Critical
  // infrastructure is always resolved from this country's own
  // 'osm-buildings' dataset instead, independent of the step-1 selection.
  if (criticalInfraDatasetId.value) {
    loadCriticalInfrastructure({ ...rpcParams, dataset_id: criticalInfraDatasetId.value })
  } else {
    criticalInfrastructure.value = []
  }
  await Promise.all([
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
  magnitudeOverride.value = null
  loadedScenario.value = null
  criticalInfrastructure.value = null
  breakdown.value = null
  completeness.value = null
  resolveCascadeBoundary()
  runAutoSummary()
})

onMounted(async () => {
  await loadDatasets()
  loadScenarios()
  resolveCascadeBoundary()
  runAutoSummary()
})
</script>

<template>
  <div class="impact-panel">
    <div v-if="!selectedEvent" class="impact-empty">{{ t('impact.panel.selectPrompt') }}</div>

    <template v-else>
      <div class="impact-event">
        <div class="impact-event-main">
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
        <!-- spec 050 US1: vertical intensity control for the map's impact
             halo — deliberately vertical (drag up = more intense, down =
             fade out/hidden), unlike this app's other, horizontal
             layer-opacity sliders. -->
        <div class="impact-halo-control" :title="t('impact.panel.haloIntensityHint')">
          <span class="impact-halo-value">{{ Math.round(haloOpacity * 100) }}%</span>
          <input
            type="range"
            class="impact-halo-slider"
            min="0" max="1" step="0.05"
            :value="haloOpacity"
            :aria-label="t('impact.panel.haloIntensity')"
            @input="emit('update:haloOpacity', Number($event.target.value))"
          />
          <span class="impact-halo-label">{{ t('impact.panel.haloIntensity') }}</span>
        </div>
      </div>

      <!-- ── Cascading Risks (spec 049 — map integration of spec 048) ─────── -->
      <div v-if="canAnalyze" class="impact-cascade-section">
        <h4>{{ t('risk.cascade.title') }}</h4>
        <p v-if="cascadeBoundaryResolving" class="risk-meta">{{ t('impact.loading') }}</p>
        <p v-else-if="cascadeBoundaryUnresolvable" class="impact-notice">{{ t('risk.cascade.boundaryUnresolvable') }}</p>
        <CascadingRiskPanel
          v-else-if="cascadeBoundaryCode"
          :key="`${selectedEvent.id}-${cascadeBoundaryCode}`"
          :country-code="effectiveCountryCode"
          :admin-boundary-code="cascadeBoundaryCode"
          :hazard-type="selectedEvent.type"
          source-type="real_event"
          :source-event-ref="{ table: selectedEvent.type, id: selectedEvent.id }"
          :initial-lat="selectedEvent.lat"
          :initial-lng="selectedEvent.lng"
          :initial-magnitude="selectedEvent.magnitude"
        />
      </div>

      <div v-if="canAnalyze" class="impact-auto-summary">
        <h4>{{ t('impact.panel.autoSummaryTitle') }}</h4>
        <div v-if="!relevantDatasets.length" class="impact-notice">{{ t('impact.panel.autoSummaryEmpty') }}</div>
        <ul v-else class="impact-auto-summary-list">
          <li v-for="d in relevantDatasets" :key="d.id">
            <span class="impact-auto-summary-label">{{ friendlyDatasetLabel(t, d) }}</span>
            <span v-if="!autoSummary[d.id] || autoSummary[d.id].analyzing" class="impact-auto-summary-value impact-auto-summary-loading">{{ t('impact.panel.analyzing') }}</span>
            <span v-else-if="autoSummary[d.id].result === 'error'" class="impact-auto-summary-value impact-auto-summary-error">{{ t('impact.panel.error') }}</span>
            <span v-else-if="autoSummary[d.id].result.feature_count === 0" class="impact-auto-summary-value impact-auto-summary-muted">{{ t('impact.panel.noOverlap') }}</span>
            <span v-else class="impact-auto-summary-value">
              {{ Number(autoSummary[d.id].result.total_value ?? 0).toLocaleString() }} · {{ t('impact.panel.featuresCount', { count: Number(autoSummary[d.id].result.feature_count ?? 0).toLocaleString() }) }}
            </span>
          </li>
        </ul>
      </div>

      <div v-if="canAnalyze" class="impact-workflow">
        <label class="impact-field">
          <span>{{ t('impact.panel.detailedTitle') }} — {{ t('impact.panel.step1') }}: {{ t('impact.panel.datasetLabel') }}</span>
          <select v-model="selectedDatasetId">
            <option :value="null">—</option>
            <option v-for="d in filteredDatasets" :key="d.id" :value="d.id">{{ friendlyDatasetLabel(t, d) }}</option>
          </select>
        </label>
        <label v-if="magnitudeSliderConfig" class="impact-field">
          <span>{{ t('impact.panel.magnitudeOverride') }}: <strong>{{ (magnitudeOverride ?? selectedEvent.magnitude ?? 0).toFixed(magnitudeSliderConfig.decimals) }}</strong> → {{ t('impact.panel.defaultRadius', { km: Math.round(effectiveRadiusKm ?? 0) }) }}</span>
          <input
            type="range" :min="magnitudeSliderConfig.min" :max="magnitudeSliderConfig.max" :step="magnitudeSliderConfig.step"
            :value="magnitudeOverride ?? selectedEvent.magnitude ?? magnitudeSliderConfig.min"
            @input="applyMagnitudeOverride($event.target.value)"
          />
          <button v-if="magnitudeOverride !== null" type="button" class="impact-magnitude-reset" @click="clearMagnitudeOverride">{{ t('impact.panel.magnitudeReset') }}</button>
        </label>
        <label class="impact-field">
          <span>{{ t('impact.panel.radiusOverride') }} ({{ t('impact.panel.defaultRadius', { km: defaultBufferRadiusKm(selectedEvent) }) }})</span>
          <input type="number" v-model="radiusOverride" :placeholder="String(defaultBufferRadiusKm(selectedEvent))" @input="magnitudeOverride = null" />
        </label>
        <button class="btn-analyze" :disabled="!selectedDatasetId || analyzing" @click="runAnalysis">
          {{ analyzing ? t('impact.panel.analyzing') : t('impact.panel.runAnalysis') }}
        </button>

        <div v-if="result === 'error'" class="impact-notice impact-notice-error">{{ t('impact.panel.error') }}</div>
        <div v-else-if="result && result.feature_count === 0" class="impact-notice">{{ t('impact.panel.noOverlap') }}</div>
        <div v-else-if="result" class="impact-result">
          <div class="impact-result-value">{{ Number(result.total_value ?? 0).toLocaleString() }}</div>
          <div class="impact-result-label">{{ t('impact.panel.featuresCount', { count: Number(result.feature_count ?? 0).toLocaleString() }) }}</div>
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
            <li v-for="[category, count] in criticalInfrastructureSummary" :key="category">
              <span>{{ t('assetCategory.' + category, category) }}</span>
              <span class="impact-critical-count">{{ count.toLocaleString() }}</span>
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
              <span>{{ Number(g.total_value ?? 0).toLocaleString() }} ({{ Number(g.feature_count ?? 0).toLocaleString() }})</span>
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
.impact-event { display: flex; gap: 14px; align-items: flex-start; }
.impact-event-main { flex: 1; min-width: 0; }
.impact-halo-control {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  flex-shrink: 0; padding-top: 2px;
}
.impact-halo-value { font-size: .68rem; color: #ef4444; font-weight: 600; }
.impact-halo-label { font-size: .6rem; color: var(--color-text-muted, #94a3b8); text-align: center; max-width: 48px; line-height: 1.2; }
.impact-halo-slider {
  writing-mode: vertical-lr; direction: rtl;
  width: 6px; height: 90px; accent-color: #ef4444; cursor: pointer;
}
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
.impact-field input[type="range"] { background: none; border: none; padding: 0; accent-color: #ef4444; }
.impact-magnitude-reset {
  align-self: flex-start; background: none; border: none; padding: 0; margin-top: 2px;
  color: #4da3ff; font-size: .7rem; cursor: pointer; text-decoration: underline;
}
.btn-analyze {
  width: 100%; padding: 8px; background: rgba(77,163,255,.2); border: 1px solid rgba(77,163,255,.4);
  border-radius: 8px; color: #4da3ff; font-weight: 600; cursor: pointer; margin-bottom: 10px;
}
.btn-analyze:disabled { opacity: .5; cursor: not-allowed; }
.impact-cascade-section { margin-bottom: 14px; }
.impact-auto-summary { margin-bottom: 14px; }
.impact-auto-summary h4 { margin: 0 0 8px; font-size: .85rem; }
.impact-auto-summary-list { list-style: none; padding: 0; margin: 0; font-size: .78rem; display: flex; flex-direction: column; gap: 6px; }
.impact-auto-summary-list li {
  display: flex; justify-content: space-between; gap: 8px; padding: 6px 8px;
  background: rgba(255,255,255,.04); border-radius: 6px;
}
.impact-auto-summary-label { color: #e2e8f0; }
.impact-auto-summary-value { color: #22c55e; font-weight: 600; text-align: right; }
.impact-auto-summary-loading { color: var(--color-text-muted, #94a3b8); font-weight: 400; }
.impact-auto-summary-muted { color: var(--color-text-muted, #94a3b8); font-weight: 400; }
.impact-auto-summary-error { color: #ef4444; }
.impact-cascade-section h4 { margin: 0 0 8px; font-size: .85rem; }
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
.impact-critical-list li { display: flex; justify-content: space-between; }
.impact-critical-count { color: #22c55e; font-weight: 600; }
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
