<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'

const { t } = useI18n()
const hazardTypesStore = useHazardTypesStore()

// Mirrors supabase/functions/shared/hazardFootprint.ts's FOOTPRINT_STRATEGIES keys —
// the only hazard types the simulate-hazard-scenario function can actually compute.
// Kept in sync manually since the edge function has no client-callable "list supported
// types" endpoint; update both places together when a new formula is added.
const SIMULATABLE_HAZARD_TYPES = ['earthquake']

const datasets = ref([])
const scenarios = ref([])
const loading = ref(false)
const simulating = ref(false)
const error = ref(null)
const result = ref(null)

const form = ref({
  name: '',
  hazardType: 'earthquake',
  magnitude: '',
  epicenterLat: '',
  epicenterLng: '',
  exposureDatasetIds: [],
})

async function loadData() {
  loading.value = true
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
  const [datasetsRes, scenariosRes] = await Promise.all([
    supabase.from('exposure_datasets').select('id, name').order('created_at', { ascending: false }),
    supabase.from('hazard_scenarios').select('*').order('created_at', { ascending: false }),
  ])
  if (!datasetsRes.error) datasets.value = datasetsRes.data || []
  if (!scenariosRes.error) scenarios.value = scenariosRes.data || []
  loading.value = false
}

async function extractFunctionErrorMessage(invokeError) {
  if (!invokeError) return null
  try {
    const body = await invokeError.context?.json?.()
    if (body?.error) return body.error
  } catch {
    // response body wasn't JSON or already consumed — fall through
  }
  return invokeError.message ?? null
}

async function runSimulation() {
  simulating.value = true
  error.value = null
  result.value = null
  const { data, error: invokeError } = await supabase.functions.invoke('simulate-hazard-scenario', {
    body: {
      hazardType: form.value.hazardType,
      parameters: {
        magnitude: Number(form.value.magnitude),
        epicenterLat: Number(form.value.epicenterLat),
        epicenterLng: Number(form.value.epicenterLng),
      },
      exposureDatasetIds: form.value.exposureDatasetIds,
    },
  })
  if (invokeError) {
    error.value = (await extractFunctionErrorMessage(invokeError)) || t('risk.scenario.errors.simulationFailed')
  } else if (data?.error === 'no_formula_available') {
    // FR-010: a documented, expected outcome — not a failure.
    error.value = t('risk.scenario.noFormulaAvailable', { hazardType: data.hazardType })
  } else if (data?.error) {
    error.value = data.error
  } else {
    result.value = data
  }
  simulating.value = false
}

async function saveScenario() {
  if (!result.value || !form.value.name.trim()) return
  const { error: err } = await supabase.from('hazard_scenarios').insert({
    name: form.value.name,
    hazard_type: form.value.hazardType,
    parameters: {
      magnitude: Number(form.value.magnitude),
      epicenterLat: Number(form.value.epicenterLat),
      epicenterLng: Number(form.value.epicenterLng),
    },
    footprint_geojson: result.value.footprint_geojson,
    estimated_impact: result.value.estimated_impact,
    formula_range_warning: result.value.formula_range_warning,
  })
  if (err) {
    error.value = err.message
  } else {
    await loadData()
  }
}

function reloadScenario(scenario) {
  form.value = {
    name: scenario.name,
    hazardType: scenario.hazard_type,
    magnitude: scenario.parameters?.magnitude ?? '',
    epicenterLat: scenario.parameters?.epicenterLat ?? '',
    epicenterLng: scenario.parameters?.epicenterLng ?? '',
    exposureDatasetIds: (scenario.estimated_impact ?? []).map((i) => i.exposure_dataset_id),
  }
  result.value = {
    footprint_geojson: scenario.footprint_geojson,
    estimated_impact: scenario.estimated_impact,
    formula_range_warning: scenario.formula_range_warning,
  }
}

onMounted(loadData)
</script>

