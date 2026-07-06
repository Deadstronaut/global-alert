<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useContactsStore } from '@/stores/contacts.js'
import { useAuthStore } from '@/stores/auth.js'
import { parseDataFile, SUPPORTED_EXTENSIONS } from '@/utils/fileParsers.js'
import ContactFormModal from './ContactFormModal.vue'

const { t } = useI18n()
const store = useContactsStore()
const auth = useAuthStore()

const showForm = ref(false)
const editingContact = ref(null)
const formError = ref(null)

// CSV bulk import (FR-003) — reuses the same parseDataFile/chunked-upsert
// pattern as FileImportForm.vue, mapped to the contacts columns instead of
// a disaster-event table.
const CONTACT_MAPPABLE_FIELDS = [
  { key: 'full_name', label: 'Ad Soyad *' },
  { key: 'email', label: 'E-posta' },
  { key: 'whatsapp_number', label: 'WhatsApp (E.164)' },
  { key: 'preferred_language', label: 'Dil' },
  { key: 'country_code', label: 'Ülke Kodu' },
  { key: 'region_code', label: 'Bölge Kodu' },
  { key: 'hazard_type_filter', label: 'Afet Tipi Filtresi' },
]
const importFileName = ref('')
const importHeaders = ref([])
const importRecords = ref([])
const importFieldMap = ref({})
const importing = ref(false)
const importParsing = ref(false)
const importError = ref(null)
const importResult = ref(null)

onMounted(() => store.fetchContacts())

function openCreate() {
  editingContact.value = null
  formError.value = null
  showForm.value = true
}

function openEdit(contact) {
  editingContact.value = contact
  formError.value = null
  showForm.value = true
}

async function handleSave(payload) {
  try {
    if (editingContact.value) {
      await store.updateContact(editingContact.value.id, payload)
    } else {
      await store.createContact(payload)
    }
    showForm.value = false
  } catch (err) {
    // Surface a duplicate-contact unique-constraint violation as a clear
    // message rather than a raw Postgres error string (edge case, FR-003).
    formError.value = /duplicate key|idx_contacts_email_country_unique/i.test(err.message)
      ? t('contacts.duplicateError')
      : err.message
  }
}

async function toggleActive(contact) {
  if (contact.is_active) await store.deactivateContact(contact.id)
  else await store.reactivateContact(contact.id)
}

async function onImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  importFileName.value = file.name
  importResult.value = null
  importError.value = null
  importHeaders.value = []
  importRecords.value = []
  importParsing.value = true
  try {
    const { headers, records } = await parseDataFile(file)
    importHeaders.value = headers
    importRecords.value = records
    importFieldMap.value = {}
    for (const f of CONTACT_MAPPABLE_FIELDS) {
      const match = headers.find((col) => col.toLowerCase() === f.key.toLowerCase())
      if (match) importFieldMap.value[f.key] = match
    }
  } catch (err) {
    importError.value = err.message
  } finally {
    importParsing.value = false
  }
}

function buildContactRow(rec) {
  const get = (key) => (importFieldMap.value[key] ? rec[importFieldMap.value[key]] : null)
  const fullName = get('full_name')
  const email = get('email')
  const whatsapp = get('whatsapp_number')
  const countryCode = (get('country_code') || auth.countryCode || '').toString().trim().toLowerCase()

  if (!fullName || !String(fullName).trim()) return { valid: false, reason: 'full_name eksik' }
  if (!email && !whatsapp) return { valid: false, reason: 'email veya whatsapp_number gerekli' }
  if (whatsapp && !/^\+[1-9]\d{6,14}$/.test(String(whatsapp).trim())) {
    return { valid: false, reason: `geçersiz whatsapp_number: ${whatsapp}` }
  }
  if (!countryCode) return { valid: false, reason: 'country_code eksik' }

  return {
    valid: true,
    row: {
      full_name: String(fullName).trim(),
      email: email ? String(email).trim() : null,
      whatsapp_number: whatsapp ? String(whatsapp).trim() : null,
      preferred_language: get('preferred_language') || 'en',
      country_code: countryCode,
      region_code: get('region_code') || null,
      hazard_type_filter: get('hazard_type_filter') || null,
    },
  }
}

