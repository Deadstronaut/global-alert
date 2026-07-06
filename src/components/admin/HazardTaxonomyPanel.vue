<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useAuthStore } from '@/stores/auth.js'
import HazardTypeFormModal from './HazardTypeFormModal.vue'
import HazardThresholdEditor from './HazardThresholdEditor.vue'

const { t } = useI18n()
const store = useHazardTypesStore()
const auth = useAuthStore()

const showTypeForm = ref(false)
const editingType = ref(null)
const typeFormError = ref(null)

const showThresholdEditor = ref(false)
const editingThresholdCode = ref(null)

onMounted(() => {
  if (!store.loaded) store.fetchHazardTypes()
})

// spec 020: this panel is only reachable by Super Admin or a hazard_taxonomy
// capability holder (AdminView.vue's hasCapability() tab gate, spec 018) — no
// separate access check needed here, only which view to render.
const overrideCountryCode = ref(auth.isSuperAdmin ? '' : auth.countryCode)

const showOverrideEditor = ref(false)
const editingOverrideCode = ref(null)
const overrideEditorCountry = ref(null)
const overrideError = ref(null)

function openOverride(hazardTypeCode, countryCode) {
  overrideError.value = null
  editingOverrideCode.value = hazardTypeCode
  overrideEditorCountry.value = countryCode
  showOverrideEditor.value = true
}

async function handleSaveOverride(payload) {
  try {
    await store.upsertThresholdOverride(payload.hazard_type_code, payload.country_code, payload)
    showOverrideEditor.value = false
  } catch (err) {
    overrideError.value = err.message
  }
}

async function removeOverride(hazardTypeCode, countryCode) {
  overrideError.value = null
  try {
    await store.removeThresholdOverride(hazardTypeCode, countryCode)
  } catch (err) {
    overrideError.value = err.message
  }
}

function openCreate() {
  editingType.value = null
  typeFormError.value = null
  showTypeForm.value = true
}

function openEdit(h) {
  editingType.value = h
  typeFormError.value = null
  showTypeForm.value = true
}

async function handleSaveType(payload) {
  try {
    if (editingType.value) {
      await store.updateHazardType(editingType.value.code, payload)
    } else {
      await store.createHazardType(payload)
    }
    showTypeForm.value = false
  } catch (err) {
    typeFormError.value = /duplicate key|hazard_types_pkey/i.test(err.message)
      ? t('hazardTaxonomy.duplicateCode')
      : err.message
  }
}

async function toggleActive(h) {
  if (h.is_active) await store.deactivateHazardType(h.code)
  else await store.reactivateHazardType(h.code)
}

function openThresholds(h) {
  editingThresholdCode.value = h.code
  showThresholdEditor.value = true
}

async function handleSaveThresholds(payload) {
  await store.upsertThresholds(payload.hazard_type_code, payload)
  showThresholdEditor.value = false
}
</script>

<template>
  <div class="hazard-taxonomy-panel">
    <div class="panel-header">
      <h3>{{ t('hazardTaxonomy.tabLabel') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('hazardTaxonomy.addButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="hazard-table">
      <thead>
        <tr>
          <th>{{ t('hazardTaxonomy.code') }}</th><th>{{ t('hazardTaxonomy.displayName') }}</th>
          <th>{{ t('hazardTaxonomy.category') }}</th><th>{{ t('hazardTaxonomy.hierarchy.parentColumn') }}</th>
          <th>{{ t('hazardTaxonomy.status') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="h in store.hazardTypes" :key="h.code" :class="{ inactive: !h.is_active }">
          <td>{{ h.code }}</td>
          <td>{{ h.display_name }}</td>
          <td>{{ h.category }}</td>
          <td>{{ store.hazardTypes.find((p) => p.code === h.parent_code)?.display_name ?? '—' }}</td>
          <td>{{ h.is_active ? t('hazardTaxonomy.active') : t('hazardTaxonomy.inactive') }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(h)">{{ t('hazardTaxonomy.edit') }}</button>
            <button class="btn-link" @click="openThresholds(h)">{{ t('hazardTaxonomy.editThresholds') }}</button>
            <button class="btn-link" @click="toggleActive(h)">{{ h.is_active ? t('hazardTaxonomy.deactivate') : t('hazardTaxonomy.reactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!store.hazardTypes.length"><td colspan="6" class="empty-row">{{ t('hazardTaxonomy.empty') }}</td></tr>
      </tbody>
    </table>

    <HazardTypeFormModal
      v-if="showTypeForm"
      :hazard-type="editingType"
      :hazard-types="store.hazardTypes"
      @save="handleSaveType"
      @cancel="showTypeForm = false"
    />
    <div v-if="showTypeForm && typeFormError" class="form-error modal-inline-error">{{ typeFormError }}</div>

    <HazardThresholdEditor
      v-if="showThresholdEditor"
      :hazard-type-code="editingThresholdCode"
      :threshold="store.thresholds[editingThresholdCode] ?? null"
      @save="handleSaveThresholds"
      @cancel="showThresholdEditor = false"
    />

    <div class="country-overrides-section">
      <div class="panel-header">
        <h3>{{ t('hazardTaxonomy.overrides.sectionTitle') }}</h3>
        <input
          v-if="auth.isSuperAdmin"
          :value="overrideCountryCode"
          @input="overrideCountryCode = $event.target.value.toUpperCase().slice(0, 2)"
          class="country-input"
          maxlength="2"
          :placeholder="t('hazardTaxonomy.overrides.countryCodePlaceholder')"
        />
      </div>

      <div v-if="overrideError" class="form-error">{{ overrideError }}</div>

      <table v-if="overrideCountryCode" class="hazard-table">
        <thead>
          <tr>
            <th>{{ t('hazardTaxonomy.code') }}</th>
            <th>{{ t('hazardTaxonomy.overrides.hasOverride') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="h in store.hazardTypes" :key="h.code">
            <td>{{ h.code }}</td>
            <td>{{ store.overrides[overrideCountryCode]?.[h.code] ? t('hazardTaxonomy.overrides.yes') : t('hazardTaxonomy.overrides.no') }}</td>
            <td class="row-actions">
              <button class="btn-link" @click="openOverride(h.code, overrideCountryCode)">
                {{ store.overrides[overrideCountryCode]?.[h.code] ? t('hazardTaxonomy.overrides.edit') : t('hazardTaxonomy.overrides.add') }}
              </button>
              <button
                v-if="store.overrides[overrideCountryCode]?.[h.code]"
                class="btn-link"
                @click="removeOverride(h.code, overrideCountryCode)"
              >{{ t('hazardTaxonomy.overrides.remove') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="tab-loading">{{ t('hazardTaxonomy.overrides.selectCountryHint') }}</p>
    </div>

    <HazardThresholdEditor
      v-if="showOverrideEditor"
      :hazard-type-code="editingOverrideCode"
      :country-code="overrideEditorCountry"
      :threshold="store.overrides[overrideEditorCountry]?.[editingOverrideCode] ?? null"
      @save="handleSaveOverride"
      @cancel="showOverrideEditor = false"
    />
  </div>
</template>

<style scoped>
.hazard-taxonomy-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.hazard-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.hazard-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.hazard-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.hazard-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.form-error { color: #ef4444; font-size: .8rem; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-inline-error { margin-top: 8px; }
.country-overrides-section { margin-top: 28px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.08); }
.country-input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark;
}
.country-input { width: 70px; text-transform: uppercase; margin-left: 8px; }
</style>
