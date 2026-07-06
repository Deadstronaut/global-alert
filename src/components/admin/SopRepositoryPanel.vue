<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSopDocumentsStore } from '@/stores/sopDocuments.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import SopDocumentFormModal from './SopDocumentFormModal.vue'

const { t } = useI18n()
const store = useSopDocumentsStore()
const hazardTypesStore = useHazardTypesStore()

const showForm = ref(false)
const editingSop = ref(null)
const formError = ref(null)

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
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="sop-table">
      <thead>
        <tr>
          <th>{{ t('incidentTracking.sopTitle') }}</th><th>{{ t('incidentTracking.sopHazardType') }}</th>
          <th>{{ t('incidentTracking.sopStatus') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in store.sopDocuments" :key="s.id" :class="{ inactive: !s.is_active }">
          <td>{{ s.title }}</td>
          <td>{{ hazardDisplayName(s.hazard_type_code) }}</td>
          <td>{{ s.is_active ? t('incidentTracking.sopActive') : t('incidentTracking.sopInactive') }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(s)">{{ t('incidentTracking.sopEdit') }}</button>
            <button class="btn-link" @click="toggleActive(s)">{{ s.is_active ? t('incidentTracking.sopDeactivate') : t('incidentTracking.sopReactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!store.sopDocuments.length"><td colspan="4" class="empty-row">{{ t('incidentTracking.sopEmpty') }}</td></tr>
      </tbody>
    </table>

    <SopDocumentFormModal
      v-if="showForm"
      :sop-document="editingSop"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>
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
</style>
