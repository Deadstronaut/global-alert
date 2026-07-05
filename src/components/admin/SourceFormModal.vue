<script setup>
import { ref, watch, computed } from 'vue'

const HAZARD_TYPES = ['earthquake', 'wildfire', 'flood', 'drought', 'food_security']
// Only "id"/"lat"/"lng"/"time" are required by validatePayload(); the rest are optional extras.
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

const props = defineProps({
  source: { type: Object, default: null }, // null = create mode
  saving: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['save', 'cancel'])

function blankForm() {
  return {
    name: '',
    hazard_type: 'earthquake',
    endpoint_url: '',
    poll_interval_seconds: 60,
    staleness_threshold_seconds: null,
    down_after_consecutive_failures: 3,
    is_custom: false,
    response_path: '',
    field_map: {},
  }
}

function fromSource(src) {
  return {
    ...src,
    is_custom: !!src.endpoint_config?.field_map,
    response_path: src.endpoint_config?.response_path ?? '',
    field_map: { ...(src.endpoint_config?.field_map ?? {}) },
  }
}

const form = ref(props.source ? fromSource(props.source) : blankForm())

watch(
  () => props.source,
  (src) => {
    form.value = src ? fromSource(src) : blankForm()
  },
)

const requiredMappingFilled = computed(() =>
  !form.value.is_custom || ['id', 'lat', 'lng', 'time'].every((k) => form.value.field_map[k]?.trim())
)

function submit() {
  const { is_custom, response_path, field_map, ...rest } = form.value
  const payload = {
    ...rest,
    endpoint_config: is_custom ? { response_path, field_map } : {},
  }
  emit('save', payload)
}
</script>

<template>
  <div class="form-card">
    <div class="form-grid">
      <label class="form-field span-2"><span>Kaynak Adı *</span>
        <input v-model="form.name" placeholder="USGS, NASA FIRMS..." />
      </label>
      <label class="form-field"><span>Afet Tipi *</span>
        <select v-model="form.hazard_type">
          <option v-for="t in HAZARD_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
      </label>
      <label class="form-field"><span>Poll Aralığı (saniye) *</span>
        <input v-model.number="form.poll_interval_seconds" type="number" min="1" />
      </label>
      <label class="form-field span-2"><span>Endpoint URL *</span>
        <input v-model="form.endpoint_url" placeholder="https://..." />
      </label>
      <label class="form-field"><span>Staleness Eşiği (saniye, opsiyonel)</span>
        <input v-model.number="form.staleness_threshold_seconds" type="number" min="1" placeholder="varsayılan: 3x poll aralığı" />
      </label>
      <label class="form-field"><span>Down Eşiği (ardışık hata sayısı)</span>
        <input v-model.number="form.down_after_consecutive_failures" type="number" min="1" />
      </label>
      <label class="form-field span-2 checkbox-field">
        <input v-model="form.is_custom" type="checkbox" />
        <span>Standart olmayan / özel kaynak (bizim kodda tanımlı değil — alan eşleştirmesi gerekir)</span>
      </label>
    </div>

    <div v-if="form.is_custom" class="mapping-section">
      <label class="form-field"><span>Kayıt Listesi Yolu (response_path)</span>
        <input v-model="form.response_path" placeholder="örn. data.records (yanıtın kendisi bir dizi ise boş bırak)" />
      </label>
      <p class="mapping-hint">Onların API'sindeki alan adını, bizim standart alanımızla eşleştir:</p>
      <div class="mapping-grid">
        <template v-for="f in MAPPABLE_FIELDS" :key="f.key">
          <span class="mapping-label">{{ f.label }}</span>
          <input v-model="form.field_map[f.key]" placeholder="onların JSON key'i" />
        </template>
      </div>
      <div v-if="!requiredMappingFilled" class="mapping-warning">
        ID, Enlem, Boylam ve Zaman eşleştirmeleri zorunludur.
      </div>
    </div>

    <div class="form-actions">
      <div v-if="error" class="form-error">{{ error }}</div>
      <button class="btn-cancel-form" @click="$emit('cancel')">İptal</button>
      <button class="btn-submit"
        :disabled="saving || !form.name || !form.endpoint_url || !requiredMappingFilled"
        @click="submit">
        {{ saving ? 'Kaydediliyor...' : '💾 Kaydet' }}
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
.checkbox-field { flex-direction: row; align-items: center; gap: 8px; font-size: .82rem; color: #e2e8f0; }
.checkbox-field input { width: auto; }
.mapping-section { margin-top: 14px; padding: 14px; background: rgba(77,163,255,.05); border: 1px dashed rgba(77,163,255,.3); border-radius: 10px; }
.mapping-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 10px 0 8px; }
.mapping-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 12px; align-items: center; }
.mapping-label { font-size: .78rem; color: var(--color-text-muted,#94a3b8); white-space: nowrap; }
.mapping-grid input { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; padding: 7px 10px; color: #e2e8f0; font-size: .82rem; }
.mapping-warning { color: #f59e0b; font-size: .78rem; margin-top: 10px; }
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.btn-cancel-form { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--color-text-muted,#94a3b8); cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
</style>
