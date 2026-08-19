<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useIntegrationTypesStore } from '@/stores/integrationTypes.js'
import { useIntegrationSettingsStore, formatIntegrationStatus, mergeTemplateAndCustomFields } from '@/stores/integrationSettings.js'
import { useAuthStore } from '@/stores/auth.js'
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingPushSubscription } from '@/utils/webPush.js'

const { t } = useI18n()
const typesStore = useIntegrationTypesStore()
const settingsStore = useIntegrationSettingsStore()
const auth = useAuthStore()

// 2026-08-19: moved here from the retired standalone /portal page — was a
// public/anonymous opt-in there, now lives alongside the other dissemination
// channel settings (WhatsApp etc. above) instead of its own separate page.
// Subscribes THIS browser (whoever has this panel open) to web push for
// whichever country is currently selected above — same webPush.js utility,
// just scoped to selectedCountry instead of its own country dropdown.
const pushSupported = isPushSupported()
const pushSubscribed = ref(false)
const pushBusy = ref(false)
const pushError = ref(null)

async function refreshPushState() {
  if (!pushSupported) return
  pushSubscribed.value = !!(await getExistingPushSubscription())
}

async function togglePush() {
  pushError.value = null
  pushBusy.value = true
  try {
    if (pushSubscribed.value) {
      await unsubscribeFromPush()
      pushSubscribed.value = false
    } else {
      if (!selectedCountry.value) { pushError.value = t('integrations.noCountry'); return }
      await subscribeToPush({ countryCode: selectedCountry.value })
      pushSubscribed.value = true
    }
  } catch (err) {
    pushError.value = err.message
  } finally {
    pushBusy.value = false
  }
}

const selectedCountry = ref(auth.isSuperAdmin ? '' : (auth.countryCode || ''))
const selectedTypeCode = ref('')
const templateValues = ref({}) // { [fieldKey]: value }
const customFields = ref([]) // [{ name, value }]
const saving = ref(false)
const error = ref(null)
const saved = ref(false)

const selectedType = computed(() => typesStore.activeIntegrationTypes.find((t) => t.code === selectedTypeCode.value) ?? null)

const status = computed(() => {
  const row = settingsStore.settings[selectedCountry.value]?.[selectedTypeCode.value]
  return formatIntegrationStatus(row)
})

onMounted(() => {
  if (!typesStore.loaded) typesStore.fetchIntegrationTypes()
  if (selectedCountry.value) settingsStore.fetchSettings(selectedCountry.value)
  refreshPushState()
})

watch(selectedCountry, (c) => {
  saved.value = false
  error.value = null
  if (c) settingsStore.fetchSettings(c)
})

watch(selectedTypeCode, (code) => {
  saved.value = false
  error.value = null
  templateValues.value = {}
  customFields.value = []
  const type = typesStore.activeIntegrationTypes.find((t) => t.code === code)
  for (const field of type?.field_template ?? []) templateValues.value[field.key] = ''
})

function onCountryInput(e) {
  selectedCountry.value = e.target.value.toLowerCase().slice(0, 2)
}

function addCustomField() {
  customFields.value.push({ name: '', value: '' })
}

function removeCustomField(index) {
  customFields.value.splice(index, 1)
}

