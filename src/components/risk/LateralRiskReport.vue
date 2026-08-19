<script setup>
// Spec 071 (US2) — the "tek sayfalık öngörü raporu" opened from the header's
// critical-lateral-risk trigger (AppHeader.vue). Self-contained: recomputes
// its own secondary-risk findings from the same pure utilities MapView.vue's
// Impact Analysis dock uses (evaluateLateralRisks/accessRiskFinding/
// windSpreadAsFinding/computeTsunamiRiskFinding, spec 070's
// computeSpreadProjection) rather than being fed MapView's local state —
// MapView and AppHeader are siblings under the shell layout with no direct
// parent-child prop path, and re-deriving from the same DisasterEvent +
// already-loaded stores is simpler than threading new props through the
// shell (Constitution VIII: smallest change, reuse existing pure
// functions — not existing component instances).
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { supabase } from '@/services/api/config.js'
import { useExposureLayersStore } from '@/stores/exposureLayers.js'
import { loadRegionBoundaries } from '@/data/boundaries/index.js'
import { resolveEventCountryCode, resolveEventRegionName } from '@/utils/eventRegionLookup.js'
import { fetchLatestFlowSnapshot } from '@/utils/windLayerData.js'
import { windDirectionAtPoint } from '@/utils/windDirectionAtPoint.js'
import { computeSpreadProjection, WIND_AFFECTED_HAZARD_TYPES } from '@/utils/windSpreadPrediction.js'
import {
  evaluateLateralRisks,
  accessRiskFinding,
  windSpreadAsFinding,
  coastalDistanceKm,
  computeTsunamiRiskFinding,
  DEFAULT_HEX_RINGS,
  DEFAULT_WITHIN_HOURS,
  gridDisk,
} from '@/utils/lateralRiskRules.js'
import { institutionCategoriesForFindings } from '@/utils/institutionCategoryMap.js'

const props = defineProps({
  sourceEvent: { type: Object, default: null },
})
const emit = defineEmits(['close'])

const { t } = useI18n()
const authStore = useAuthStore()
const disasterStore = useDisasterStore()
const exposureLayersStore = useExposureLayersStore()

const loading = ref(true)
const findings = ref([])
const affectedRegions = ref([]) // string[]
const affectedFacilities = ref([]) // [] | 'error'
const affectedPopulation = ref(null) // number | null
const generatedAt = ref(null)

function nearbyEventsLookup(sourceEvent) {
  const candidateHexIds = new Set(gridDisk(sourceEvent.h3_id, DEFAULT_HEX_RINGS))
  const cutoffMs = Date.now() - DEFAULT_WITHIN_HOURS * 60 * 60 * 1000
  return (hazardType, subtype) => {
    return disasterStore.allEvents.filter((e) => {
      if (e.id === sourceEvent.id) return false
      if (!e.h3_id || !candidateHexIds.has(e.h3_id)) return false
      if (subtype ? e.type !== 'disaster' || e.subtype !== subtype : e.type !== hazardType) return false
      if (!e.time) return true
      return new Date(e.time).getTime() >= cutoffMs
    })
  }
}

const ACCESS_RISK_RADIUS_KM = 5
const ACCESS_RISK_LOW_ROAD_COUNT = 2

// 2026-08-19 bugfix: exposure datasets are per-country (a separate 'osm'/
// 'osm-buildings' row per served country, e.g. tr and mg both exist) —
// picking the FIRST match via .find() silently queried whatever country
// happened to be first in the array, which almost always isn't the
// selected event's own country, so compute_zonal_stats correctly found
// zero features near a point in a totally different country ("kritik
// binalar hep sıfır" — user-reported). Querying every matching-source
// dataset and summing sidesteps needing to resolve the event's country at
// all: only the actually-matching country's dataset ever returns a
// non-zero count, the rest harmlessly return 0.
async function sumZonalFeatureCount(sourceName, event, radiusKm) {
  const matches = exposureLayersStore.datasets.filter((d) => d.source_name === sourceName)
  if (!matches.length) return 0
  const results = await Promise.all(
    matches.map((d) => supabase.rpc('compute_zonal_stats', { dataset_id: d.id, center_lat: event.lat, center_lng: event.lng, radius_km: radiusKm })),
  )
  return results.reduce((sum, r) => sum + (r.data?.[0]?.feature_count ?? 0), 0)
}

