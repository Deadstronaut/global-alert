<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useResourceInventoryStore } from '@/stores/resourceInventory.js'
import countries from '@/configs/countries.json'

const { t } = useI18n()
const auth = useAuthStore()
const store = useResourceInventoryStore()

const RESOURCE_TYPES = ['personnel', 'equipment', 'vehicle', 'supply', 'other']
const STATUSES = ['available', 'deployed', 'depleted', 'maintenance']

const showForm = ref(false)
const editing = ref(null)
const formError = ref(null)
const saving = ref(false)

const countryOptions = Object.entries(countries)
  .map(([code, c]) => ({ code, name: c.nameEn }))
  .sort((a, b) => a.name.localeCompare(b.name))

function emptyForm() {
  return {
    country_code: auth.isSuperAdmin ? '' : (auth.countryCode ?? ''),
    resource_type: 'equipment',
    name: '',
    quantity: 1,
    unit: '',
    status: 'available',
    region_code: '',
    notes: '',
  }
}
const form = ref(emptyForm())

onMounted(() => store.fetchResources())

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  formError.value = null
  showForm.value = true
}

function openEdit(r) {
  editing.value = r
  form.value = {
    country_code: r.country_code,
    resource_type: r.resource_type,
    name: r.name,
    quantity: r.quantity,
    unit: r.unit ?? '',
    status: r.status,
    region_code: r.region_code ?? '',
    notes: r.notes ?? '',
  }
  formError.value = null
  showForm.value = true
}

function toPayload() {
  return {
    country_code: form.value.country_code.trim().toLowerCase(),
    resource_type: form.value.resource_type,
    name: form.value.name.trim(),
    quantity: Number(form.value.quantity) || 0,
    unit: form.value.unit.trim() || null,
    status: form.value.status,
    region_code: form.value.region_code.trim() || null,
    notes: form.value.notes.trim() || null,
  }
}

async function save() {
  formError.value = null
  const payload = toPayload()
  if (!payload.country_code || payload.country_code.length !== 2) { formError.value = t('resourceInventory.countryRequired'); return }
  if (!payload.name) { formError.value = t('resourceInventory.nameRequired'); return }

  saving.value = true
  try {
    if (editing.value) await store.updateResource(editing.value.id, payload)
    else await store.createResource(payload)
    showForm.value = false
  } catch (err) {
    formError.value = err.message
  } finally {
    saving.value = false
  }
}

async function remove(r) {
  try {
    await store.deleteResource(r.id)
  } catch { /* store.error already set */ }
}
</script>

<template>
  <div class="resource-inventory-panel">
    <div class="panel-header">
      <h3>{{ t('resourceInventory.title') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('resourceInventory.addButton') }}</button>
    </div>
    <p class="panel-hint">{{ t('resourceInventory.hint') }}</p>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="resource-table">
      <thead>
        <tr>
          <th>{{ t('resourceInventory.country') }}</th>
          <th>{{ t('resourceInventory.type') }}</th>
          <th>{{ t('resourceInventory.name') }}</th>
          <th>{{ t('resourceInventory.quantity') }}</th>
          <th>{{ t('resourceInventory.status') }}</th>
          <th>{{ t('resourceInventory.region') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in store.resources" :key="r.id">
          <td>{{ r.country_code?.toUpperCase() }}</td>
          <td>{{ t(`resourceInventory.resourceType.${r.resource_type}`) }}</td>
          <td>{{ r.name }}</td>
          <td>{{ r.quantity }}{{ r.unit ? ` ${r.unit}` : '' }}</td>
          <td><span :class="`status-badge status-${r.status}`">{{ t(`resourceInventory.statusValue.${r.status}`) }}</span></td>
          <td>{{ r.region_code || '—' }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(r)">{{ t('resourceInventory.edit') }}</button>
            <button class="btn-link btn-link-danger" @click="remove(r)">{{ t('resourceInventory.remove') }}</button>
          </td>
        </tr>
        <tr v-if="!store.resources.length"><td colspan="7" class="empty-row">{{ t('resourceInventory.empty') }}</td></tr>
      </tbody>
    </table>

    <div v-if="showForm" class="modal-overlay" @click.self="showForm = false">
      <div class="modal-card">
        <h3>{{ editing ? t('resourceInventory.editTitle') : t('resourceInventory.createTitle') }}</h3>
        <div class="form-grid">
          <label class="form-field"><span>{{ t('resourceInventory.country') }} *</span>
            <select v-if="auth.isSuperAdmin" v-model="form.country_code">
              <option value="">— seç —</option>
              <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }} ({{ c.code }})</option>
            </select>
            <input v-else :value="form.country_code.toUpperCase()" disabled />
          </label>
          <label class="form-field"><span>{{ t('resourceInventory.type') }} *</span>
            <select v-model="form.resource_type">
              <option v-for="rt in RESOURCE_TYPES" :key="rt" :value="rt">{{ t(`resourceInventory.resourceType.${rt}`) }}</option>
            </select>
          </label>
          <label class="form-field span-2"><span>{{ t('resourceInventory.name') }} *</span>
            <input v-model="form.name" :placeholder="t('resourceInventory.namePlaceholder')" />
          </label>
          <label class="form-field"><span>{{ t('resourceInventory.quantity') }}</span>
            <input v-model.number="form.quantity" type="number" min="0" step="1" />
          </label>
          <label class="form-field"><span>{{ t('resourceInventory.unit') }}</span>
            <input v-model="form.unit" :placeholder="t('resourceInventory.unitPlaceholder')" />
          </label>
          <label class="form-field"><span>{{ t('resourceInventory.status') }}</span>
            <select v-model="form.status">
              <option v-for="s in STATUSES" :key="s" :value="s">{{ t(`resourceInventory.statusValue.${s}`) }}</option>
            </select>
          </label>
          <label class="form-field"><span>{{ t('resourceInventory.region') }}</span>
            <input v-model="form.region_code" placeholder="opsiyonel" />
          </label>
          <label class="form-field span-2"><span>{{ t('resourceInventory.notes') }}</span>
            <input v-model="form.notes" />
          </label>
        </div>
        <div v-if="formError" class="form-error">{{ formError }}</div>
        <div class="modal-actions">
          <button class="btn-cancel" :disabled="saving" @click="showForm = false">{{ t('resourceInventory.cancel') }}</button>
          <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('resourceInventory.save') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.resource-inventory-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.panel-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 14px; }
.resource-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.resource-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.resource-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-link-danger { color: #ef4444; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: .8rem; margin: 8px 0; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.status-badge { font-size: .72rem; padding: 2px 8px; border-radius: 10px; }
.status-available { background: rgba(34,197,94,.15); color: #22c55e; }
.status-deployed { background: rgba(59,130,246,.15); color: #3b82f6; }
.status-depleted { background: rgba(239,68,68,.15); color: #ef4444; }
.status-maintenance { background: rgba(234,179,8,.15); color: #eab308; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
.modal-card h3 { margin: 0 0 16px; color: #e2e8f0; }
.form-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2 { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%; box-sizing: border-box;
}
.form-field select { color-scheme: dark; }
.form-field input:disabled { opacity: .5; }
.form-field input:focus, .form-field select:focus { outline: none; border-color: rgba(77,163,255,.5); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-cancel:disabled { opacity: .5; cursor: not-allowed; }
</style>
