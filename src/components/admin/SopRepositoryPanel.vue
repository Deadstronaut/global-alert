<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSopDocumentsStore } from '@/stores/sopDocuments.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { filterSopDocuments } from '@/services/sopFilter.js'
import SopDocumentFormModal from './SopDocumentFormModal.vue'

const { t } = useI18n()
const store = useSopDocumentsStore()
const hazardTypesStore = useHazardTypesStore()

const showForm = ref(false)
const editingSop = ref(null)
const formError = ref(null)

// spec 033 (MHEWS-FR-0184): category + title search filter, client-side —
// the SOP list is small enough that no server-side/full-text search is
// needed (YAGNI).
const categoryFilter = ref('')
const searchTerm = ref('')
const existingCategories = computed(() =>
  [...new Set(store.sopDocuments.map((s) => s.category).filter(Boolean))].sort(),
)
const filteredSopDocuments = computed(() =>
  filterSopDocuments(store.sopDocuments, { category: categoryFilter.value, searchTerm: searchTerm.value }),
)

// spec 033 (MHEWS-FR-0275): read-only version history view, opened per SOP.
const historyTarget = ref(null)
const historyVersions = ref(null)

async function openHistory(sopDocument) {
  historyTarget.value = sopDocument
  historyVersions.value = null
  historyVersions.value = await store.fetchSopDocumentVersions(sopDocument.id)
}

function closeHistory() {
  historyTarget.value = null
  historyVersions.value = null
}

onMounted(() => {
  if (!store.loaded) store.fetchSopDocuments()
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
})

function openCreate() {
  editingSop.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(s) {
  editingSop.value = s
  formError.value = null
  showForm.value = true
}

async function handleSave(payload) {
  try {
    if (editingSop.value) {
      await store.updateSopDocument(editingSop.value.id, payload)
    } else {
      await store.createSopDocument(payload)
    }
    showForm.value = false
  } catch (err) {
    formError.value = err.message
  }
}

async function toggleActive(s) {
  if (s.is_active) await store.deactivateSopDocument(s.id)
  else await store.reactivateSopDocument(s.id)
}

function hazardDisplayName(code) {
  return hazardTypesStore.hazardTypes.find((h) => h.code === code)?.display_name ?? code
}
</script>

<template>
  <div class="sop-repository-panel">
    <div class="panel-header">
      <h3>{{ t('incidentTracking.sopTabLabel') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('incidentTracking.sopAddButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>

    <div class="sop-filters">
      <input v-model="searchTerm" class="sop-search" type="search" :placeholder="t('incidentTracking.sopSearchPlaceholder')" />
      <select v-model="categoryFilter" class="sop-category-filter">
        <option value="">{{ t('incidentTracking.sopAllCategories') }}</option>
        <option v-for="c in existingCategories" :key="c" :value="c">{{ c }}</option>
      </select>
    </div>

    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="sop-table">
      <thead>
        <tr>
          <th>{{ t('incidentTracking.sopTitle') }}</th><th>{{ t('incidentTracking.sopCategory') }}</th>
          <th>{{ t('incidentTracking.sopHazardType') }}</th>
          <th>{{ t('incidentTracking.sopStatus') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in filteredSopDocuments" :key="s.id" :class="{ inactive: !s.is_active }">
          <td>{{ s.title }}</td>
          <td>{{ s.category || '—' }}</td>
          <td>{{ hazardDisplayName(s.hazard_type_code) }}</td>
          <td>{{ s.is_active ? t('incidentTracking.sopActive') : t('incidentTracking.sopInactive') }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(s)">{{ t('incidentTracking.sopEdit') }}</button>
            <button class="btn-link" @click="toggleActive(s)">{{ s.is_active ? t('incidentTracking.sopDeactivate') : t('incidentTracking.sopReactivate') }}</button>
            <button class="btn-link" @click="openHistory(s)">{{ t('incidentTracking.sopVersionHistory') }}</button>
          </td>
        </tr>
        <tr v-if="!filteredSopDocuments.length"><td colspan="5" class="empty-row">{{ t('incidentTracking.sopEmpty') }}</td></tr>
      </tbody>
    </table>

    <SopDocumentFormModal
      v-if="showForm"
      :sop-document="editingSop"
      :existing-categories="existingCategories"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>

    <div v-if="historyTarget" class="modal-overlay" @click.self="closeHistory">
      <div class="modal-card">
        <h3>{{ t('incidentTracking.sopVersionHistoryTitle', { title: historyTarget.title }) }}</h3>
        <div v-if="historyVersions === null" class="tab-loading">...</div>
        <p v-else-if="!historyVersions.length" class="empty-row">{{ t('incidentTracking.sopNoVersionHistory') }}</p>
        <ul v-else class="sop-version-list">
          <li v-for="v in historyVersions" :key="v.id">
            <strong>v{{ v.version }}</strong> — {{ v.title }} ({{ new Date(v.archived_at).toLocaleString() }})
          </li>
        </ul>
        <div class="modal-actions">
          <button class="btn-cancel" @click="closeHistory">{{ t('incidentTracking.cancel') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sop-repository-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.sop-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.sop-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.sop-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.sop-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.form-error { color: #ef4444; font-size: .8rem; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-inline-error { margin-top: 8px; }
.sop-filters { display: flex; gap: 10px; margin-bottom: 12px; }
.sop-search, .sop-category-filter {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark;
}
.sop-search { flex: 1; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
.modal-card h3 { margin: 0 0 16px; color: #e2e8f0; font-size: 1rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.sop-version-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: .82rem; color: #e2e8f0; }
</style>