async function save() {
  error.value = null
  saved.value = false
  if (!selectedCountry.value) { error.value = t('integrations.noCountry'); return }
  if (!selectedTypeCode.value) { error.value = t('integrations.noType'); return }

  const templateValuesTrimmed = {}
  for (const field of selectedType.value?.field_template ?? []) {
    const value = (templateValues.value[field.key] ?? '').trim()
    if (!value) { error.value = t('integrations.allFieldsRequired'); return }
    templateValuesTrimmed[field.key] = value
  }

  const { fields, errors } = mergeTemplateAndCustomFields(templateValuesTrimmed, customFields.value)
  if (errors.length) { error.value = t('integrations.customFieldIncomplete'); return }

  saving.value = true
  try {
    await settingsStore.saveCredentials(selectedCountry.value, selectedTypeCode.value, fields)
    for (const key of Object.keys(templateValues.value)) templateValues.value[key] = ''
    customFields.value = []
    saved.value = true
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="integrations-panel">
    <div class="panel-header">
      <h3>{{ t('integrations.tabLabel') }}</h3>
      <input
        v-if="auth.isSuperAdmin"
        :value="selectedCountry"
        @input="onCountryInput"
        class="country-input"
        maxlength="2"
        :placeholder="t('integrations.countryCodePlaceholder')"
      />
    </div>

    <template v-if="selectedCountry">
      <div v-if="pushSupported" class="push-optin">
        <template v-if="pushSubscribed">
          <span class="push-status">{{ t('portal.pushSubscribed') }}</span>
          <button class="push-btn push-btn-secondary" :disabled="pushBusy" @click="togglePush">
            {{ pushBusy ? '...' : t('portal.pushUnsubscribe') }}
          </button>
        </template>
        <template v-else>
          <button class="push-btn" :disabled="pushBusy" @click="togglePush">
            {{ pushBusy ? '...' : t('portal.pushSubscribe') }}
          </button>
        </template>
        <p v-if="pushError" class="form-error">{{ pushError }}</p>
      </div>

      <label class="form-field"><span>{{ t('integrations.typeLabel') }}</span>
        <select v-model="selectedTypeCode">
          <option value="">{{ t('integrations.selectType') }}</option>
          <option v-for="ty in typesStore.activeIntegrationTypes" :key="ty.code" :value="ty.code">{{ ty.display_name }}</option>
        </select>
      </label>

      <template v-if="selectedType">
        <p class="status-line">
          <span v-if="status.configured" class="status-badge status-ok">
            {{ t('integrations.configured', { date: new Date(status.updatedAt).toLocaleString() }) }}
          </span>
          <span v-else class="status-badge status-none">{{ t('integrations.notConfigured') }}</span>
          <span v-if="status.configuredFieldKeys.length" class="configured-fields">
            {{ t('integrations.configuredFields', { fields: status.configuredFieldKeys.join(', ') }) }}
          </span>
        </p>

        <div class="form-grid">
          <label v-for="field in selectedType.field_template" :key="field.key" class="form-field">
            <span>{{ field.label }} *</span>
            <input v-model="templateValues[field.key]" type="password" autocomplete="off" :placeholder="t('integrations.credentialValuePlaceholder')" />
          </label>
        </div>

        <div v-if="customFields.length" class="custom-fields">
          <div v-for="(custom, idx) in customFields" :key="idx" class="custom-field-row">
            <input v-model="custom.name" :placeholder="t('integrations.customFieldName')" />
            <input v-model="custom.value" type="password" autocomplete="off" :placeholder="t('integrations.customFieldValue')" />
            <button class="btn-remove" @click="removeCustomField(idx)">×</button>
          </div>
        </div>
        <button class="btn-add-field" @click="addCustomField">{{ t('integrations.addCustomField') }}</button>

        <div v-if="error" class="form-error">{{ error }}</div>
        <div v-if="saved" class="form-success">{{ t('integrations.saveSuccess') }}</div>

        <div class="modal-actions">
          <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('integrations.save') }}</button>
        </div>
      </template>
    </template>
    <p v-else class="tab-loading">{{ t('integrations.selectCountryHint') }}</p>
  </div>
</template>

<style scoped>
.integrations-panel { padding: 4px 0; max-width: 520px; }
.push-optin { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; padding: 10px 12px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; }
.push-status { font-size: .8rem; color: #22c55e; }
.push-btn { padding: 7px 14px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .8rem; }
.push-btn:disabled { opacity: .45; cursor: not-allowed; }
.push-btn-secondary { background: rgba(148,163,184,.15); border-color: rgba(148,163,184,.35); color: #94a3b8; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.country-input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark;
  width: 70px; text-transform: uppercase;
}
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin-bottom: 14px; }
.form-field select, .form-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%; color-scheme: dark;
}
.status-line { margin: 0 0 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.status-badge { display: inline-block; padding: 5px 10px; border-radius: 6px; font-size: .8rem; }
.status-ok { background: rgba(34,197,94,.15); color: #22c55e; }
.status-none { background: rgba(148,163,184,.15); color: #94a3b8; }
.configured-fields { font-size: .75rem; color: var(--color-text-muted,#94a3b8); }
.form-grid { display: flex; flex-direction: column; gap: 12px; }
.custom-fields { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.custom-field-row { display: flex; gap: 8px; align-items: center; }
.custom-field-row input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; flex: 1; color-scheme: dark;
}
.btn-remove { background: none; border: none; color: #ef4444; cursor: pointer; font-size: 1rem; padding: 0 6px; }
.btn-add-field {
  margin-top: 10px; padding: 7px 14px; background: rgba(77,163,255,.12); border: 1px solid rgba(77,163,255,.35);
  border-radius: 8px; color: #4aa3ff; font-size: .8rem; cursor: pointer;
}
.form-error { color: #ef4444; font-size: .8rem; margin-top: 12px; }
.form-success { color: #22c55e; font-size: .8rem; margin-top: 12px; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 18px; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