async function detectAccessRisk(event) {
  const hasRoadDataset = exposureLayersStore.datasets.some((d) => d.source_name === 'osm')
  const hasInfraDataset = exposureLayersStore.datasets.some((d) => d.source_name === 'osm-buildings')
  if (!hasRoadDataset || !hasInfraDataset) return false
  const [roadCount, infraCount] = await Promise.all([
    sumZonalFeatureCount('osm', event, ACCESS_RISK_RADIUS_KM),
    sumZonalFeatureCount('osm-buildings', event, ACCESS_RISK_RADIUS_KM),
  ])
  return infraCount > 0 && roadCount <= ACCESS_RISK_LOW_ROAD_COUNT
}

async function loadAffectedRegions(event) {
  const name = await resolveEventRegionName(event, authStore, exposureLayersStore)
  return name ? [name] : []
}

async function loadAffectedFacilities(event) {
  // Same per-country-dataset fix as sumZonalFeatureCount above — query
  // every 'osm-buildings' dataset (one per served country), not just the
  // first one in the array, and concatenate whatever comes back.
  const infraDatasets = exposureLayersStore.datasets.filter((d) => d.source_name === 'osm-buildings')
  if (!infraDatasets.length) return []
  const results = await Promise.all(
    infraDatasets.map((d) =>
      supabase.rpc('get_critical_infrastructure_features', { dataset_id: d.id, center_lat: event.lat, center_lng: event.lng, radius_km: ACCESS_RISK_RADIUS_KM }),
    ),
  )
  if (results.every((r) => r.error)) return 'error'
  return results.flatMap((r) => r.data ?? [])
}

// 2026-08-19 ask: "etkilenen nüfus... o tarz şeylere gitti mi" — affected
// population wasn't in the report yet. Reuses the SAME compute_zonal_stats
// RPC and the app's existing population-source priority (worldpop is the
// dataset ImpactPanel.vue's own default relevant-sources list leads with
// for most hazard types — see HAZARD_RELEVANT_SOURCES there), summed
// across every matching-country dataset like the facilities/access-risk
// counts above.
const POPULATION_SOURCE_PRIORITY = ['worldpop', 'kontur', 'ghsl', 'meta_hdx']
async function loadAffectedPopulation(event) {
  const sourceName = POPULATION_SOURCE_PRIORITY.find((src) => exposureLayersStore.datasets.some((d) => d.source_name === src))
  if (!sourceName) return null
  const count = await sumZonalPopulationTotal(sourceName, event, ACCESS_RISK_RADIUS_KM)
  return count
}
async function sumZonalPopulationTotal(sourceName, event, radiusKm) {
  const matches = exposureLayersStore.datasets.filter((d) => d.source_name === sourceName)
  const results = await Promise.all(
    matches.map((d) => supabase.rpc('compute_zonal_stats', { dataset_id: d.id, center_lat: event.lat, center_lng: event.lng, radius_km: radiusKm })),
  )
  return results.reduce((sum, r) => sum + (r.data?.[0]?.total_value ?? 0), 0)
}

async function loadTsunamiFinding(event) {
  if (event.type !== 'earthquake') return null
  // Same country-resolution fix as loadAffectedRegions above (was
  // authStore.countryCode-only, always null for a super_admin).
  const countryCode = await resolveEventCountryCode(event, authStore, exposureLayersStore)
  if (!countryCode) return null
  const boundary = await loadRegionBoundaries(countryCode, 'province')
  if (!boundary) return null
  const distanceKm = coastalDistanceKm(event.lat, event.lng, boundary.featureCollection)
  return computeTsunamiRiskFinding(event, distanceKm)
}

async function loadWindSpreadFinding(event) {
  if (!WIND_AFFECTED_HAZARD_TYPES.has(event.type)) return null
  const snapshot = await fetchLatestFlowSnapshot('wind', 'sfc')
  if (!snapshot) return null
  const windCondition = await windDirectionAtPoint(event.lat, event.lng, snapshot)
  const projection = computeSpreadProjection(event, windCondition)
  return windSpreadAsFinding(projection)
}

