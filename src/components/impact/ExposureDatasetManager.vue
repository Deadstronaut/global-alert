<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import { parseExposureFile } from '@/utils/exposureFileParser.js'
import { friendlyDatasetLabel } from '@/utils/exposureLayerLabel.js'
import DeletionJustificationModal from '@/components/admin/DeletionJustificationModal.vue'

const { t } = useI18n()
const auth = useAuthStore()

const datasets = ref([])
const loading = ref(false)
const error = ref(null)
const uploading = ref(false)
// spec 035 (US3/FR-008): exposure_datasets is the only table in the codebase
// with a real hard-delete path today — routed through delete_with_justification()
// instead of a direct .delete() call, so every deletion carries a mandatory
// reason in the audit trail.
const deletionTarget = ref(null)

const form = ref({ name: '', description: '', metricPropertyName: '', file: null })

async function loadDatasets() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('exposure_datasets')
    .select('*')
    .order('created_at', { ascending: false })
  if (!err) datasets.value = data || []
  loading.value = false
}

function onFileChange(e) {
  form.value.file = e.target.files?.[0] ?? null
}

async function extractFunctionErrorMessage(invokeError) {
  if (!invokeError) return null
  try {
    const body = await invokeError.context?.json?.()
    if (body?.error) return body.error
  } catch {
    // response body wasn't JSON or already consumed — fall through
  }
  return invokeError.message ?? null
}

async function upload() {
  if (!form.value.file || !form.value.name.trim() || !form.value.metricPropertyName.trim()) return
  uploading.value = true
  error.value = null
  try {
    const geojson = await parseExposureFile(form.value.file)
    const { data: result, error: invokeError } = await supabase.functions.invoke('upload-exposure-dataset', {
      body: {
        name: form.value.name,
        description: form.value.description,
        metricPropertyName: form.value.metricPropertyName,
        geojson,
      },
    })
    if (invokeError || result?.error) {
      error.value = result?.error || (await extractFunctionErrorMessage(invokeError)) || t('impact.errors.uploadFailed')
      return
    }
    form.value = { name: '', description: '', metricPropertyName: '', file: null }
    await loadDatasets()
  } catch (err) {
    error.value = err.message ?? String(err)
  } finally {
    uploading.value = false
  }
}

function requestDelete(dataset) {
  deletionTarget.value = dataset
}

async function confirmDelete(justificationText) {
  const dataset = deletionTarget.value
  deletionTarget.value = null
  if (!dataset) return
  const { error: err } = await supabase.rpc('delete_with_justification', {
    target_table: 'exposure_datasets',
    target_id: dataset.id,
    justification_text: justificationText,
  })
  if (err) error.value = err.message
  await loadDatasets()
}

onMounted(loadDatasets)
</script>

<template>
  <div class="exposure-manager">
    <div class="exposure-form">
      <h4>{{ t('impact.exposure.uploadTitle') }}</h4>
      <p class="exposure-intro">{{ t('impact.exposure.uploadIntro') }}</p>
      <label class="exposure-field">
        <span>{{ t('impact.exposure.name') }}</span>
        <input v-model="form.name" />
      </label>
      <label class="exposure-field">
        <span>{{ t('impact.exposure.description') }}</span>
        <input v-model="form.description" />
      </label>
      <label class="exposure-field">
        <span>{{ t('impact.exposure.metricProperty') }}</span>
        <input v-model="form.metricPropertyName" :placeholder="t('impact.exposure.metricPropertyPlaceholder')" />
        <span class="exposure-hint">{{ t('impact.exposure.metricPropertyHint') }}</span>
      </label>
      <label class="exposure-field">
        <span>{{ t('impact.exposure.file') }}</span>
        <input type="file" accept=".json,.geojson,.zip" @change="onFileChange" />
      </label>
      <p v-if="error" class="exposure-error">{{ error }}</p>
      <button class="btn-upload" :disabled="uploading" @click="upload">
        {{ uploading ? t('impact.exposure.uploading') : t('impact.exposure.upload') }}
      </button>
    </div>

    <div class="exposure-list">
      <h4>{{ t('impact.exposure.listTitle') }}</h4>
      <div v-if="loading" class="tab-loading">{{ t('impact.loading') }}</div>
      <div v-else-if="datasets.length === 0" class="tab-empty">{{ t('impact.exposure.empty') }}</div>
      <div v-else v-for="d in datasets" :key="d.id" class="exposure-row">
        <div>
          <strong>{{ friendlyDatasetLabel(t, d) }}</strong>
          <span class="exposure-meta">{{ d.feature_count }} {{ t('impact.exposure.features') }}</span>
        </div>
        <button class="btn-delete" @click="requestDelete(d)">{{ t('impact.exposure.delete') }}</button>
      </div>
    </div>

    <DeletionJustificationModal
      v-if="deletionTarget"
      :target-label="deletionTarget.name"
      @confirm="confirmDelete"
      @cancel="deletionTarget = null"
    />
  </div>
</template>

<style scoped>
.exposure-manager { display: flex; flex-direction: column; gap: 20px; }
.exposure-form, .exposure-list {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.exposure-form h4, .exposure-list h4 { margin: 0 0 12px; font-size: .95rem; }
.exposure-intro { font-size: .8rem; color: var(--color-text-muted, #94a3b8); margin: 0 0 14px; line-height: 1.4; }
.exposure-hint { font-size: .72rem; color: var(--color-text-muted, #94a3b8); opacity: .8; line-height: 1.35; }
.exposure-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 10px; }
.exposure-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem;
}
.exposure-error { color: #ef4444; font-size: .8rem; }
.btn-upload {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-upload:disabled { opacity: .5; cursor: not-allowed; }
.exposure-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.exposure-meta { margin-left: 10px; color: var(--color-text-muted, #94a3b8); font-size: .75rem; }
.btn-delete {
  padding: 4px 12px; background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.35);
  border-radius: 6px; color: #ef4444; font-size: .75rem; cursor: pointer;
}
</style>
