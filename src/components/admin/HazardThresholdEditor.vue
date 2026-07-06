<script setup>
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  hazardTypeCode: { type: String, required: true },
  threshold: { type: Object, default: null }, // { metric_name, unit, breakpoints } | null
  countryCode: { type: String, default: null }, // spec 020: set → editing a country-scoped override, not the global threshold
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()

const SEVERITIES = ['minimal', 'low', 'moderate', 'high', 'critical']

const metricName = ref('')
const unit = ref('')
const rows = ref([]) // [{ min_value, severity }]
const saving = ref(false)
const error = ref(null)

watch(
  () => props.threshold,
  (th) => {
    metricName.value = th?.metric_name ?? ''
    unit.value = th?.unit ?? ''
    rows.value = th?.breakpoints?.length ? th.breakpoints.map((b) => ({ ...b })) : [{ min_value: 0, severity: 'low' }]
    error.value = null
  },
  { immediate: true },
)

const isAscending = computed(() => {
  for (let i = 1; i < rows.value.length; i++) {
    if (Number(rows.value[i].min_value) <= Number(rows.value[i - 1].min_value)) return false
  }
  return true
})

function addRow() {
  rows.value.push({ min_value: 0, severity: 'low' })
}

function removeRow(idx) {
  rows.value.splice(idx, 1)
}

function save() {
  error.value = null
  if (!metricName.value.trim()) { error.value = t('hazardTaxonomy.metricRequired'); return }
  if (!isAscending.value) { error.value = t('hazardTaxonomy.breakpointsNotAscending'); return }

  saving.value = true
  emit('save', {
    hazard_type_code: props.hazardTypeCode,
    ...(props.countryCode ? { country_code: props.countryCode } : {}),
    metric_name: metricName.value.trim(),
    unit: unit.value.trim() || null,
    breakpoints: rows.value.map((r) => ({ min_value: Number(r.min_value), severity: r.severity })),
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3 v-if="countryCode">{{ t('hazardTaxonomy.overrideFor', { country: countryCode }) }} — {{ hazardTypeCode }}</h3>
      <h3 v-else>{{ t('hazardTaxonomy.thresholdsFor') }} — {{ hazardTypeCode }}</h3>

      <div class="form-grid">
        <label class="form-field"><span>{{ t('hazardTaxonomy.metricName') }} *</span>
          <input v-model="metricName" placeholder="magnitude" />
        </label>
        <label class="form-field"><span>{{ t('hazardTaxonomy.unit') }}</span>
          <input v-model="unit" placeholder="Mw" />
        </label>
      </div>

      <div class="breakpoints-section">
        <p class="mapping-hint">{{ t('hazardTaxonomy.breakpointsHint') }}</p>
        <div v-for="(row, idx) in rows" :key="idx" class="breakpoint-row">
          <input v-model.number="row.min_value" type="number" step="any" class="bp-value" />
          <select v-model="row.severity" class="bp-severity">
            <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
          </select>
          <button class="btn-remove" @click="removeRow(idx)">✕</button>
        </div>
        <button class="btn-add" @click="addRow">+ {{ t('hazardTaxonomy.addBreakpoint') }}</button>
        <div v-if="!isAscending" class="mapping-warning">{{ t('hazardTaxonomy.breakpointsNotAscending') }}</div>
      </div>

      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('hazardTaxonomy.cancel') }}</button>
        <button class="btn-submit" :disabled="saving || !isAscending" @click="save">{{ saving ? '...' : t('hazardTaxonomy.save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 520px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
.modal-card h3 { margin: 0 0 16px; color: #e2e8f0; }
.form-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%;
}
.form-field select { color-scheme: dark; }
.form-field input:focus, .form-field select:focus { outline: none; border-color: rgba(77,163,255,.5); }
.breakpoints-section { margin-top: 16px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.08); }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 10px; }
.breakpoint-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.bp-value { width: 90px; background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; }
.bp-severity { flex: 1; background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark; }
.btn-remove { background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.3); border-radius: 6px; color: #ef4444; cursor: pointer; padding: 5px 9px; }
.btn-add { margin-top: 4px; padding: 7px 14px; background: rgba(77,163,255,.15); border: 1px solid rgba(77,163,255,.3); border-radius: 8px; color: #4aa3ff; cursor: pointer; font-size: .8rem; }
.mapping-warning { color: #f59e0b; font-size: .78rem; margin-top: 10px; }
.form-error { color: #ef4444; font-size: .8rem; margin-top: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
