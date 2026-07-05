<script setup>
import { ref, computed } from 'vue'
import { supabase } from '@/services/api/config.js'
import { parseDataFile, SUPPORTED_EXTENSIONS } from '@/utils/fileParsers.js'
import { buildEventRow } from '@/utils/severity.js'
import { useAuthStore } from '@/stores/auth.js'

const HAZARD_TYPES = ['earthquake', 'wildfire', 'flood', 'drought', 'food_security']
const TABLE_MAP = { earthquake: 'earthquake', wildfire: 'wildfire', flood: 'flood', drought: 'drought', food_security: 'food_security' }
const MAPPABLE_FIELDS = [
  { key: 'id', label: 'ID *' },
  { key: 'lat', label: 'Enlem (lat) *' },
  { key: 'lng', label: 'Boylam (lng) *' },
  { key: 'time', label: 'Zaman *' },
  { key: 'magnitude', label: 'Büyüklük/Şiddet' },
  { key: 'depth', label: 'Derinlik' },
  { key: 'title', label: 'Başlık' },
  { key: 'description', label: 'Açıklama' },
]

const auth = useAuthStore()

const hazardType = ref('earthquake')
const countryCode = ref(auth.countryCode || '')
const sourceName = ref('Dosya İçe Aktarma')
const headers = ref([])
const records = ref([])
const fieldMap = ref({})
const fileName = ref('')
const importing = ref(false)
const parsing = ref(false)
const error = ref(null)
const result = ref(null)

const requiredMappingFilled = computed(() =>
  ['id', 'lat', 'lng', 'time'].every((k) => fieldMap.value[k])
)

async function onFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  fileName.value = file.name
  result.value = null
  error.value = null
  headers.value = []
  records.value = []
  parsing.value = true
  try {
    const { headers: h, records: r } = await parseDataFile(file)
    headers.value = h
    records.value = r
    fieldMap.value = {}
    // best-effort auto-guess for exact/near matches
    for (const f of MAPPABLE_FIELDS) {
      const match = h.find((col) => col.toLowerCase() === f.key.toLowerCase())
      if (match) fieldMap.value[f.key] = match
    }
  } catch (err) {
    error.value = err.message
  } finally {
    parsing.value = false
  }
}

function validate(raw) {
  if (raw.id == null || String(raw.id).trim() === '') return { valid: false, reason: 'missing id' }
  const lat = Number(raw.lat)
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { valid: false, reason: `invalid lat: ${raw.lat}` }
  const lng = Number(raw.lng)
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return { valid: false, reason: `invalid lng: ${raw.lng}` }
  if (!raw.time || Number.isNaN(new Date(raw.time).getTime())) return { valid: false, reason: `invalid time: ${raw.time}` }
  return { valid: true }
}

async function runImport() {
  importing.value = true
  error.value = null
  result.value = null
  try {
    const rows = []
    const rejected = []
    for (const rec of records.value) {
      const raw = {
        id: rec[fieldMap.value.id],
        lat: rec[fieldMap.value.lat],
        lng: rec[fieldMap.value.lng],
        time: rec[fieldMap.value.time],
        magnitude: fieldMap.value.magnitude ? rec[fieldMap.value.magnitude] : null,
        depth: fieldMap.value.depth ? rec[fieldMap.value.depth] : null,
        title: fieldMap.value.title ? rec[fieldMap.value.title] : null,
        description: fieldMap.value.description ? rec[fieldMap.value.description] : null,
      }
      const check = validate(raw)
      if (!check.valid) { rejected.push({ raw, reason: check.reason }); continue }
      rows.push(buildEventRow({
        id: `import-${fileName.value}-${raw.id}`,
        type: hazardType.value,
        lat: raw.lat, lng: raw.lng,
        magnitude: raw.magnitude, depth: raw.depth,
        title: raw.title, description: raw.description,
        time: raw.time,
        source: sourceName.value,
        countryCode: countryCode.value.trim().toLowerCase() || null,
      }))
    }

    let inserted = 0
    const CHUNK = 200
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { error: err } = await supabase.from(TABLE_MAP[hazardType.value]).upsert(chunk, { onConflict: 'id' })
      if (err) throw err
      inserted += chunk.length
    }
    result.value = { inserted, rejected: rejected.length, rejectedSample: rejected.slice(0, 5) }
  } catch (err) {
    error.value = err.message
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="form-card">
    <div class="form-grid">
      <label class="form-field"><span>Afet Tipi *</span>
        <select v-model="hazardType">
          <option v-for="t in HAZARD_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label class="form-field"><span>Ülke Kodu</span>
        <input v-model="countryCode" placeholder="tr" maxlength="2" />
      </label>
      <label class="form-field"><span>Kaynak Adı</span>
        <input v-model="sourceName" placeholder="örn. Bakanlık Raporu" />
      </label>
      <label class="form-field span-2"><span>Dosya * (CSV, JSON veya Excel — SQL desteklenmiyor)</span>
        <input type="file" :accept="SUPPORTED_EXTENSIONS" @change="onFile" />
      </label>
    </div>

    <div v-if="parsing" class="tab-loading">Dosya okunuyor...</div>
    <div v-if="headers.length" class="mapping-section">
      <p class="mapping-hint">{{ fileName }} — {{ records.length }} satır bulundu. Sütunlarını eşleştir:</p>
      <div class="mapping-grid">
        <template v-for="f in MAPPABLE_FIELDS" :key="f.key">
          <span class="mapping-label">{{ f.label }}</span>
          <select v-model="fieldMap[f.key]">
            <option value="">— seçilmedi —</option>
            <option v-for="h in headers" :key="h" :value="h">{{ h }}</option>
          </select>
        </template>
      </div>
      <div v-if="!requiredMappingFilled" class="mapping-warning">ID, Enlem, Boylam ve Zaman eşleştirmeleri zorunludur.</div>
    </div>

    <div class="form-actions">
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="result" class="form-success">
        {{ result.inserted }} kayıt eklendi, {{ result.rejected }} kayıt reddedildi (eksik/hatalı alan).
      </div>
      <button class="btn-submit" :disabled="importing || !requiredMappingFilled || !records.length" @click="runImport">
        {{ importing ? 'İçe aktarılıyor...' : '📥 İçe Aktar' }}
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
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); margin-top: 10px; }
.mapping-section { margin-top: 14px; padding: 14px; background: rgba(77,163,255,.05); border: 1px dashed rgba(77,163,255,.3); border-radius: 10px; }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 8px; }
.mapping-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }
.mapping-label { font-size: .78rem; color: var(--color-text-muted,#94a3b8); white-space: nowrap; }
.mapping-grid select { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; color-scheme: dark; }
.mapping-warning { color: #f59e0b; font-size: .78rem; margin-top: 10px; }
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.form-success { color: #22c55e; font-size: .8rem; flex: 1; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
