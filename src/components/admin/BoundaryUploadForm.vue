<script setup>
import { ref, computed } from 'vue'
import { supabase } from '@/services/api/config.js'
import { useAuthStore } from '@/stores/auth.js'
import { invalidateRegionCache } from '@/data/boundaries/index.js'
import countries from '@/configs/countries.json'

const auth = useAuthStore()

const countryCode = ref(auth.isSuperAdmin ? '' : (auth.countryCode || ''))
const nameProperty = ref('')
const fileName = ref('')
const parsed = ref(null) // { type, features }
const propertyKeys = ref([])
const uploading = ref(false)
const error = ref(null)
const success = ref(null)

const countryOptions = computed(() =>
  Object.entries(countries)
    .map(([code, c]) => ({ code, name: c.nameEn }))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  fileName.value = file.name
  error.value = null
  success.value = null
  parsed.value = null
  propertyKeys.value = []
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result))
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) {
        throw new Error('Geçerli bir GeoJSON FeatureCollection değil (features dizisi bulunamadı)')
      }
      const badGeom = data.features.find((f) => !['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
      if (badGeom) throw new Error('Sadece Polygon/MultiPolygon geometrileri destekleniyor')
      parsed.value = data
      propertyKeys.value = Object.keys(data.features[0].properties || {})
      nameProperty.value = propertyKeys.value.find((k) => /name/i.test(k)) || propertyKeys.value[0] || ''
    } catch (err) {
      error.value = err.message
    }
  }
  reader.readAsText(file)
}

async function upload() {
  uploading.value = true
  error.value = null
  success.value = null
  try {
    const cc = countryCode.value.trim().toLowerCase()
    if (!cc) throw new Error('Ülke seçilmedi')
    const { error: err } = await supabase.from('country_boundaries').upsert({
      country_code: cc,
      name_property: nameProperty.value,
      geojson: parsed.value,
      uploaded_by: auth.session?.id,
    })
    if (err) throw err
    invalidateRegionCache(cc)
    success.value = `${parsed.value.features.length} bölge yüklendi (${cc.toUpperCase()}).`
    parsed.value = null
    fileName.value = ''
  } catch (err) {
    error.value = err.message
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="form-card">
    <div class="form-grid">
      <label class="form-field">
        <span>Ülke *</span>
        <select v-if="auth.isSuperAdmin" v-model="countryCode">
          <option value="">— seç —</option>
          <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }} ({{ c.code }})</option>
        </select>
        <input v-else :value="countryCode.toUpperCase()" disabled />
      </label>
      <label class="form-field span-2">
        <span>Sınır Dosyası (GeoJSON) *</span>
        <input type="file" accept=".geojson,.json,application/geo+json" @change="onFile" />
      </label>
    </div>

    <div v-if="parsed" class="mapping-section">
      <p class="mapping-hint">
        {{ fileName }} — {{ parsed.features.length }} bölge bulundu. Bölge adı hangi alanda?
      </p>
      <div class="mapping-grid">
        <span class="mapping-label">İsim Alanı</span>
        <select v-model="nameProperty">
          <option v-for="k in propertyKeys" :key="k" :value="k">{{ k }}</option>
        </select>
      </div>
      <p class="mapping-hint">
        Örnek: {{ parsed.features.slice(0, 5).map((f) => f.properties[nameProperty]).join(', ') }}
      </p>
    </div>

    <div class="form-actions">
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="success" class="form-success">{{ success }}</div>
      <button
        class="btn-submit"
        :disabled="uploading || !parsed || !countryCode || !nameProperty"
        @click="upload"
      >
        {{ uploading ? 'Yükleniyor...' : '📤 Sınır Verisini Yükle' }}
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
.mapping-section { margin-top: 14px; padding: 14px; background: rgba(77,163,255,.05); border: 1px dashed rgba(77,163,255,.3); border-radius: 10px; }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 8px; }
.mapping-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }
.mapping-label { font-size: .78rem; color: var(--color-text-muted,#94a3b8); white-space: nowrap; }
.mapping-grid select { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark; }
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.form-success { color: #22c55e; font-size: .8rem; flex: 1; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
