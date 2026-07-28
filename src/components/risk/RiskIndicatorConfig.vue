<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'

const { t } = useI18n()

const datasets = ref([])
const indicators = ref([])
const loading = ref(false)
const error = ref(null)
const saving = ref(false)

const form = ref({ exposureDatasetId: '', category: 'vulnerability', weight: '', normalizeMin: '', normalizeMax: '' })
// User-reported: save_risk_indicator's own RPC already upserts by
// exposure_dataset_id (re-saving the same dataset updates its existing row
// instead of erroring/duplicating), but there was no UI path to discover or
// use that — a saved indicator could never be revisited. editingId tracks
// which indicator (if any) the form currently represents, purely to drive
// the button label/cancel affordance; the actual update behavior is 100%
// the RPC's pre-existing logic, unchanged.
const editingId = ref(null)

function startEdit(indicator) {
  editingId.value = indicator.id
  form.value = {
    exposureDatasetId: indicator.exposure_dataset_id,
    category: indicator.category,
    weight: indicator.weight,
    normalizeMin: indicator.normalize_min,
    normalizeMax: indicator.normalize_max,
  }
}

function cancelEdit() {
  editingId.value = null
  form.value = { exposureDatasetId: '', category: 'vulnerability', weight: '', normalizeMin: '', normalizeMax: '' }
}

async function loadData() {
  loading.value = true
  const [datasetsRes, indicatorsRes] = await Promise.all([
    // source_name/country_code/display_name are needed by friendlyDatasetLabel()
    // below — without them this dropdown showed writeExposureDataset.ts's raw
    // auto-generated name (e.g. "chirps — mg — 2026-07") for every dataset.
    supabase.from('exposure_datasets').select('id, name, source_name, country_code, display_name').order('created_at', { ascending: false }),
    supabase.from('risk_indicators').select('*, exposure_datasets(name, source_name, country_code, display_name)').order('created_at', { ascending: false }),
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
    editingId.value = null
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
      <h4>{{ editingId ? t('risk.indicators.formTitleEdit') : t('risk.indicators.formTitle') }}</h4>
      <label class="risk-field">
        <span>{{ t('risk.indicators.dataset') }}</span>
        <select v-model="form.exposureDatasetId" :disabled="!!editingId">
          <option value="" disabled>{{ t('risk.indicators.datasetPlaceholder') }}</option>
          <option v-for="d in datasets" :key="d.id" :value="d.id">{{ friendlyDatasetLabel(t, d) }}</option>
        </select>
        <span v-if="editingId" class="risk-hint">{{ t('risk.indicators.datasetLockedWhileEditing') }}</span>
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
        <span>{{ t('risk.indicators.weight') }} ({{ t('risk.indicators.weightHint', { sum: categoryWeightSum(form.category, editingId).toFixed(2) }) }})</span>
        <input v-model="form.weight" type="number" min="0" max="1" step="0.01" :placeholder="t('risk.indicators.weightPlaceholder')" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.normalizeMin') }}</span>
        <input v-model="form.normalizeMin" type="number" step="any" :placeholder="t('risk.indicators.normalizeMinPlaceholder')" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.indicators.normalizeMax') }}</span>
        <input v-model="form.normalizeMax" type="number" step="any" :placeholder="t('risk.indicators.normalizeMaxPlaceholder')" />
      </label>
      <p v-if="error" class="risk-error">{{ error }}</p>
      <div class="risk-form-actions">
        <button class="btn-save" :disabled="saving" @click="saveIndicator">
          {{ saving ? t('risk.indicators.saving') : (editingId ? t('risk.indicators.update') : t('risk.indicators.save')) }}
        </button>
        <button v-if="editingId" type="button" class="btn-cancel-edit" @click="cancelEdit">{{ t('risk.indicators.cancelEdit') }}</button>
      </div>
    </div>

    <div class="risk-list">
      <h4>{{ t('risk.indicators.listTitle') }}</h4>
      <div v-if="loading" class="tab-loading">{{ t('impact.loading') }}</div>
      <div v-else-if="indicators.length === 0" class="tab-empty">{{ t('risk.indicators.empty') }}</div>
      <div v-else v-for="i in indicators" :key="i.id" class="risk-row">
        <div>
          <strong>{{ friendlyDatasetLabel(t, i.exposure_datasets) }}</strong>
          <span class="risk-meta">{{ t(`risk.indicators.category${i.category === 'coping_capacity' ? 'CopingCapacity' : i.category === 'exposure' ? 'Exposure' : 'Vulnerability'}`) }} · {{ (i.weight * 100).toFixed(0) }}%</span>
        </div>
        <button type="button" class="btn-edit-indicator" @click="startEdit(i)">{{ t('risk.indicators.edit') }}</button>
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
.risk-form-actions { display: flex; gap: 8px; align-items: center; }
.btn-cancel-edit {
  padding: 8px 14px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15);
  border-radius: 8px; color: #e2e8f0; font-size: .8rem; cursor: pointer;
}
.risk-hint { font-size: .68rem; opacity: .8; }
.risk-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.risk-meta { margin-left: 10px; color: var(--color-text-muted, #94a3b8); font-size: .75rem; }
.btn-edit-indicator {
  padding: 4px 12px; background: rgba(77,163,255,.15); border: 1px solid rgba(77,163,255,.35);
  border-radius: 6px; color: #4da3ff; font-size: .72rem; cursor: pointer; flex-shrink: 0;
}
</style>
