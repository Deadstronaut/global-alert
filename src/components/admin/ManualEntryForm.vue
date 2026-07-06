<script setup>
import { ref, computed } from 'vue'
import { supabase } from '@/services/api/config.js'
import { buildEventRow } from '@/utils/severity.js'
import { useAuthStore } from '@/stores/auth.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'

// spec 010: display list is sourced from the hazard taxonomy registry, but
// intersected with the hazard types that actually have a dedicated table
// (TABLE_MAP) — unlike ContactFormModal/CapView/IncidentsView, this form
// can't offer tsunami/cyclone/volcano/epidemic etc. even if a super_admin
// activates them in the registry, since no dedicated table exists for them
// yet (that's a separate, larger backend change, out of this spec's scope).
const TABLE_MAP = { earthquake: 'earthquake', wildfire: 'wildfire', flood: 'flood', drought: 'drought', food_security: 'food_security' }
const hazardTypesStore = useHazardTypesStore()
const HAZARD_TYPES = computed(() =>
  hazardTypesStore.activeHazardTypes.filter((h) => TABLE_MAP[h.code]),
)

const auth = useAuthStore()

function blankForm() {
  return {
    hazard_type: 'earthquake',
    lat: '', lng: '', magnitude: '', depth: '',
    title: '', description: '',
    time: new Date().toISOString().slice(0, 16),
    source: 'Manual Entry',
    country_code: auth.countryCode || '',
  }
}

const form = ref(blankForm())
const saving = ref(false)
const error = ref(null)
const success = ref(null)

async function submit() {
  saving.value = true
  error.value = null
  success.value = null
  try {
    const row = buildEventRow({
      id: `manual-${Date.now()}`,
      type: form.value.hazard_type,
      lat: form.value.lat,
      lng: form.value.lng,
      magnitude: form.value.magnitude || null,
      depth: form.value.depth || null,
      title: form.value.title,
      description: form.value.description,
      time: form.value.time,
      source: form.value.source,
      countryCode: form.value.country_code.trim().toLowerCase() || null,
    })
    const { error: err } = await supabase.from(TABLE_MAP[form.value.hazard_type]).insert(row)
    if (err) throw err
    success.value = 'Olay eklendi.'
    form.value = blankForm()
  } catch (err) {
    error.value = err.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="form-card">
    <div class="form-grid">
      <label class="form-field"><span>Afet Tipi *</span>
        <select v-model="form.hazard_type">
          <option v-for="t in HAZARD_TYPES" :key="t.code" :value="t.code">{{ t.display_name }}</option>
        </select>
      </label>
      <label class="form-field"><span>Ülke Kodu</span>
        <input v-model="form.country_code" placeholder="tr" maxlength="2" />
      </label>
      <label class="form-field"><span>Enlem (lat) *</span>
        <input v-model="form.lat" type="number" step="any" placeholder="39.92" />
      </label>
      <label class="form-field"><span>Boylam (lng) *</span>
        <input v-model="form.lng" type="number" step="any" placeholder="32.85" />
      </label>
      <label class="form-field"><span>Büyüklük/Şiddet</span>
        <input v-model="form.magnitude" type="number" step="any" placeholder="opsiyonel" />
      </label>
      <label class="form-field"><span>Derinlik (km)</span>
        <input v-model="form.depth" type="number" step="any" placeholder="opsiyonel" />
      </label>
      <label class="form-field"><span>Zaman *</span>
        <input v-model="form.time" type="datetime-local" />
      </label>
      <label class="form-field"><span>Kaynak</span>
        <input v-model="form.source" placeholder="örn. AFAD Saha Raporu" />
      </label>
      <label class="form-field span-2"><span>Başlık</span>
        <input v-model="form.title" placeholder="opsiyonel" />
      </label>
      <label class="form-field span-2"><span>Açıklama</span>
        <input v-model="form.description" placeholder="opsiyonel" />
      </label>
    </div>
    <div class="form-actions">
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="success" class="form-success">{{ success }}</div>
      <button class="btn-submit" :disabled="saving || !form.lat || !form.lng" @click="submit">
        {{ saving ? 'Ekleniyor...' : '💾 Olay Ekle' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.form-card { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
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
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.form-success { color: #22c55e; font-size: .8rem; flex: 1; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
