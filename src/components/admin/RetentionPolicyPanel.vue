<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

const CATEGORIES = ['audit_log', 'dispatch_receipts']

const policies = ref([])
const loading = ref(false)
const error = ref(null)

const form = ref({ category: CATEGORIES[0], retentionDays: 30, action: 'archive' })
const saving = ref(false)
const confirmingDelete = ref(false)

async function loadPolicies() {
  loading.value = true
  const { data, error: err } = await supabase.from('retention_policies').select('*').order('category')
  if (!err) policies.value = data || []
  loading.value = false
}

function requestSave() {
  if (form.value.action === 'delete') {
    confirmingDelete.value = true
    return
  }
  savePolicy()
}

async function savePolicy() {
  confirmingDelete.value = false
  saving.value = true
  error.value = null
  const { error: err } = await supabase.from('retention_policies').upsert(
    {
      category: form.value.category,
      retention_days: Number(form.value.retentionDays),
      action: form.value.action,
    },
    { onConflict: 'category' },
  )
  if (err) error.value = err.message
  saving.value = false
  await loadPolicies()
}

onMounted(loadPolicies)
</script>

<template>
  <div class="retention-policy-panel">
    <h4>{{ t('audit.retention.title') }}</h4>

    <div v-if="error" class="form-error">{{ error }}</div>
    <div v-if="loading" class="tab-loading">...</div>

    <table v-else class="retention-table">
      <thead>
        <tr>
          <th>{{ t('audit.retention.category') }}</th>
          <th>{{ t('audit.retention.days') }}</th>
          <th>{{ t('audit.retention.action') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in policies" :key="p.id">
          <td>{{ p.category }}</td>
          <td>{{ p.retention_days }}</td>
          <td>{{ t('audit.retention.action_' + p.action) }}</td>
        </tr>
        <tr v-if="!policies.length"><td colspan="3" class="empty-row">{{ t('audit.retention.empty') }}</td></tr>
      </tbody>
    </table>

    <div class="retention-form">
      <label class="retention-field">
        <span>{{ t('audit.retention.category') }}</span>
        <select v-model="form.category">
          <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </label>
      <label class="retention-field">
        <span>{{ t('audit.retention.days') }}</span>
        <input type="number" min="1" v-model="form.retentionDays" :placeholder="t('audit.retention.daysPlaceholder')" />
      </label>
      <label class="retention-field">
        <span>{{ t('audit.retention.action') }}</span>
        <select v-model="form.action">
          <option value="archive">{{ t('audit.retention.action_archive') }}</option>
          <option value="delete">{{ t('audit.retention.action_delete') }}</option>
        </select>
      </label>
      <button class="btn-submit" :disabled="saving" @click="requestSave">
        {{ saving ? t('audit.retention.saving') : t('audit.retention.save') }}
      </button>
    </div>

    <div v-if="confirmingDelete" class="modal-overlay" @click.self="confirmingDelete = false">
      <div class="modal-card">
        <h3>{{ t('audit.retention.deleteWarningTitle') }}</h3>
        <p>{{ t('audit.retention.deleteWarningBody') }}</p>
        <div class="modal-actions">
          <button class="btn-cancel" @click="confirmingDelete = false">{{ t('audit.retention.cancel') }}</button>
          <button class="btn-danger" @click="savePolicy">{{ t('audit.retention.confirmDelete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.retention-policy-panel { padding: 4px 0; }
.retention-policy-panel h4 { margin: 0 0 12px; color: #e2e8f0; }
.retention-table { width: 100%; border-collapse: collapse; font-size: .82rem; margin-bottom: 16px; }
.retention-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.retention-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.retention-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.retention-field { display: flex; flex-direction: column; gap: 4px; font-size: .75rem; color: var(--color-text-muted,#94a3b8); }
.retention-field input, .retention-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark;
}
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .5; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: .8rem; margin-bottom: 10px; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 420px; max-width: 92vw; }
.modal-card h3 { margin: 0 0 12px; color: #e2e8f0; font-size: 1rem; }
.modal-card p { color: var(--color-text-muted,#94a3b8); font-size: .85rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-danger { padding: 9px 18px; background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.4); border-radius: 8px; color: #ef4444; font-weight: 600; cursor: pointer; font-size: .85rem; }
</style>
