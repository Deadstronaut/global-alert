<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

const props = defineProps({
  countryCode: { type: String, required: true },
  adminBoundaryCode: { type: String, required: true },
  hazardType: { type: String, required: true },
  sourceType: { type: String, required: true }, // 'real_event' | 'hypothetical_scenario'
  sourceEventRef: { type: Object, required: true },
  initialLat: { type: [Number, String], default: '' },
  initialLng: { type: [Number, String], default: '' },
  initialMagnitude: { type: [Number, String], default: '' },
})

const eventLat = ref(props.initialLat)
const eventLng = ref(props.initialLng)
const magnitude = ref(props.initialMagnitude)
const evaluating = ref(false)
const error = ref(null)
const result = ref(null)

// Scenario-driven usage (US3) prefills these from the parent whenever the
// selected/simulated scenario changes; a manual real-event usage (US2)
// leaves them as free-text inputs the user fills in themselves.
watch(
  () => [props.initialLat, props.initialLng, props.initialMagnitude],
  ([lat, lng, mag]) => {
    eventLat.value = lat
    eventLng.value = lng
    magnitude.value = mag
  },
)

async function evaluate() {
  if (!props.countryCode || !props.adminBoundaryCode || !props.hazardType || eventLat.value === '' || eventLng.value === '') return
  evaluating.value = true
  error.value = null
  result.value = null
  const { data, error: err } = await supabase.rpc('evaluate_cascade_rules', {
    p_country_code: props.countryCode.toLowerCase(),
    p_hazard_type: props.hazardType,
    p_admin_boundary_code: props.adminBoundaryCode,
    p_event_lat: Number(eventLat.value),
    p_event_lng: Number(eventLng.value),
    p_magnitude: magnitude.value === '' ? null : Number(magnitude.value),
    p_source_type: props.sourceType,
    p_source_event_ref: props.sourceEventRef,
  })
  if (err) {
    error.value = err.message || t('risk.cascade.errors.evaluationFailed')
  } else {
    result.value = data
  }
  evaluating.value = false
}

defineExpose({ evaluate })
</script>

<template>
  <div class="cascading-risk-panel">
    <h4>{{ t('risk.cascade.title') }}</h4>
    <p class="risk-meta">
      {{ sourceType === 'hypothetical_scenario' ? t('risk.cascade.simulatedLabel') : t('risk.cascade.realEventLabel') }}
    </p>

    <div class="risk-cascade-inputs">
      <label class="risk-field">
        <span>{{ t('risk.cascade.eventLat') }}</span>
        <input v-model="eventLat" type="number" step="any" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.cascade.eventLng') }}</span>
        <input v-model="eventLng" type="number" step="any" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.cascade.eventMagnitude') }}</span>
        <input v-model="magnitude" type="number" step="0.1" />
      </label>
      <button class="btn-compute" :disabled="evaluating" @click="evaluate">
        {{ evaluating ? t('risk.cascade.evaluating') : t('risk.cascade.evaluate') }}
      </button>
    </div>

    <p v-if="error" class="risk-error">{{ error }}</p>

    <div v-if="result">
      <!-- FR-007: an explicit "no secondary risk" state, distinct from
           "not evaluable" (FR-006) below — never conflated. -->
      <p
        v-if="result.triggered.length === 0 && result.not_evaluable.length === 0"
        class="tab-empty"
      >
        {{ t('risk.cascade.noRiskTriggered') }}
      </p>

      <div v-if="result.triggered.length > 0" class="risk-cascade-section">
        <h5>{{ t('risk.cascade.triggeredTitle') }}</h5>
        <div v-for="a in result.triggered" :key="a.assessment_id" class="risk-row risk-row-block">
          <strong>{{ a.secondary_risk_category }}</strong>
          <p class="risk-recommendation">{{ a.recommendation_text }}</p>
          <p class="risk-meta">
            {{ t('risk.cascade.affectedPopulation') }}:
            {{ a.affected_population !== null && a.affected_population !== undefined ? Math.round(a.affected_population).toLocaleString() : t('risk.dashboard.notAvailable') }}
          </p>
          <details class="risk-why">
            <summary>{{ t('risk.cascade.whyLabel') }}</summary>
            <pre>{{ JSON.stringify(a.input_values, null, 2) }}</pre>
          </details>
        </div>
      </div>

      <div v-if="result.not_evaluable.length > 0" class="risk-cascade-section">
        <h5>{{ t('risk.cascade.notEvaluableTitle') }}</h5>
        <p class="risk-hint">{{ t('risk.cascade.notEvaluableHint') }}</p>
        <div v-for="ne in result.not_evaluable" :key="ne.rule_id" class="risk-row">
          <span>{{ ne.secondary_risk_category }}</span>
          <span class="risk-meta">{{ ne.missing_prerequisite }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cascading-risk-panel {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.cascading-risk-panel h4 { margin: 0 0 8px; font-size: .95rem; }
.cascading-risk-panel h5 { margin: 0 0 8px; font-size: .82rem; }
.risk-cascade-inputs { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; margin: 10px 0; }
.risk-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); }
.risk-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem; width: 130px;
}
.btn-compute {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-compute:disabled { opacity: .5; cursor: not-allowed; }
.risk-error { color: #ef4444; font-size: .8rem; }
.risk-hint { font-size: .72rem; color: var(--color-text-muted, #94a3b8); opacity: .8; line-height: 1.35; }
.risk-meta { color: var(--color-text-muted, #94a3b8); font-size: .75rem; margin-top: 4px; }
.risk-cascade-section { margin-top: 14px; }
.risk-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.risk-row-block { flex-direction: column; align-items: flex-start; gap: 4px; }
.risk-recommendation { font-size: .82rem; margin: 2px 0; }
.risk-why { font-size: .72rem; color: var(--color-text-muted, #94a3b8); cursor: pointer; }
.risk-why pre { white-space: pre-wrap; font-size: .7rem; margin-top: 4px; }
</style>