<template>
  <div class="scenario-builder">
    <div class="scenario-form">
      <h4>{{ t('risk.scenario.formTitle') }}</h4>
      <p class="risk-intro">{{ t('risk.scenario.intro') }}</p>
      <label class="risk-field">
        <span>{{ t('risk.scenario.name') }}</span>
        <input v-model="form.name" :placeholder="t('risk.scenario.namePlaceholder')" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.scenario.hazardType') }}</span>
        <select v-model="form.hazardType">
          <option v-for="h in hazardTypesStore.alertableHazardTypes" :key="h.code" :value="h.code">
            {{ h.display_name }}{{ SIMULATABLE_HAZARD_TYPES.includes(h.code) ? '' : ' ' + t('risk.scenario.notSimulatedYet') }}
          </option>
        </select>
        <span class="risk-hint">{{ t('risk.scenario.hazardTypeHint') }}</span>
      </label>
      <label class="risk-field">
        <span>{{ t('risk.scenario.magnitude') }}</span>
        <input v-model="form.magnitude" type="number" step="0.1" :placeholder="t('risk.scenario.magnitudePlaceholder')" />
        <span class="risk-hint">{{ t('risk.scenario.magnitudeHint') }}</span>
      </label>
      <label class="risk-field">
        <span>{{ t('risk.scenario.epicenterLat') }}</span>
        <input v-model="form.epicenterLat" type="number" step="any" placeholder="41.0082" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.scenario.epicenterLng') }}</span>
        <input v-model="form.epicenterLng" type="number" step="any" placeholder="28.9784" />
        <span class="risk-hint">{{ t('risk.scenario.epicenterHint') }}</span>
      </label>
      <div class="risk-field">
        <span>{{ t('risk.scenario.datasets') }}</span>
        <span class="risk-hint">{{ t('risk.scenario.datasetsHint') }}</span>
        <div v-if="datasets.length === 0" class="tab-empty">{{ t('risk.scenario.noDatasets') }}</div>
        <label v-for="d in datasets" :key="d.id" class="risk-checkbox-row">
          <input type="checkbox" :value="d.id" v-model="form.exposureDatasetIds" />
          <span>{{ d.name }}</span>
        </label>
      </div>
      <p v-if="error" class="risk-error">{{ error }}</p>
      <button class="btn-compute" :disabled="simulating" @click="runSimulation">
        {{ simulating ? t('risk.scenario.simulating') : t('risk.scenario.simulate') }}
      </button>
    </div>

    <div v-if="result" class="scenario-result">
      <h4>{{ t('risk.scenario.resultTitle') }}</h4>
      <p class="risk-hint">{{ t('risk.scenario.resultHint') }}</p>
      <p v-if="result.formula_range_warning" class="risk-warning">{{ t('risk.scenario.rangeWarning') }}</p>
      <div v-for="impact in result.estimated_impact" :key="impact.exposure_dataset_id" class="risk-row">
        <span>{{ t('risk.scenario.totalValue') }}: {{ impact.total_value }}</span>
        <span>{{ t('risk.scenario.featureCount') }}: {{ impact.feature_count }}</span>
      </div>
      <button class="btn-save" @click="saveScenario">{{ t('risk.scenario.save') }}</button>
    </div>

    <div class="scenario-list">
      <h4>{{ t('risk.scenario.savedTitle') }}</h4>
      <div v-if="loading" class="tab-loading">{{ t('impact.loading') }}</div>
      <div v-else-if="scenarios.length === 0" class="tab-empty">{{ t('risk.scenario.empty') }}</div>
      <div v-else v-for="s in scenarios" :key="s.id" class="risk-row">
        <strong>{{ s.name }}</strong>
        <button class="btn-reload" @click="reloadScenario(s)">{{ t('risk.scenario.reload') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scenario-builder { display: flex; flex-direction: column; gap: 20px; }
.scenario-form, .scenario-result, .scenario-list {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.risk-intro { font-size: .8rem; color: var(--color-text-muted, #94a3b8); margin: 0 0 14px; line-height: 1.4; }
.risk-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 10px; }
.risk-field input, .risk-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem;
}
.risk-hint { font-size: .72rem; color: var(--color-text-muted, #94a3b8); opacity: .8; line-height: 1.35; }
.risk-error { color: #ef4444; font-size: .8rem; }
.risk-warning { color: #f59e0b; font-size: .8rem; }
.risk-checkbox-row { display: flex; align-items: center; gap: 8px; padding: 4px 0; font-size: .82rem; color: #e2e8f0; }
.risk-checkbox-row input { width: auto; }
.btn-compute, .btn-save {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-compute:disabled { opacity: .5; cursor: not-allowed; }
.risk-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.btn-reload {
  padding: 4px 12px; background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.35);
  border-radius: 6px; color: #3b82f6; font-size: .75rem; cursor: pointer;
}
</style>
