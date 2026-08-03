<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useAuthStore } from '@/stores/auth.js'
import { useAiAssistanceStore } from '@/stores/aiAssistance.js'
import AiSuggestionBadge from '@/components/ai/AiSuggestionBadge.vue'

const props = defineProps({
  sopDocument: { type: Object, default: null }, // null = create mode
  existingCategories: { type: Array, default: () => [] }, // spec 033: suggestions for the category datalist
})
const emit = defineEmits(['save', 'cancel'])

const { t, locale } = useI18n()
const hazardTypesStore = useHazardTypesStore()
const auth = useAuthStore()
const aiAssistance = useAiAssistanceStore()

const title = ref('')
const hazardTypeCode = ref('')
const category = ref('')
const bodyContent = ref('')
const referenceUrl = ref('')
const saving = ref(false)
const error = ref(null)

// Spec 051 — AI ile özetle/çevir: yalnızca zaten kaydedilmiş (id'si olan) bir
// SOP dokümanı için anlamlı, çünkü ai_suggestions.source_id NOT NULL'dır.
// Country context, super_admin'in kendi ülke bağlamı olmadığı için
// auth.countryCode'dan alınır — auth.countryCode boşsa AI aksiyonları
// gösterilmez (bilinen sınırlama, çok-ülkeli SOP çevirisi için ileride bir
// ülke seçici eklenebilir).
const aiCountryCode = computed(() => auth.countryCode || null)
const translateEnabled = ref(false)
const summarizeEnabled = ref(false)
const targetLocale = ref('en')
const translateSuggestion = ref(null)
const summarySuggestion = ref(null)
const aiBusy = ref(false)
const aiUnavailable = ref(false)

onMounted(async () => {
  if (!aiCountryCode.value) return
  const caps = await aiAssistance.fetchCapabilities(aiCountryCode.value)
  translateEnabled.value = caps.translate === true
  summarizeEnabled.value = caps.summarize === true
})

async function requestTranslate() {
  if (!props.sopDocument?.id || !aiCountryCode.value) return
  aiBusy.value = true
  aiUnavailable.value = false
  const result = await aiAssistance.requestTranslation(
    'sop_documents',
    props.sopDocument.id,
    bodyContent.value,
    locale.value,
    targetLocale.value,
    aiCountryCode.value,
  )
  aiBusy.value = false
  if (!result.success) {
    aiUnavailable.value = true
    return
  }
  translateSuggestion.value = { id: result.suggestionId, ai_output: result.aiOutput }
}

async function requestSummarize() {
  if (!props.sopDocument?.id || !aiCountryCode.value) return
  aiBusy.value = true
  aiUnavailable.value = false
  const result = await aiAssistance.requestSummary(
    'sop_documents',
    props.sopDocument.id,
    bodyContent.value,
    aiCountryCode.value,
  )
  aiBusy.value = false
  if (!result.success) {
    aiUnavailable.value = true
    return
  }
  summarySuggestion.value = { id: result.suggestionId, ai_output: result.aiOutput }
}

async function approveTranslation() {
  if (!translateSuggestion.value) return
  await aiAssistance.resolveSuggestion(translateSuggestion.value.id, {
    status: 'approved',
    finalOutput: translateSuggestion.value.ai_output,
  })
  translateSuggestion.value = null
}

async function rejectTranslation() {
  if (!translateSuggestion.value) return
  await aiAssistance.resolveSuggestion(translateSuggestion.value.id, { status: 'rejected' })
  translateSuggestion.value = null
}

async function approveSummary() {
  if (!summarySuggestion.value) return
  await aiAssistance.resolveSuggestion(summarySuggestion.value.id, {
    status: 'approved',
    finalOutput: summarySuggestion.value.ai_output,
  })
  summarySuggestion.value = null
}

async function rejectSummary() {
  if (!summarySuggestion.value) return
  await aiAssistance.resolveSuggestion(summarySuggestion.value.id, { status: 'rejected' })
  summarySuggestion.value = null
}

watch(
  () => props.sopDocument,
  (s) => {
    title.value = s?.title ?? ''
    hazardTypeCode.value = s?.hazard_type_code ?? hazardTypesStore.activeHazardTypes[0]?.code ?? ''
    category.value = s?.category ?? ''
    bodyContent.value = s?.body_content ?? ''
    referenceUrl.value = s?.reference_url ?? ''
    error.value = null
    translateSuggestion.value = null
    summarySuggestion.value = null
  },
  { immediate: true },
)

