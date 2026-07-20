<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { isSafeLayerEndpointUrl } from '@/utils/mapLayerUrlSafety.js'

const props = defineProps({
  mapLayer: { type: Object, default: null }, // null = create mode
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()

const SOURCE_TYPES = ['wms', 'wfs']

const displayName = ref('')
const sourceType = ref('wms')
const endpointUrl = ref('')
const layerName = ref('')
const saving = ref(false)
const error = ref(null)

watch(
  () => props.mapLayer,
  (l) => {
    displayName.value = l?.display_name ?? ''
    sourceType.value = l?.source_type ?? 'wms'
    endpointUrl.value = l?.endpoint_url ?? ''
    layerName.value = l?.layer_name ?? ''
    error.value = null
  },
  { immediate: true },
)

function save() {
  error.value = null
  if (!displayName.value.trim()) { error.value = t('mapLayers.displayNameRequired'); return }
  if (!endpointUrl.value.trim()) { error.value = t('mapLayers.endpointUrlRequired'); return }
  if (!isSafeLayerEndpointUrl(endpointUrl.value.trim())) { error.value = t('mapLayers.unsafeUrl'); return }
  if (!layerName.value.trim()) { error.value = t('mapLayers.layerNameRequired'); return }

  saving.value = true
  emit('save', {
    display_name: displayName.value.trim(),
    source_type: sourceType.value,
    endpoint_url: endpointUrl.value.trim(),
    layer_name: layerName.value.trim(),
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ mapLayer ? t('mapLayers.editTitle') : t('mapLayers.createTitle') }}</h3>

      <div class="form-grid">
        <label class="form-field span-2"><span>{{ t('mapLayers.displayName') }} *</span>
          <input v-model="displayName" :placeholder="t('mapLayers.displayNamePlaceholder')" />
        </label>
        <label class="form-field"><span>{{ t('mapLayers.sourceType') }}</span>
          <select v-model="sourceType">
            <option v-for="s in SOURCE_TYPES" :key="s" :value="s">{{ s.toUpperCase() }}</option>
          </select>
        </label>
        <label class="form-field"><span>{{ t('mapLayers.layerName') }} *</span>
          <input v-model="layerName" :placeholder="sourceType === 'wms' ? 'LAYERS' : 'TYPENAMES'" />
        </label>
        <label class="form-field span-2"><span>{{ t('mapLayers.endpointUrl') }} *</span>
          <input v-model="endpointUrl" placeholder="https://..." />
        </label>
      </div>

      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('mapLayers.cancel') }}</button>
        <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('mapLayers.save') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-card { background: #161b26; border: 1px solid rgba(255,255,255,.12); border-radius: 12px; padding: 22px; width: 480px; max-width: 92vw; max-height: 88vh; overflow-y: auto; }
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
