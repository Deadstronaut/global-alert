<script setup>
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { wouldCreateCycle } from '@/stores/hazardTypes.js'

const props = defineProps({
  hazardType: { type: Object, default: null }, // null = create mode
  hazardTypes: { type: Array, default: () => [] }, // spec 024: full list, for the parent dropdown
})
const emit = defineEmits(['save', 'cancel'])

const { t } = useI18n()

const CATEGORIES = ['meteo', 'hydro', 'geo', 'bio', 'tech']

const code = ref('')
const displayName = ref('')
const category = ref('meteo')
const description = ref('')
const parentCode = ref('')
const saving = ref(false)
const error = ref(null)

// spec 024 FR-001: candidates are active hazard types excluding the one being edited itself.
const parentOptions = computed(() =>
  props.hazardTypes.filter((h) => h.is_active && h.code !== props.hazardType?.code),
)

const parentError = computed(() => {
  if (!parentCode.value || !props.hazardType) return null
  return wouldCreateCycle(props.hazardTypes, props.hazardType.code, parentCode.value)
    ? t('hazardTaxonomy.hierarchy.cycleError')
    : null
})

watch(
  () => props.hazardType,
  (h) => {
    code.value = h?.code ?? ''
    displayName.value = h?.display_name ?? ''
    category.value = h?.category ?? 'meteo'
    description.value = h?.description ?? ''
    parentCode.value = h?.parent_code ?? ''
    error.value = null
  },
  { immediate: true },
)

function save() {
  error.value = null
  if (!props.hazardType && !code.value.trim()) { error.value = t('hazardTaxonomy.codeRequired'); return }
  if (!displayName.value.trim()) { error.value = t('hazardTaxonomy.displayNameRequired'); return }
  if (parentError.value) { error.value = parentError.value; return }

  saving.value = true
  emit('save', {
    ...(props.hazardType ? {} : { code: code.value.trim().toLowerCase() }),
    display_name: displayName.value.trim(),
    category: category.value,
    description: description.value.trim() || null,
    parent_code: parentCode.value || null,
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ hazardType ? t('hazardTaxonomy.editTitle') : t('hazardTaxonomy.createTitle') }}</h3>

      <div class="form-grid">
        <label class="form-field span-2"><span>{{ t('hazardTaxonomy.code') }} *</span>
          <input v-model="code" :disabled="!!hazardType" placeholder="landslide" />
        </label>
        <label class="form-field span-2"><span>{{ t('hazardTaxonomy.displayName') }} *</span>
          <input v-model="displayName" />
        </label>
        <label class="form-field"><span>{{ t('hazardTaxonomy.category') }}</span>
          <select v-model="category">
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="form-field span-2"><span>{{ t('hazardTaxonomy.description') }}</span>
          <input v-model="description" />
        </label>
        <label class="form-field span-2"><span>{{ t('hazardTaxonomy.hierarchy.parentLabel') }}</span>
          <select v-model="parentCode">
            <option value="">{{ t('hazardTaxonomy.hierarchy.noParent') }}</option>
            <option v-for="h in parentOptions" :key="h.code" :value="h.code">{{ h.display_name }}</option>
          </select>
        </label>
      </div>

      <div v-if="parentError" class="form-error">{{ parentError }}</div>
      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('hazardTaxonomy.cancel') }}</button>
        <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('hazardTaxonomy.save') }}</button>
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
.form-field input:disabled { opacity: .5; }
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
