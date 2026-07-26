<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { useAuthStore } from '@/stores/auth.js'

/**
 * Yearly, country-level, directly-entered composite risk score (INFORM
 * Index and similar) — see 20260727020000_country_risk_indices.sql's
 * header for why this is a separate, simple table rather than reusing
 * ManualEntryForm.vue (single lat/lng events only) or the
 * risk_indicators/risk_area_scores pipeline (computed, sub-national,
 * requires underlying exposure_datasets rows).
 */
const { t } = useI18n()
const auth = useAuthStore()

const rows = ref([])
const loading = ref(false)
const error = ref(null)

const showForm = ref(false)
const editing = ref(null)
const formError = ref(null)
const saving = ref(false)

const form = ref(emptyForm())

function emptyForm() {
  return {
    country_code: auth.isSuperAdmin ? '' : (auth.countryCode ?? ''),
    year: new Date().getFullYear(),
    hazard_exposure_score: '',
    vulnerability_score: '',
    lack_of_coping_capacity_score: '',
    composite_score: '',
    source: 'INFORM Index',
    notes: '',
  }
}

async function fetchRows() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('country_risk_indices')
    .select('*')
    .order('country_code')
    .order('year', { ascending: false })
  if (err) error.value = err.message
  else rows.value = data ?? []
  loading.value = false
}

onMounted(fetchRows)

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  formError.value = null
  showForm.value = true
}

function openEdit(row) {
  editing.value = row
  form.value = {
    country_code: row.country_code,
    year: row.year,
    hazard_exposure_score: row.hazard_exposure_score ?? '',
    vulnerability_score: row.vulnerability_score ?? '',
    lack_of_coping_capacity_score: row.lack_of_coping_capacity_score ?? '',
    composite_score: row.composite_score ?? '',
    source: row.source,
    notes: row.notes ?? '',
  }
  formError.value = null
  showForm.value = true
}

const numericFields = ['hazard_exposure_score', 'vulnerability_score', 'lack_of_coping_capacity_score', 'composite_score']

function toPayload() {
  const payload = { ...form.value }
  payload.country_code = payload.country_code.trim().toUpperCase()
  payload.year = Number(payload.year)
  for (const f of numericFields) {
    payload[f] = payload[f] === '' ? null : Number(payload[f])
  }
  payload.notes = payload.notes.trim() || null
  return payload
}

async function save() {
  formError.value = null
  const payload = toPayload()
  if (payload.country_code.length !== 2) { formError.value = t('countryRiskIndex.countryCodeInvalid'); return }
  if (!Number.isFinite(payload.year)) { formError.value = t('countryRiskIndex.yearInvalid'); return }

  saving.value = true
  try {
    if (editing.value) {
      const { error: err } = await supabase.from('country_risk_indices').update(payload).eq('id', editing.value.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase.from('country_risk_indices').insert(payload)
      if (err) throw err
    }
    showForm.value = false
    await fetchRows()
  } catch (err) {
    formError.value = /duplicate key|country_risk_indices_country_code_year/i.test(err.message)
      ? t('countryRiskIndex.duplicateYear')
      : err.message
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  const { error: err } = await supabase.from('country_risk_indices').delete().eq('id', row.id)
  if (!err) await fetchRows()
  else error.value = err.message
}

function fmt(value) {
  return value === null || value === undefined ? '—' : value
}
</script>

<template>
  <div class="country-risk-index-panel">
    <div class="panel-header">
      <h3>{{ t('countryRiskIndex.title') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('countryRiskIndex.addButton') }}</button>
    </div>
    <p class="panel-hint">{{ t('countryRiskIndex.hint') }}</p>

    <div v-if="error" class="form-error">{{ error }}</div>
    <div v-if="loading" class="tab-loading">...</div>

    <table v-else class="risk-index-table">
      <thead>
        <tr>
          <th>{{ t('countryRiskIndex.country') }}</th>
          <th>{{ t('countryRiskIndex.year') }}</th>
          <th>{{ t('countryRiskIndex.hazardExposure') }}</th>
          <th>{{ t('countryRiskIndex.vulnerability') }}</th>
          <th>{{ t('countryRiskIndex.copingCapacity') }}</th>
          <th>{{ t('countryRiskIndex.composite') }}</th>
          <th>{{ t('countryRiskIndex.source') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td>{{ row.country_code }}</td>
          <td>{{ row.year }}</td>
          <td>{{ fmt(row.hazard_exposure_score) }}</td>
          <td>{{ fmt(row.vulnerability_score) }}</td>
          <td>{{ fmt(row.lack_of_coping_capacity_score) }}</td>
          <td>{{ fmt(row.composite_score) }}</td>
          <td>{{ row.source }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(row)">{{ t('countryRiskIndex.edit') }}</button>
            <button class="btn-link btn-link-danger" @click="remove(row)">{{ t('countryRiskIndex.remove') }}</button>
          </td>
        </tr>
        <tr v-if="!rows.length"><td colspan="8" class="empty-row">{{ t('countryRiskIndex.empty') }}</td></tr>
      </tbody>
    </table>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="modal-card">
        <h3>{{ editing ? t('countryRiskIndex.editTitle') : t('countryRiskIndex.createTitle') }}</h3>
        <div class="form-grid">
          <label class="form-field"><span>{{ t('countryRiskIndex.country') }} *</span>
            <input v-model="form.country_code" maxlength="2" placeholder="TR" :disabled="!!editing" />
          </label>
          <label class="form-field"><span>{{ t('countryRiskIndex.year') }} *</span>
            <input v-model.number="form.year" type="number" :disabled="!!editing" />
          </label>
          <label class="form-field"><span>{{ t('countryRiskIndex.hazardExposure') }}</span>
            <input v-model="form.hazard_exposure_score" type="number" step="0.01" />
          </label>
          <label class="form-field"><span>{{ t('countryRiskIndex.vulnerability') }}</span>
            <input v-model="form.vulnerability_score" type="number" step="0.01" />
          </label>
          <label class="form-field"><span>{{ t('countryRiskIndex.copingCapacity') }}</span>
            <input v-model="form.lack_of_coping_capacity_score" type="number" step="0.01" />
          </label>
          <label class="form-field"><span>{{ t('countryRiskIndex.composite') }}</span>
            <input v-model="form.composite_score" type="number" step="0.01" />
          </label>
          <label class="form-field span-2"><span>{{ t('countryRiskIndex.source') }}</span>
            <input v-model="form.source" />
          </label>
          <label class="form-field span-2"><span>{{ t('countryRiskIndex.notes') }}</span>
            <input v-model="form.notes" />
          </label>
        </div>
        <div v-if="formError" class="form-error">{{ formError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" :disabled="saving" @click="showForm = false">{{ t('countryRiskIndex.cancel') }}</button>
          <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('countryRiskIndex.save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.country-risk-index-panel { padding: 4px 0; margin-top: 28px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.08); }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.panel-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 14px; }
.risk-index-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.risk-index-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.risk-index-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-link-danger { color: #ef4444; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: .8rem; margin: 8px 0; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
.modal-card h3 { margin: 0 0 16px; color: #e2e8f0; }
.form-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2 { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%; box-sizing: border-box;
}
.form-field input:disabled { opacity: .5; }
.form-field input:focus { outline: none; border-color: rgba(77,163,255,.5); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