async function generateReport() {
  const event = props.sourceEvent
  loading.value = true
  findings.value = []
  affectedRegions.value = []
  affectedFacilities.value = []
  affectedPopulation.value = null
  generatedAt.value = new Date().toISOString()

  if (!event?.h3_id) {
    loading.value = false
    return
  }

  // 2026-08-19 bugfix: none of these 7 lookups were wrapped in a
  // try/finally — a single rejected promise anywhere in the Promise.all
  // (a Supabase RPC hiccup, a boundary fetch failure, etc.) rejected the
  // whole thing and `loading.value = false` below never ran, leaving the
  // report stuck on "Rapor hazırlanıyor…" forever with no error shown.
  // Each lookup gets its own .catch() so one failure degrades that ONE
  // section to its own empty state (FR-003 spirit — never fabricate, but
  // also never silently hang) instead of blanking the whole report.
  try {
    const [ruleFindings, accessRisk, regions, facilities, population, windFinding, tsunamiFinding] = await Promise.all([
      Promise.resolve(evaluateLateralRisks(event, nearbyEventsLookup(event))),
      detectAccessRisk(event).catch((err) => { console.warn('[LateralRiskReport] detectAccessRisk failed', err); return false }),
      loadAffectedRegions(event).catch((err) => { console.warn('[LateralRiskReport] loadAffectedRegions failed', err); return [] }),
      loadAffectedFacilities(event).catch((err) => { console.warn('[LateralRiskReport] loadAffectedFacilities failed', err); return [] }),
      loadAffectedPopulation(event).catch((err) => { console.warn('[LateralRiskReport] loadAffectedPopulation failed', err); return null }),
      loadWindSpreadFinding(event).catch((err) => { console.warn('[LateralRiskReport] loadWindSpreadFinding failed', err); return null }),
      loadTsunamiFinding(event).catch((err) => { console.warn('[LateralRiskReport] loadTsunamiFinding failed', err); return null }),
    ])

    const all = [...ruleFindings]
    const access = accessRiskFinding(accessRisk)
    if (access) all.push(access)
    if (windFinding) all.push(windFinding)
    if (tsunamiFinding) all.push(tsunamiFinding)

    findings.value = all
    affectedRegions.value = regions
    affectedFacilities.value = facilities
    affectedPopulation.value = population
  } finally {
    loading.value = false
  }
}

onMounted(generateReport)
watch(() => props.sourceEvent?.id, generateReport)

const institutionCategories = computed(() => institutionCategoriesForFindings(findings.value))
const facilityCount = computed(() => (Array.isArray(affectedFacilities.value) ? affectedFacilities.value.length : 0))

// 2026-08-19 ask: three colorful, iconed "stat cards" instead of the
// original thin/flat bars — same three numbers (findings/regions/
// facilities), no data removed, just a more scannable/engaging
// presentation. Plain CSS (gradient + a subtle hover lift), no new
// charting-library dependency (Constitution VIII).
const summaryStats = computed(() => [
  { key: 'findings', label: t('lateralRisk.report.summaryFindings'), value: findings.value.length, icon: '⚠️', accent: 'amber' },
  { key: 'regions', label: t('lateralRisk.report.summaryRegions'), value: affectedRegions.value.length, icon: '📍', accent: 'sky' },
  { key: 'facilities', label: t('lateralRisk.report.summaryFacilities'), value: facilityCount.value, icon: '🏥', accent: 'violet' },
  { key: 'population', label: t('lateralRisk.report.summaryPopulation'), value: affectedPopulation.value == null ? '—' : Math.round(affectedPopulation.value).toLocaleString(), icon: '👥', accent: 'rose' },
])

