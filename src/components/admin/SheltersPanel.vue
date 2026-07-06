<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSheltersStore, occupancyPercentage } from '@/stores/shelters.js'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import ShelterFormModal from './ShelterFormModal.vue'

const { t } = useI18n()
const store = useSheltersStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingShelter = ref(null)
const formError = ref(null)

// FR-006/FR-007: write access is role-based (not spec 018's capability-grant
// system, per research.md Decision 5) — country_admin/org_admin are further
// scoped to their own country by RLS itself, this is only the UI-level
// convenience gate.
const canManage = computed(() =>
  auth.isSuperAdmin || auth.session?.role === 'country_admin' || auth.session?.role === 'org_admin',
)

// FR-008: a viewer (or any account without manage access) only ever sees
// active shelters — inactive/deactivated ones are an admin-management
// concern, not part of the public "current shelter availability" view.
// Admins with write access see both (to be able to reactivate).
const visibleShelters = computed(() =>
  canManage.value ? store.shelters : store.shelters.filter((s) => s.is_active),
)

// T018: resolve linked_incident_id -> title for display, via a simple
// lookup fetched alongside the shelter list (no dedicated incidents store
// exists in this project — IncidentsView.vue queries Supabase directly too).
const incidentTitles = ref({})

async function loadIncidentTitles() {
  const { data } = await supabase.from('incidents').select('id, title')
  incidentTitles.value = Object.fromEntries((data ?? []).map((i) => [i.id, i.title]))
}

onMounted(() => {
  store.fetchShelters()
  loadIncidentTitles()
})

function openCreate() {
  editingShelter.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(shelter) {
  editingShelter.value = shelter
  formError.value = null
  showForm.value = true
}

async function handleSave(payload) {
  try {
    if (editingShelter.value) {
      await store.updateShelter(editingShelter.value.id, payload)
    } else {
      await store.createShelter(payload)
    }
    showForm.value = false
  } catch (err) {
    formError.value = /chk_shelter_capacity_positive/i.test(err.message)
      ? t('shelters.capacityTotalInvalid')
      : /chk_shelter_capacity\b/i.test(err.message)
        ? t('shelters.occupancyExceedsCapacity')
        : err.message
  }
}

async function toggleActive(shelter) {
  if (shelter.is_active) await store.deactivateShelter(shelter.id)
  else await store.reactivateShelter(shelter.id)
}
</script>

<template>
  <div class="shelters-panel">
    <div class="panel-header">
      <h3>{{ t('shelters.tabLabel') }}</h3>
      <button v-if="canManage" class="btn-submit" @click="openCreate">{{ t('shelters.addButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="shelters-table">
      <thead>
        <tr>
          <th>{{ t('shelters.name') }}</th><th>{{ t('shelters.country') }}</th>
          <th>{{ t('shelters.capacity') }}</th><th>{{ t('shelters.occupancyPercent') }}</th>
          <th>{{ t('shelters.status') }}</th><th>{{ t('shelters.linkedIncident') }}</th>
          <th v-if="canManage"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in visibleShelters" :key="s.id" :class="{ inactive: !s.is_active }">
          <td>{{ s.name }}</td>
          <td>{{ s.country_code.toUpperCase() }}</td>
          <td>{{ s.capacity_occupied }} / {{ s.capacity_total }}</td>
          <td>{{ occupancyPercentage(s) }}%</td>
          <td>{{ t(`shelters.statusOptions.${s.status}`) }}</td>
          <td>{{ s.linked_incident_id ? (incidentTitles[s.linked_incident_id] || '—') : '—' }}</td>
          <td v-if="canManage" class="row-actions">
            <button class="btn-link" @click="openEdit(s)">{{ t('shelters.edit') }}</button>
            <button class="btn-link" @click="toggleActive(s)">{{ s.is_active ? t('shelters.deactivate') : t('shelters.reactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!visibleShelters.length"><td :colspan="canManage ? 7 : 6" class="empty-row">{{ t('shelters.empty') }}</td></tr>
      </tbody>
    </table>

    <ShelterFormModal
      v-if="showForm"
      :shelter="editingShelter"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>
  </div>
</template>

<style scoped>
.shelters-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.shelters-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.shelters-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.shelters-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.shelters-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.form-error { color: #ef4444; font-size: .8rem; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-inline-error { margin-top: 8px; }
</style>
