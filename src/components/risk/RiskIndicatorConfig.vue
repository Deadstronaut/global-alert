<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

const datasets = ref([])
const indicators = ref([])
const loading = ref(false)
const error = ref(null)
const saving = ref(false)

const form = ref({ exposureDatasetId: '', category: 'vulnerability', weight: '', normalizeMin: '', normalizeMax: '' })

async function loadData() {
  loading.value = true
  const [datasetsRes, indicatorsRes] = await Promise.all([
    supabase.from('exposure_datasets').select('id, name').order('created_at', { ascending: false }),
    supabase.from('risk_indicators').select('*, exposure_datasets(name)').order('created_at', { ascending: false }),
  ])
  if (!datasetsRes.error) datasets.value = datasetsRes.data || []
  if (!indicatorsRes.error) indicators.value = indicatorsRes.data || []
  loading.value = false
}

// FR-002/US1 acceptance scenario 3: weight sums are validated server-side
// (save_risk_indicator RPC) — this is a client-side preview only, the RPC's
// rejection is the actual authority.
function categoryWeightSum(category, excludingId = null) {
  return indicators.value
    .filter((i) => i.category === category && i.id !== excludingId)
    .reduce((sum, i) => sum + Number(i.weight), 0)
}

async function saveIndicator() {
  if (!form.value.exposureDatasetId || !form.value.weight || form.value.normalizeMin === '' || form.value.normalizeMax === '') return
  saving.value = true
  error.value = null
  const { error: err } = await supabase.rpc('save_risk_indicator', {
    p_exposure_dataset_id: form.value.exposureDatasetId,
    p_category: form.value.category,
    p_weight: Number(form.value.weight),
    p_normalize_min: Number(form.value.normalizeMin),
    p_normalize_max: Number(form.value.normalizeMax),
  })
  if (err) {
    // Surfaces the RPC's specific weight-sum message rather than a generic
    // error (US1 acceptance scenario 3 / T010).
    error.value = err.message
  } else {
    form.value = { exposureDatasetId: '', category: 'vulnerability', weight: '', normalizeMin: '', normalizeMax: '' }
    await loadData()
  }
  saving.value = false
}

onMounted(loadData)
</script>

<template>
  <div class="risk-indicator-config">
    <div class="risk-form">
      <h4>{{ t('risk.indicators.formTitle') }}</h4>
      <label class="risk-field">
        <span>{{ t('risk.indicators.dataset') }}</span>
        <select v-model="form.exposureDatasetId">
          <option value="" disabled>{{ t('risk.indicators.datasetPlaceholder') }}</option>
          <option v-for="d in datasets" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.category') }}</span>
        <select v-model="form.category">
          <option value="vulnerability">{{ t('risk.indicators.categoryVulnerability') }}</option>
          <option value="coping_capacity">{{ t('risk.indicators.categoryCopingCapacity') }}</option>
          <option value="exposure">{{ t('risk.indicators.categoryExposure') }}</option>
        </select>
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.weight') }} ({{ t('risk.indicators.weightHint', { sum: categoryWeightSum(form.category).toFixed(2) }) }})</span>
        <input v-model="form.weight" type="number" min="0" max="1" step="0.01" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.normalizeMin') }}</span>
        <input v-model="form.normalizeMin" type="number" step="any" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.normalizeMax') }}</span>
        <input v-model="form.normalizeMax" type="number" step="any" />
      </label>
      <p v-if="error" class="risk-error">{{ error }}</p>
      <button class="btn-save" :disabled="saving" @click="saveIndicator">
        {{ saving ? t('risk.indicators.saving') : t('risk.indicators.save') }}
      </button>
    </div>

    <div class="risk-list">
      <h4>{{ t('risk.indicators.listTitle') }}</h4>
      <div v-if="loading" class="tab-loading">{{ t('impact.loading') }}</div>
      <div v-else-if="indicators.length === 0" class="tab-empty">{{ t('risk.indicators.empty') }}</div>
      <div v-else v-for="i in indicators" :key="i.id" class="risk-row">
        <div>
          <strong>{{ i.exposure_datasets?.name }}</strong>
          <span class="risk-meta">{{ t(`risk.indicators.category${i.category === 'coping_capacity' ? 'CopingCapacity' : i.category === 'exposure' ? 'Exposure' : 'Vulnerability'}`) }} · {{ (i.weight * 100).toFixed(0) }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.risk-indicator-config { display: flex; flex-direction: column; gap: 20px; }
.risk-form, .risk-list {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.risk-form h4, .risk-list h4 { margin: 0 0 12px; font-size: .95rem; }
.risk-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 10px; }
.risk-field input, .risk-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem;
}
.risk-error { color: #ef4444; font-size: .8rem; }
.btn-save {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-save:disabled { opacity: .5; cursor: not-allowed; }
.risk-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.risk-meta { margin-left: 10px; color: var(--color-text-muted, #94a3b8); font-size: .75rem; }
</style>
