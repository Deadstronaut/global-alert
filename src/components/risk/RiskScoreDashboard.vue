<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase, EDGE_FUNCTIONS } from '@/services/api/config.js'
import CascadingRiskPanel from '@/components/risk/CascadingRiskPanel.vue'

const { t } = useI18n()
const auth = useAuthStore()

// super_admin's own profile has no country_code (not scoped to one
// country) — country_admin/org_admin do, so default from the session but
// let a super_admin type one in; without this, p_country_code was going
// into compute_risk_area_score as null, violating risk_area_scores'
// NOT NULL country_code constraint (live-testing finding).
const countryCode = ref(auth.session?.countryCode ?? '')
const adminBoundaryCode = ref('')
const hazardType = ref('earthquake')
const score = ref(null)
const scoring = ref(false)
const scoreError = ref(null)

const curve = ref(null)
const curveLoading = ref(false)
const curveError = ref(null)

// Country-level INFORM (or similar) reference score — a directly-entered
// annual figure (country_risk_indices, see CountryRiskIndexPanel.vue), not
// this dashboard's own sub-national/hazard-specific computation. Shown
// alongside, never merged into, compute_risk_area_score's result: INFORM's
// own index has no sub-national/per-hazard breakdown to blend in — it's a
// single country-wide benchmark a user can compare their computed score
// against, not a replacement input.
const informReference = ref(null)
const informLoading = ref(false)

function fmt(value) {
  return value === null || value === undefined ? '—' : value.toFixed ? value.toFixed(1) : value
}

async function fetchInformReference(countryCode) {
  informReference.value = null
  if (!countryCode) return
  informLoading.value = true
  // country_risk_indices stores country_code uppercase (see
  // CountryRiskIndexPanel.vue's toPayload()), unlike most of this codebase's
  // lowercase convention — matched here, not "fixed", to avoid touching an
  // already-shipped table's existing rows.
  const { data } = await supabase
    .from('country_risk_indices')
    .select('*')
    .eq('country_code', countryCode.toUpperCase())
    .order('year', { ascending: false })
    .limit(1)
    .maybeSingle()
  informReference.value = data ?? null
  informLoading.value = false
}

// FR-007: a missing factor MUST be shown as explicitly unavailable, never
// silently treated as zero (US2 acceptance scenario 2).
function factorLabel(missingFactors, key, value) {
  if (missingFactors?.includes(key)) return t('risk.dashboard.notAvailable')
  return value?.toFixed ? value.toFixed(1) : value
}

async function computeScore() {
  if (!countryCode.value || !adminBoundaryCode.value || !hazardType.value) return
  scoring.value = true
  scoreError.value = null
  const [rpcResult] = await Promise.all([
    supabase.rpc('compute_risk_area_score', {
      p_country_code: countryCode.value.toLowerCase(),
      p_admin_boundary_code: adminBoundaryCode.value,
      p_hazard_type: hazardType.value,
    }),
    fetchInformReference(countryCode.value),
  ])
  const { data, error } = rpcResult
  if (error) {
    scoreError.value = error.message
  } else {
    score.value = data
  }
  scoring.value = false
}