function save() {
  error.value = null
  if (!title.value.trim()) { error.value = t('incidentTracking.sopTitleRequired'); return }
  if (!hazardTypeCode.value) { error.value = t('incidentTracking.sopHazardTypeRequired'); return }
  if (!bodyContent.value.trim() && !referenceUrl.value.trim()) {
    error.value = t('incidentTracking.sopContentRequired')
    return
  }

  saving.value = true
  emit('save', {
    title: title.value.trim(),
    hazard_type_code: hazardTypeCode.value,
    category: category.value.trim() || null,
    body_content: bodyContent.value.trim() || null,
    reference_url: referenceUrl.value.trim() || null,
  })
  saving.value = false
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('cancel')">
    <div class="modal-card">
      <h3>{{ sopDocument ? t('incidentTracking.sopEditTitle') : t('incidentTracking.sopCreateTitle') }}</h3>

      <div class="form-grid">
        <label class="form-field span-2"><span>{{ t('incidentTracking.sopTitle') }} *</span>
          <input v-model="title" :placeholder="t('incidentTracking.sopTitlePlaceholder')" />
        </label>
        <label class="form-field span-2"><span>{{ t('incidentTracking.sopHazardType') }} *</span>
          <select v-model="hazardTypeCode">
            <option v-for="h in hazardTypesStore.activeHazardTypes" :key="h.code" :value="h.code">{{ h.display_name }}</option>
          </select>
        </label>
        <label class="form-field span-2"><span>{{ t('incidentTracking.sopCategory') }}</span>
          <input v-model="category" list="sop-category-suggestions" :placeholder="t('incidentTracking.sopCategoryPlaceholder')" />
          <datalist id="sop-category-suggestions">
            <option v-for="c in existingCategories" :key="c" :value="c" />
          </datalist>
        </label>
        <label class="form-field span-2"><span>{{ t('incidentTracking.sopBodyContent') }}</span>
          <textarea v-model="bodyContent" rows="4" :placeholder="t('incidentTracking.sopBodyContentPlaceholder')" />
        </label>

        <div v-if="sopDocument?.id && aiCountryCode && (translateEnabled || summarizeEnabled)" class="span-2 ai-actions">
          <div v-if="summarizeEnabled" class="ai-action-row">
            <button type="button" class="btn-ai" :disabled="aiBusy || !bodyContent.trim()" @click="requestSummarize">
              {{ t('incidentTracking.aiSummarizeAction') }}
            </button>
          </div>
          <AiSuggestionBadge
            v-if="summarySuggestion"
            :suggestion="summarySuggestion"
            @approve="approveSummary"
            @reject="rejectSummary"
          >
            <template #default>
              <p class="ai-preview">{{ summarySuggestion.ai_output.summary_text }}</p>
            </template>
          </AiSuggestionBadge>

          <div v-if="translateEnabled" class="ai-action-row">
            <select v-model="targetLocale">
              <option value="en">EN</option>
              <option value="tr">TR</option>
              <option value="es">ES</option>
              <option value="fr">FR</option>
              <option value="ru">RU</option>
              <option value="ar">AR</option>
              <option value="zh">ZH</option>
            </select>
            <button type="button" class="btn-ai" :disabled="aiBusy || !bodyContent.trim()" @click="requestTranslate">
              {{ t('incidentTracking.aiTranslateAction') }}
            </button>
          </div>
          <AiSuggestionBadge
            v-if="translateSuggestion"
            :suggestion="translateSuggestion"
            @approve="approveTranslation"
            @reject="rejectTranslation"
          >
            <template #default>
              <p class="ai-preview">{{ translateSuggestion.ai_output.translated_text }}</p>
            </template>
          </AiSuggestionBadge>

          <p v-if="aiUnavailable" class="ai-unavailable">{{ t('ai.unavailable') }}</p>
        </div>
        <label class="form-field span-2"><span>{{ t('incidentTracking.sopReferenceUrl') }}</span>
          <input v-model="referenceUrl" placeholder="https://..." />
        </label>
      </div>

      <div v-if="error" class="form-error">{{ error }}</div>

      <div class="modal-actions">
        <button class="btn-cancel" @click="emit('cancel')">{{ t('incidentTracking.cancel') }}</button>
        <button class="btn-submit" :disabled="saving" @click="save">{{ saving ? '...' : t('incidentTracking.save') }}</button>
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
.form-field input, .form-field select, .form-field textarea {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%; resize: vertical;
}
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus, .form-field select:focus, .form-field textarea:focus { outline: none; border-color: rgba(77,163,255,.5); }
.form-error { color: #ef4444; font-size: .8rem; margin-top: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.btn-cancel { padding: 9px 18px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.15); border-radius: 8px; color: #cbd5e1; cursor: pointer; font-size: .85rem; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }
.ai-actions { display: flex; flex-direction: column; gap: 10px; padding: 10px; border-top: 1px dashed rgba(255,255,255,.12); margin-top: 4px; }
.ai-action-row { display: flex; gap: 8px; align-items: center; }
.ai-action-row select { background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 6px; color: #e2e8f0; padding: 6px 8px; }
.btn-ai { padding: 7px 14px; background: rgba(138,125,250,.15); border: 1px solid rgba(138,125,250,.4); border-radius: 8px; color: #a99bfa; cursor: pointer; font-size: .8rem; }
.btn-ai:disabled { opacity: .45; cursor: not-allowed; }
.btn-ai:not(:disabled):hover { background: rgba(138,125,250,.25); }
.ai-preview { font-size: .82rem; color: #e2e8f0; margin: 0; white-space: pre-wrap; }
.ai-unavailable { font-size: .78rem; color: #f59e0b; margin: 0; }
</style>
