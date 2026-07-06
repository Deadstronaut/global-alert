<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import countries from '@/configs/countries.json'

const props = defineProps({
  shelter: { type: Object, default: null }, // null = create mode
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()
const auth = useAuthStore()

const STATUSES = ['open', 'closed', 'full']

const name = ref('')
const countryCode = ref(auth.isSuperAdmin ? '' : (auth.countryCode || ''))
const lat = ref('')
const lng = ref('')
const capacityTotal = ref(0)
const capacityOccupied = ref(0)
const status = ref('open')
const linkedIncidentId = ref('')
const saving = ref(false)
const error = ref(null)

// FR-009/FR-010: open incidents in the shelter's own country, for the
// optional incident-association selector. No dedicated incidents Pinia
// store exists in this project (IncidentsView.vue queries Supabase
// directly) — this modal does the same, scoped to non-closed/archived
// incidents in the shelter's own country.
const openIncidents = ref([])

async function loadOpenIncidents(country) {
  if (!country) { openIncidents.value = []; return }
  const { data } = await supabase
    .from('incidents')
    .select('id, title, status')
    .eq('country_code', country)
    .in('status', ['open', 'in_progress', 'monitoring'])
    .order('title')
  openIncidents.value = data ?? []
}

onMounted(() => loadOpenIncidents(countryCode.value))
watch(countryCode, (c) => loadOpenIncidents(c))

const countryOptions = computed(() =>
  Object.entries(countries)
    .map(([code, c]) => ({ code, name: c.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

watch(
  () => props.shelter,
  (s) => {
    name.value = s?.name ?? ''
    countryCode.value = s ? s.country_code : (auth.isSuperAdmin ? '' : (auth.countryCode || ''))
    lat.value = s?.lat ?? ''
    lng.value = s?.lng ?? ''
    capacityTotal.value = s?.capacity_total ?? 0
    capacityOccupied.value = s?.capacity_occupied ?? 0
    status.value = s?.status ?? 'open'
    linkedIncidentId.value = s?.linked_incident_id ?? ''
    error.value = null
  },
  { immediate: true },
)

function save() {
  error.value = null
  if (!name.value.trim()) { error.value = t('shelters.nameRequired'); return }
  if (!countryCode.value) { error.value = t('shelters.noCountry'); return }
  if (!Number(capacityTotal.value) || Number(capacityTotal.value) <= 0) {
    error.value = t('shelters.capacityTotalInvalid')
    return
  }
  // Client-side hint only — the database's CHECK constraint is the actual
  // guarantee (research.md Decision 3); this just avoids a round trip for
  // the common mistake.
  if (Number(capacityOccupied.value) > Number(capacityTotal.value)) {
    error.value = t('shelters.occupancyExceedsCapacity')
    return
  }

  saving.value = true
  emit('save', {
    name: name.value.trim(),
    country_code: countryCode.value.trim().toLowerCase(),
    lat: lat.value !== '' ? Number(lat.value) : null,
    lng: lng.value !== '' ? Number(lng.value) : null,
    capacity_total: Number(capacityTotal.value),
    capacity_occupied: Number(capacityOccupied.value),
    status: status.value,
    linked_incident_id: linkedIncidentId.value || null,
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ shelter ? t('shelters.editTitle') : t('shelters.createTitle') }}</h3>

      <div class="form-grid">
        <label class="form-field span-2"><span>{{ t('shelters.name') }} *</span>
          <input v-model="name" />
        </label>
        <label class="form-field"><span>{{ t('shelters.country') }} *</span>
          <select v-if="auth.isSuperAdmin" v-model="countryCode">
            <option value="">— seç —</option>
            <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }} ({{ c.code }})</option>
          </select>
          <input v-else :value="countryCode.toUpperCase()" disabled />
        </label>
        <label class="form-field"><span>{{ t('shelters.status') }}</span>
          <select v-model="status">
            <option v-for="s in STATUSES" :key="s" :value="s">{{ t(`shelters.statusOptions.${s}`) }}</option>
          </select>
        </label>
        <label class="form-field"><span>{{ t('shelters.lat') }}</span>
          <input v-model="lat" type="number" step="any" />
        </label>
        <label class="form-field"><span>{{ t('shelters.lng') }}</span>
          <input v-model="lng" type="number" step="any" />
        </label>
        <label class="form-field"><span>{{ t('shelters.capacityTotal') }} *</span>
          <input v-model="capacityTotal" type="number" min="1" step="1" />
        </label>
        <label class="form-field"><span>{{ t('shelters.capacityOccupied') }}</span>
          <input v-model="capacityOccupied" type="number" min="0" step="1" />
        </label>
        <label class="form-field span-2"><span>{{ t('shelters.linkedIncident') }}</span>
          <select v-model="linkedIncidentId">
            <option value="">{{ t('shelters.noLinkedIncident') }}</option>
            <option v-for="inc in openIncidents" :key="inc.id" :value="inc.id">{{ inc.title }}</option>
          </select>
        </label>
      </div>

      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('shelters.cancel') }}</button>
        <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('shelters.save') }}</button>
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
.form-error { color: #ef4444; font-size: .8rem; margin-top: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