// 2026-08-19 ask: "kaç tane okul kaç tane [hastane]" — a per-category count
// is far more scannable than a flat list of facility names. Reuses the
// SAME assetCategory.* i18n keys MapView.vue's own critical-infra filter
// chips already use, so the label wording stays consistent app-wide.
const facilityCategoryCounts = computed(() => {
  if (!Array.isArray(affectedFacilities.value)) return []
  const counts = new Map()
  for (const f of affectedFacilities.value) {
    const category = f.asset_category ?? 'unknown'
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, label: t('assetCategory.' + category, category) }))
    .sort((a, b) => b.count - a.count)
})

function formatGeneratedAt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <Teleport to="body">
    <div class="lateral-report-overlay" @click.self="emit('close')">
      <div class="lateral-report-card">
        <div class="lateral-report-header">
          <h3>{{ t('lateralRisk.report.title') }}</h3>
          <button type="button" class="lateral-report-close" :aria-label="t('app.close')" @click="emit('close')">✕</button>
        </div>

        <div class="lateral-report-body">
          <!-- FR-010 — always present, always the first thing shown. -->
          <p class="lateral-report-disclaimer">{{ t('lateralRisk.report.disclaimer') }}</p>

          <p v-if="sourceEvent" class="lateral-report-source">
            {{ sourceEvent.title || sourceEvent.type }} — {{ formatGeneratedAt(generatedAt) }}
          </p>

          <p v-if="loading" class="lateral-report-loading">{{ t('lateralRisk.report.loading') }}</p>

          <template v-else>
            <div class="lateral-report-stat-cards">
              <div v-for="stat in summaryStats" :key="stat.key" class="lateral-report-stat-card" :class="`lateral-report-stat-card--${stat.accent}`">
                <span class="lateral-report-stat-icon">{{ stat.icon }}</span>
                <span class="lateral-report-stat-value">{{ stat.value }}</span>
                <span class="lateral-report-stat-label">{{ stat.label }}</span>
              </div>
            </div>

            <section class="lateral-report-section">
              <h4>{{ t('lateralRisk.report.sectionRegions') }}</h4>
              <ul v-if="affectedRegions.length" class="lateral-report-list">
                <li v-for="region in affectedRegions" :key="region">{{ region }}</li>
              </ul>
              <p v-else class="lateral-report-empty">{{ t('lateralRisk.report.noRegions') }}</p>
            </section>

            <section class="lateral-report-section">
              <h4>{{ t('lateralRisk.report.sectionFacilities') }}</h4>
              <div v-if="facilityCategoryCounts.length" class="lateral-report-facility-chips">
                <span v-for="fc in facilityCategoryCounts" :key="fc.category" class="lateral-report-facility-chip">
                  <span class="lateral-report-facility-chip-count">{{ fc.count }}</span>
                  {{ fc.label }}
                </span>
              </div>
              <p v-else class="lateral-report-empty">{{ t('lateralRisk.report.noFacilities') }}</p>
            </section>

            <section class="lateral-report-section">
              <h4>{{ t('lateralRisk.report.sectionFindings') }}</h4>
              <ul v-if="findings.length" class="lateral-report-findings-list">
                <li v-for="finding in findings" :key="finding.ruleId">
                  <span class="lateral-report-finding-title">{{ t(`lateralRisk.finding.${finding.riskId}.title`) }}</span>
                  <span class="lateral-report-finding-desc">{{ t(`lateralRisk.finding.${finding.riskId}.description`, finding.data ?? {}) }}</span>
                </li>
              </ul>
              <p v-else class="lateral-report-empty">{{ t('lateralRisk.noFindings') }}</p>
            </section>

            <section class="lateral-report-section">
              <h4>{{ t('lateralRisk.report.sectionInstitutions') }}</h4>
              <div v-if="institutionCategories.length" class="lateral-report-institution-chips">
                <span v-for="c in institutionCategories" :key="c.id" class="lateral-report-institution-chip">
                  {{ t(c.labelKey) }}
                </span>
              </div>
              <p v-else class="lateral-report-empty">{{ t('lateralRisk.report.noInstitutions') }}</p>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Same overlay/card modal convention as QuickPageDialog.vue/ConfirmDialog.vue. */
.lateral-report-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}
.lateral-report-card {
  background: #161b26;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  width: min(720px, 92vw);
  max-height: 86dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.lateral-report-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}
