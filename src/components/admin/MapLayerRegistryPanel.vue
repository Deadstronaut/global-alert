<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMapLayersStore } from '@/stores/mapLayers.js'
import MapLayerFormModal from './MapLayerFormModal.vue'

const { t } = useI18n()
const store = useMapLayersStore()

const showForm = ref(false)
const editingLayer = ref(null)
const formError = ref(null)

onMounted(() => {
  if (!store.loaded) store.fetchMapLayers()
})

function openCreate() {
  editingLayer.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(l) {
  editingLayer.value = l
  formError.value = null
  showForm.value = true
}

async function handleSave(payload) {
  try {
    if (editingLayer.value) {
      await store.updateMapLayer(editingLayer.value.id, payload)
    } else {
      await store.createMapLayer(payload)
    }
    showForm.value = false
  } catch (err) {
    formError.value = err.message === 'unsafe_endpoint_url' ? t('mapLayers.unsafeUrl') : err.message
  }
}

async function toggleActive(l) {
  if (l.is_active) await store.deactivateMapLayer(l.id)
  else await store.reactivateMapLayer(l.id)
}
</script>

<template>
  <div class="map-layer-registry-panel">
    <div class="panel-header">
      <h3>{{ t('mapLayers.tabLabel') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('mapLayers.addButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="layer-table">
      <thead>
        <tr>
          <th>{{ t('mapLayers.displayName') }}</th><th>{{ t('mapLayers.sourceType') }}</th>
          <th>{{ t('mapLayers.status') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="l in store.mapLayers" :key="l.id" :class="{ inactive: !l.is_active }">
          <td>{{ l.display_name }}</td>
          <td>{{ l.source_type.toUpperCase() }}</td>
          <td>{{ l.is_active ? t('mapLayers.active') : t('mapLayers.inactive') }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(l)">{{ t('mapLayers.edit') }}</button>
            <button class="btn-link" @click="toggleActive(l)">{{ l.is_active ? t('mapLayers.deactivate') : t('mapLayers.reactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!store.mapLayers.length"><td colspan="4" class="empty-row">{{ t('mapLayers.empty') }}</td></tr>
      </tbody>
    </table>

    <MapLayerFormModal
      v-if="showForm"
      :map-layer="editingLayer"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>
  </div>
</template>

<style scoped>
.map-layer-registry-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.layer-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.layer-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.layer-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.layer-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.form-error { color: #ef4444; font-size: .8rem; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-inline-error { margin-top: 8px; }
</style>
