<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import countries from '@/configs/countries.json'

const props = defineProps({
  contact: { type: Object, default: null }, // null = create mode
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()
const auth = useAuthStore()
const hazardTypesStore = useHazardTypesStore()

const LANGUAGES = ['tr', 'en', 'es', 'fr', 'ru', 'ar', 'zh']
// spec 010: sourced from the hazard taxonomy registry (with a bundled
// fallback baked into the store itself) instead of a hardcoded local list.
const HAZARD_TYPES = computed(() => hazardTypesStore.activeHazardTypes)

const fullName = ref('')
const email = ref('')
const whatsappNumber = ref('')
const preferredLanguage = ref('en')
const countryCode = ref(auth.isSuperAdmin ? '' : (auth.countryCode || ''))
const regionCode = ref('')
const lat = ref('')
const lng = ref('')
const hazardTypeFilter = ref('')
const emailOptIn = ref(true)
const whatsappOptIn = ref(true)
const saving = ref(false)
const error = ref(null)

const countryOptions = computed(() =>
  Object.entries(countries)
    .map(([code, c]) => ({ code, name: c.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

watch(
  () => props.contact,
  (c) => {
    fullName.value = c?.full_name ?? ''
    email.value = c?.email ?? ''
    whatsappNumber.value = c?.whatsapp_number ?? ''
    preferredLanguage.value = c?.preferred_language ?? 'en'
    countryCode.value = c ? c.country_code : (auth.isSuperAdmin ? '' : (auth.countryCode || ''))
    regionCode.value = c?.region_code ?? ''
    lat.value = c?.lat != null ? String(c.lat) : ''
    lng.value = c?.lng != null ? String(c.lng) : ''
    hazardTypeFilter.value = c?.hazard_type_filter ?? ''
    emailOptIn.value = c?.email_opt_in ?? true
    whatsappOptIn.value = c?.whatsapp_opt_in ?? true
    error.value = null
  },
  { immediate: true },
)

const hasChannel = computed(() => !!email.value.trim() || !!whatsappNumber.value.trim())

function save() {
  error.value = null
  if (!fullName.value.trim()) { error.value = t('contacts.fullName') + ' *'; return }
  if (!hasChannel.value) { error.value = t('contacts.atLeastOneChannel'); return }
  if (whatsappNumber.value && !/^\+[1-9]\d{6,14}$/.test(whatsappNumber.value.trim())) {
    error.value = t('contacts.invalidWhatsapp')
    return
  }
  if (!countryCode.value) { error.value = t('contacts.noCountry'); return }
  if ((lat.value !== '') !== (lng.value !== '')) { error.value = t('contacts.latLngBothRequired'); return }
  if (lat.value !== '' && (Number(lat.value) < -90 || Number(lat.value) > 90)) { error.value = t('contacts.invalidLat'); return }
  if (lng.value !== '' && (Number(lng.value) < -180 || Number(lng.value) > 180)) { error.value = t('contacts.invalidLng'); return }

  saving.value = true
  emit('save', {
    full_name: fullName.value.trim(),
    email: email.value.trim() || null,
    whatsapp_number: whatsappNumber.value.trim() || null,
    preferred_language: preferredLanguage.value,
    country_code: countryCode.value.trim().toLowerCase(),
    region_code: regionCode.value.trim() || null,
    lat: lat.value !== '' ? Number(lat.value) : null,
    lng: lng.value !== '' ? Number(lng.value) : null,
    hazard_type_filter: hazardTypeFilter.value || null,
    email_opt_in: emailOptIn.value,
    whatsapp_opt_in: whatsappOptIn.value,
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ contact ? t('contacts.editTitle') : t('contacts.createTitle') }}</h3>

      <div class="form-grid">
        <label class="form-field span-2"><span>{{ t('contacts.fullName') }} *</span>
          <input v-model="fullName" :placeholder="t('contacts.fullNamePlaceholder')" />
        </label>
        <label class="form-field"><span>{{ t('contacts.email') }}</span>
          <input v-model="email" type="email" :placeholder="t('contacts.emailPlaceholder')" />
        </label>
        <label class="form-field"><span>{{ t('contacts.whatsapp') }}</span>
          <input v-model="whatsappNumber" placeholder="+905551234567" />
        </label>
        <label class="form-field"><span>{{ t('contacts.language') }}</span>
          <select v-model="preferredLanguage">
            <option v-for="l in LANGUAGES" :key="l" :value="l">{{ l }}</option>
          </select>
        </label>
        <label class="form-field"><span>{{ t('contacts.hazardFilter') }}</span>
          <select v-model="hazardTypeFilter">
            <option value="">{{ t('contacts.allHazards') }}</option>
            <option v-for="h in HAZARD_TYPES" :key="h.code" :value="h.code">{{ h.display_name }}</option>
          </select>
        </label>
        <label class="form-field"><span>{{ t('contacts.country') }} *</span>
          <select v-if="auth.isSuperAdmin" v-model="countryCode">
            <option value="">— seç —</option>
            <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }} ({{ c.code }})</option>
          </select>
          <input v-else :value="countryCode.toUpperCase()" disabled />
        </label>
        <label class="form-field"><span>{{ t('contacts.region') }}</span>
          <input v-model="regionCode" placeholder="opsiyonel" />
        </label>
        <label class="form-field"><span>{{ t('contacts.lat') }}</span>
          <input v-model="lat" type="number" step="any" placeholder="opsiyonel" />
        </label>
        <label class="form-field"><span>{{ t('contacts.lng') }}</span>
          <input v-model="lng" type="number" step="any" placeholder="opsiyonel" />
        </label>
        <label class="form-checkbox"><input type="checkbox" v-model="emailOptIn" /> {{ t('contacts.emailOptIn') }}</label>
        <label class="form-checkbox"><input type="checkbox" v-model="whatsappOptIn" /> {{ t('contacts.whatsappOptIn') }}</label>
      </div>

      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('contacts.cancel') }}</button>
        <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('contacts.save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 520px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
.modal-card h3 { margin: 0 0 16px; color: #e2e8f0; }
.form-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2 { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%;
}
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus, .form-field select:focus { outline: none; border-color: rgba(77,163,255,.5); }
.form-checkbox { display: flex; align-items: center; gap: 8px; font-size: .82rem; color: #cbd5e1; }
.form-error { color: #ef4444; font-size: .8rem; margin-top: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