.lateral-report-header h3 { margin: 0; font-size: 1rem; color: #e2e8f0; }
.lateral-report-close {
  border: none;
  background: transparent;
  color: #e2e8f0;
  font-size: 1rem;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.lateral-report-close:hover { background: rgba(255, 255, 255, 0.1); }
.lateral-report-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 20px;
}
.lateral-report-disclaimer {
  margin: 0 0 12px;
  padding: 8px 10px;
  font-size: 0.75rem;
  font-weight: 600;
  color: #fca5a5;
  background: rgba(220, 38, 38, 0.12);
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-radius: 6px;
}
.lateral-report-source {
  margin: 0 0 16px;
  font-size: 0.8rem;
  color: #94a3b8;
}
.lateral-report-loading {
  font-size: 0.85rem;
  color: #94a3b8;
}
/* 2026-08-19 redesign — three colorful stat cards instead of thin flat
   bars, same three numbers, more scannable at a glance and a bit more
   "alive" (subtle hover lift) without turning into a distraction. */
.lateral-report-stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}
.lateral-report-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 14px 8px;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.lateral-report-stat-card:hover {
  transform: translateY(-2px);
}
.lateral-report-stat-card--amber {
  background: linear-gradient(160deg, rgba(245, 158, 11, 0.22), rgba(245, 158, 11, 0.06));
  border-color: rgba(245, 158, 11, 0.35);
}
.lateral-report-stat-card--amber:hover { box-shadow: 0 6px 16px rgba(245, 158, 11, 0.18); }
.lateral-report-stat-card--sky {
  background: linear-gradient(160deg, rgba(56, 189, 248, 0.22), rgba(56, 189, 248, 0.06));
  border-color: rgba(56, 189, 248, 0.35);
}
.lateral-report-stat-card--sky:hover { box-shadow: 0 6px 16px rgba(56, 189, 248, 0.18); }
.lateral-report-stat-card--violet {
  background: linear-gradient(160deg, rgba(167, 139, 250, 0.22), rgba(167, 139, 250, 0.06));
  border-color: rgba(167, 139, 250, 0.35);
}
.lateral-report-stat-card--violet:hover { box-shadow: 0 6px 16px rgba(167, 139, 250, 0.18); }
.lateral-report-stat-card--rose {
  background: linear-gradient(160deg, rgba(251, 113, 133, 0.22), rgba(251, 113, 133, 0.06));
  border-color: rgba(251, 113, 133, 0.35);
}
.lateral-report-stat-card--rose:hover { box-shadow: 0 6px 16px rgba(251, 113, 133, 0.18); }
.lateral-report-stat-icon {
  font-size: 1.1rem;
  line-height: 1;
}
.lateral-report-stat-value {
  font-size: 1.25rem;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.2;
  white-space: nowrap;
}
.lateral-report-stat-label {
  font-size: 0.68rem;
  color: #cbd5e1;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.lateral-report-section {
  margin-bottom: 16px;
}
.lateral-report-section h4 {
  margin: 0 0 6px;
  font-size: 0.8rem;
  color: #e2e8f0;
}
.lateral-report-list {
  margin: 0;
  padding-left: 18px;
  font-size: 0.78rem;
  color: #cbd5e1;
}
.lateral-report-empty {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}
.lateral-report-findings-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.lateral-report-finding-title {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #fbbf24;
}
.lateral-report-finding-desc {
  display: block;
  font-size: 0.75rem;
  color: #cbd5e1;
}
.lateral-report-institution-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.lateral-report-institution-chip {
  padding: 3px 8px;
  font-size: 0.72rem;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.15);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #e2e8f0;
}
.lateral-report-facility-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.lateral-report-facility-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 4px;
  font-size: 0.75rem;
  border-radius: 12px;
  background: rgba(167, 139, 250, 0.12);
  border: 1px solid rgba(167, 139, 250, 0.3);
  color: #e2e8f0;
}
.lateral-report-facility-chip-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 4px;
  border-radius: 10px;
  background: #a78bfa;
  color: #1e1b3a;
  font-weight: 700;
  font-size: 0.7rem;
}
</style>