async function loadExceedanceCurve() {
  if (!countryCode.value || !adminBoundaryCode.value || !hazardType.value) return
  curveLoading.value = true
  curveError.value = null
  curve.value = null
  const { data: sessionData } = await supabase.auth.getSession()
  const response = await fetch(EDGE_FUNCTIONS.COMPUTE_RISK_EXCEEDANCE_CURVE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionData?.session?.access_token ?? ''}`,
    },
    body: JSON.stringify({
      countryCode: countryCode.value.toLowerCase(),
      adminBoundaryCode: adminBoundaryCode.value,
      hazardType: hazardType.value,
    }),
  })
  const result = await response.json()
  if (result.error === 'insufficient_historical_data') {
    curveError.value = t('risk.dashboard.insufficientData', {
      count: result.historical_record_count,
      minimum: result.minimum_required,
    })
  } else if (result.error) {
    curveError.value = result.error
  } else {
    curve.value = result
  }
  curveLoading.value = false
}
</script>

<template>
  <div class="risk-dashboard">
    <div class="risk-controls">
      <label class="risk-field">
        <span>{{ t('risk.dashboard.countryCode') }}</span>
        <input v-model="countryCode" :placeholder="t('risk.dashboard.countryCodePlaceholder')" maxlength="2" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.dashboard.adminBoundaryCode') }}</span>
        <input v-model="adminBoundaryCode" :placeholder="t('risk.dashboard.adminBoundaryPlaceholder')" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.dashboard.hazardType') }}</span>
        <input v-model="hazardType" :placeholder="t('risk.dashboard.hazardTypePlaceholder')" />
      </label>
      <button class="btn-compute" :disabled="scoring" @click="computeScore">
        {{ scoring ? t('risk.dashboard.computing') : t('risk.dashboard.computeScore') }}
      </button>
    </div>

    <p v-if="scoreError" class="risk-error">{{ scoreError }}</p>

    <div v-if="score" class="risk-score-panel">
      <div class="risk-factor">
        <span class="risk-factor-label">{{ t('risk.dashboard.hazard') }}</span>
        <span class="risk-factor-value">{{ factorLabel(score.missing_factors, 'hazard', score.hazard_score) }}</span>
      </div>
      <div class="risk-factor">
        <span class="risk-factor-label">{{ t('risk.dashboard.exposure') }}</span>
        <span class="risk-factor-value">{{ factorLabel(score.missing_factors, 'exposure', score.exposure_score) }}</span>
      </div>
      <div class="risk-factor">
        <span class="risk-factor-label">{{ t('risk.dashboard.vulnerability') }}</span>
        <span class="risk-factor-value">{{ factorLabel(score.missing_factors, 'vulnerability', score.vulnerability_score) }}</span>
      </div>
      <div class="risk-factor">
        <span class="risk-factor-label">{{ t('risk.dashboard.copingCapacity') }}</span>
        <span class="risk-factor-value">{{ factorLabel(score.missing_factors, 'coping_capacity', score.coping_capacity_score) }}</span>
      </div>
      <div class="risk-composite">
        <span class="risk-factor-label">{{ t('risk.dashboard.composite') }}</span>
        <span class="risk-composite-value">
          {{ score.composite_score !== null ? score.composite_score.toFixed(1) : t('risk.dashboard.notAvailable') }}
        </span>
        <span
          v-if="score.composite_score_low !== null && score.composite_score_low !== undefined"
          class="risk-confidence-range"
        >
          {{ t('risk.dashboard.confidenceRange', {
            low: score.composite_score_low.toFixed(1),
            high: score.composite_score_high.toFixed(1),
            n: score.confidence_sample_size
          }) }}
        </span>
      </div>
    </div>

    <!-- ── Cascading Hazard Risk (spec 048) ─────────────────────────────── -->
    <!-- No specific real hazard-table row is selected in this dashboard's
         existing free-text country/area/hazard-type flow (unlike a picker
         over hazard_event_history_view), so source_event_ref records that
         this was a manual, in-dashboard description of a real-world event
         rather than a specific stored row id. -->
    <CascadingRiskPanel
      v-if="countryCode && adminBoundaryCode && hazardType"
      :country-code="countryCode"
      :admin-boundary-code="adminBoundaryCode"
      :hazard-type="hazardType"
      source-type="real_event"
      :source-event-ref="{ manual_entry: true, hazard_type: hazardType }"
    />

    <div v-if="score" class="risk-inform-reference">
      <h4>{{ t('risk.dashboard.informReferenceTitle') }}</h4>
      <p v-if="informLoading" class="risk-meta">{{ t('risk.dashboard.computing') }}</p>
      <template v-else-if="informReference">
        <p class="risk-meta">
          {{ t('risk.dashboard.informReferenceHint', { source: informReference.source, year: informReference.year }) }}
        </p>
        <div class="risk-inform-grid">
          <div class="risk-factor">
            <span class="risk-factor-label">{{ t('risk.dashboard.hazard') }}</span>
            <span class="risk-factor-value">{{ fmt(informReference.hazard_exposure_score) }}</span>
          </div>
          <div class="risk-factor">
            <span class="risk-factor-label">{{ t('risk.dashboard.vulnerability') }}</span>
            <span class="risk-factor-value">{{ fmt(informReference.vulnerability_score) }}</span>
          </div>
          <div class="risk-factor">
            <span class="risk-factor-label">{{ t('risk.dashboard.copingCapacity') }}</span>
            <span class="risk-factor-value">{{ fmt(informReference.lack_of_coping_capacity_score) }}</span>
          </div>
          <div class="risk-composite">
            <span class="risk-factor-label">{{ t('risk.dashboard.composite') }}</span>
            <span class="risk-composite-value">{{ fmt(informReference.composite_score) }}</span>
          </div>
        </div>
        <p v-if="informReference.notes" class="risk-meta">{{ informReference.notes }}</p>
      </template>
      <p v-else class="risk-meta">{{ t('risk.dashboard.informReferenceEmpty') }}</p>
    </div>

    <div class="risk-exceedance">
      <h4>{{ t('risk.dashboard.exceedanceCurveTitle') }}</h4>
      <button class="btn-compute" :disabled="curveLoading" @click="loadExceedanceCurve">
        {{ curveLoading ? t('risk.dashboard.computing') : t('risk.dashboard.loadCurve') }}
      </button>
      <p v-if="curveError" class="risk-error">{{ curveError }}</p>
      <div v-if="curve" class="risk-curve-table">
        <div class="risk-curve-row" v-for="point in curve.curve" :key="point.annual_exceedance_probability">
          <span>{{ (point.annual_exceedance_probability * 100).toFixed(1) }}%</span>
          <span>{{ t('risk.dashboard.impactLevel') }}: {{ point.impact_level.toFixed(2) }}</span>
        </div>
        <p class="risk-meta">{{ t('risk.dashboard.recordCount', { count: curve.historical_record_count }) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.risk-dashboard { display: flex; flex-direction: column; gap: 20px; }
.risk-controls, .risk-score-panel, .risk-exceedance, .risk-inform-reference {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.risk-inform-reference h4 { margin: 0 0 8px; }
.risk-inform-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 8px; }
.risk-controls { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.risk-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); }
.risk-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem;
}
.btn-compute {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-compute:disabled { opacity: .5; cursor: not-allowed; }
.risk-error { color: #ef4444; font-size: .8rem; }
.risk-score-panel { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
.risk-factor, .risk-composite { display: flex; flex-direction: column; gap: 4px; }
.risk-factor-label { font-size: .72rem; color: var(--color-text-muted, #94a3b8); }
.risk-factor-value { font-size: 1.2rem; font-weight: 600; }
.risk-composite { grid-column: 1 / -1; border-top: 1px solid rgba(255,255,255,.1); padding-top: 10px; }
.risk-composite-value { font-size: 1.6rem; font-weight: 700; color: #22c55e; }
.risk-confidence-range { font-size: 0.8rem; color: rgba(255,255,255,.55); }
.risk-curve-table { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; font-size: .82rem; }
.risk-curve-row { display: flex; justify-content: space-between; }
.risk-meta { color: var(--color-text-muted, #94a3b8); font-size: .75rem; margin-top: 6px; }
</style>