async function runImport() {
  importing.value = true
  importError.value = null
  importResult.value = null
  try {
    const rows = []
    const rejected = []
    for (const rec of importRecords.value) {
      const check = buildContactRow(rec)
      if (!check.valid) { rejected.push({ raw: rec, reason: check.reason }); continue }
      rows.push(check.row)
    }

    let inserted = 0
    const errors = []
    // Insert one row at a time (not a chunked upsert) so a single duplicate
    // (unique-constraint) row doesn't abort the rest of the batch — mirrors
    // FR-010's "one failure doesn't abort the batch" principle applied to
    // import instead of dispatch.
    for (const row of rows) {
      try {
        await store.createContact(row)
        inserted += 1
      } catch (err) {
        const reason = /duplicate key|idx_contacts_email_country_unique/i.test(err.message)
          ? t('contacts.duplicateError')
          : err.message
        errors.push({ raw: row, reason })
      }
    }

    importResult.value = {
      inserted,
      rejected: rejected.length + errors.length,
      rejectedSample: [...rejected, ...errors].slice(0, 5),
    }
  } catch (err) {
    importError.value = err.message
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="contacts-panel">
    <div class="panel-header">
      <h3>{{ t('contacts.tabLabel') }}</h3>
      <button class="btn-submit" @click="openCreate">{{ t('contacts.addButton') }}</button>
    </div>

    <div v-if="store.error" class="form-error">{{ store.error }}</div>
    <div v-if="store.loading" class="tab-loading">...</div>

    <table v-else class="contacts-table">
      <thead>
        <tr>
          <th>{{ t('contacts.fullName') }}</th><th>{{ t('contacts.email') }}</th><th>{{ t('contacts.whatsapp') }}</th>
          <th>{{ t('contacts.country') }}</th><th>{{ t('contacts.channels') }}</th><th>{{ t('contacts.status') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in store.contacts" :key="c.id" :class="{ inactive: !c.is_active }">
          <td>{{ c.full_name }}</td>
          <td>{{ c.email || '—' }}</td>
          <td>{{ c.whatsapp_number || '—' }}</td>
          <td>{{ c.country_code.toUpperCase() }}</td>
          <td>
            <span v-if="c.email_opt_in" class="badge badge-ok">{{ t('contacts.email') }}</span>
            <span v-if="c.whatsapp_opt_in" class="badge badge-ok">{{ t('contacts.whatsapp') }}</span>
          </td>
          <td>{{ c.is_active ? t('contacts.active') : t('contacts.inactive') }}</td>
          <td class="row-actions">
            <button class="btn-link" @click="openEdit(c)">{{ t('contacts.edit') }}</button>
            <button class="btn-link" @click="toggleActive(c)">{{ c.is_active ? t('contacts.deactivate') : t('contacts.reactivate') }}</button>
          </td>
        </tr>
        <tr v-if="!store.contacts.length"><td colspan="7" class="empty-row">{{ t('contacts.empty') }}</td></tr>
      </tbody>
    </table>

    <ContactFormModal
      v-if="showForm"
      :contact="editingContact"
      @save="handleSave"
      @cancel="showForm = false"
    />
    <div v-if="showForm && formError" class="form-error modal-inline-error">{{ formError }}</div>

    <div class="import-section">
      <h4>{{ t('contacts.importTitle') }}</h4>
      <label class="form-field span-2"><span>{{ t('contacts.importFile') }}</span>
        <input type="file" :accept="SUPPORTED_EXTENSIONS" @change="onImportFile" />
      </label>
      <div v-if="importParsing" class="tab-loading">...</div>
      <div v-if="importHeaders.length" class="mapping-section">
        <p class="mapping-hint">{{ importFileName }} — {{ importRecords.length }}</p>
        <div class="mapping-grid">
          <template v-for="f in CONTACT_MAPPABLE_FIELDS" :key="f.key">
            <span class="mapping-label">{{ f.label }}</span>
            <select v-model="importFieldMap[f.key]">
              <option value="">—</option>
              <option v-for="h in importHeaders" :key="h" :value="h">{{ h }}</option>
            </select>
          </template>
        </div>
      </div>
      <div class="form-actions">
        <div v-if="importError" class="form-error">{{ importError }}</div>
        <div v-if="importResult" class="form-success">
          {{ importResult.inserted }} / {{ importResult.rejected }}
          <span v-if="importResult.rejectedSample.length">
            ({{ importResult.rejectedSample.map((r) => r.reason).join('; ') }})
          </span>
        </div>
        <button class="btn-submit" :disabled="importing || !importRecords.length" @click="runImport">
          {{ importing ? t('contacts.importing') : t('contacts.importButton') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contacts-panel { padding: 4px 0; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.panel-header h3 { margin: 0; color: #e2e8f0; }
.contacts-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.contacts-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.contacts-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.contacts-table tr.inactive td { opacity: .5; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.badge { display: inline-block; padding: 2px 7px; border-radius: 6px; font-size: .7rem; margin-right: 4px; }
.badge-ok { background: rgba(34,197,94,.15); color: #22c55e; }
.row-actions { display: flex; gap: 10px; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
.form-error { color: #ef4444; font-size: .8rem; }
.form-success { color: #22c55e; font-size: .8rem; flex: 1; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); margin-top: 10px; }
.import-section { margin-top: 26px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,.08); }
.import-section h4 { margin: 0 0 10px; color: #e2e8f0; font-size: .92rem; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%; }
.mapping-section { margin-top: 14px; padding: 14px; background: rgba(77,163,255,.05); border: 1px dashed rgba(77,163,255,.3); border-radius: 10px; }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 8px; }
.mapping-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }
.mapping-label { font-size: .78rem; color: var(--color-text-muted,#94a3b8); white-space: nowrap; }
.mapping-grid select { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark; }
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.modal-inline-error { margin-top: 8px; }
</style>
