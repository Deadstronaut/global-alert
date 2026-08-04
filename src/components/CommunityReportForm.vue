<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useCommunityReportsStore } from '@/stores/communityReports.js'
import LocationPickerMap from '@/components/LocationPickerMap.vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()
const hazardTypesStore = useHazardTypesStore()
const communityReportsStore = useCommunityReportsStore()

const hazardType = ref('')
const description = ref('')
const lat = ref('')
const lng = ref('')
const photoFile = ref(null)
const photoError = ref(null)
const audioFile = ref(null)
const audioError = ref(null)

const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref(null)

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024

onMounted(() => {
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
})

const hazardTypeOptions = computed(() => hazardTypesStore.activeHazardTypes)

function handleMapPick({ lat: pickedLat, lng: pickedLng }) {
  lat.value = Math.round(pickedLat * 1e6) / 1e6
  lng.value = Math.round(pickedLng * 1e6) / 1e6
}

function useMyLocation() {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition((position) => {
    lat.value = position.coords.latitude.toFixed(6)
    lng.value = position.coords.longitude.toFixed(6)
  })
}

function onPhotoChange(event) {
  const file = event.target.files?.[0] ?? null
  photoError.value = null
  if (!file) {
    photoFile.value = null
    return
  }
  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    photoError.value = t('communityReport.form.errorPhotoType')
    photoFile.value = null
    return
  }
  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    photoError.value = t('communityReport.form.errorPhotoSize')
    photoFile.value = null
    return
  }
  photoFile.value = file
}

function onAudioChange(event) {
  const file = event.target.files?.[0] ?? null
  audioError.value = null
  if (!file) {
    audioFile.value = null
    return
  }
  if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
    audioError.value = t('communityReport.form.errorAudioType')
    audioFile.value = null
    return
  }
  if (file.size > MAX_AUDIO_SIZE_BYTES) {
    audioError.value = t('communityReport.form.errorAudioSize')
    audioFile.value = null
    return
  }
  audioFile.value = file
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleSubmit() {
  errorMessage.value = null

  if (!hazardType.value) {
    errorMessage.value = t('communityReport.form.errorHazardType')
    return
  }
  if (!description.value.trim()) {
    errorMessage.value = t('communityReport.form.errorDescription')
    return
  }
  if (lat.value === '' || lng.value === '') {
    errorMessage.value = t('communityReport.form.errorLocation')
    return
  }

  submitting.value = true
  try {
    const payload = {
      hazardType: hazardType.value,
      description: description.value.trim(),
      lat: Number(lat.value),
      lng: Number(lng.value),
    }
    if (photoFile.value) {
      payload.photo = {
        base64: await fileToBase64(photoFile.value),
        mimeType: photoFile.value.type,
      }
    }
    if (audioFile.value) {
      payload.audio = {
        base64: await fileToBase64(audioFile.value),
        mimeType: audioFile.value.type,
      }
    }

    const result = await communityReportsStore.submitReport(payload)
    if (!result.success) {
      errorMessage.value = result.error || t('communityReport.form.errorGeneric')
      return
    }
    submitted.value = true
  } catch {
    errorMessage.value = t('communityReport.form.errorGeneric')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="community-report-form">
    <p v-if="submitted" class="success-message">✓ {{ t('communityReport.form.successMessage') }}</p>

    <form v-else class="form-card" @submit.prevent="handleSubmit">
      <label class="form-field span-2">
        <span>{{ t('communityReport.form.hazardType') }}</span>
        <select v-model="hazardType">
          <option value="" disabled>{{ t('communityReport.form.hazardTypePlaceholder') }}</option>
          <option v-for="h in hazardTypeOptions" :key="h.code" :value="h.code">{{ h.display_name }}</option>
        </select>
      </label>

      <label class="form-field span-2">
        <span>{{ t('communityReport.form.description') }}</span>
        <textarea v-model="description" rows="4" :placeholder="t('communityReport.form.descriptionPlaceholder')" />
      </label>

      <div class="form-grid location-grid">
        <label class="form-field">
          <span>{{ t('communityReport.form.lat') }}</span>
          <input v-model="lat" type="number" step="any" />
        </label>
        <label class="form-field">
          <span>{{ t('communityReport.form.lng') }}</span>
          <input v-model="lng" type="number" step="any" />
        </label>
        <Button type="button" variant="outline" class="btn-location" @click="useMyLocation">
          📍 {{ t('communityReport.form.useMyLocation') }}
        </Button>
      </div>

      <div class="map-panel">
        <span class="map-panel-label">{{ t('communityReport.form.pickOnMap') }}</span>
        <LocationPickerMap :lat="lat" :lng="lng" @pick="handleMapPick" />
      </div>

      <div class="form-grid">
        <label class="form-field">
          <span>{{ t('communityReport.form.photo') }}</span>
          <input type="file" accept="image/jpeg,image/png,image/webp" @change="onPhotoChange" />
          <small>{{ t('communityReport.form.photoHint') }}</small>
        </label>
        <label class="form-field">
          <span>{{ t('communityReport.form.audio') }}</span>
          <input type="file" accept="audio/webm,audio/ogg,audio/mpeg,audio/mp4,audio/wav" @change="onAudioChange" />
          <small>{{ t('communityReport.form.audioHint') }}</small>
        </label>
      </div>
      <p v-if="photoError" class="form-error">{{ photoError }}</p>
      <p v-if="audioError" class="form-error">{{ audioError }}</p>

      <div class="form-actions">
        <p v-if="errorMessage" class="form-error">{{ errorMessage }}</p>
        <Button type="submit" class="btn-submit" :disabled="submitting">
          {{ submitting ? t('communityReport.form.submitting') : t('communityReport.form.submit') }}
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
/* Same dark form language as AdminView.vue's .form-card/.form-field/
   .btn-submit — this form used to be entirely unstyled browser-default
   controls in a narrow centered box, standing out badly against the rest
   of the app's dark, modern UI. */
.community-report-form { max-width: 720px; margin: 0 auto; }

.form-card {
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 10px;
  padding: 20px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.location-grid { align-items: end; }
.span-2 { grid-column: span 2; }

.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.82rem;
  color: var(--color-text-muted, #94a3b8);
  margin-bottom: 14px;
}
.form-grid .form-field { margin-bottom: 0; }

.form-field input,
.form-field select,
.form-field textarea {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: 0.88rem;
  font-family: inherit;
  width: 100%;
}
.form-field textarea { resize: vertical; }
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: none;
  border-color: rgba(77, 163, 255, 0.5);
}
.form-field small { color: var(--color-text-muted, #94a3b8); font-size: 0.72rem; }

.btn-location {
  height: fit-content;
}

.map-panel { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.map-panel-label { font-size: 0.82rem; color: var(--color-text-muted, #94a3b8); }
.map-panel :deep(.location-picker-map) { height: 260px; border: 1px solid rgba(148, 163, 184, 0.18); }

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 6px;
}
.form-error { color: #ef4444; font-size: 0.82rem; flex: 1; }


.success-message {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.35);
  border-radius: 10px;
  padding: 20px;
  color: #4ade80;
  font-weight: 600;
  font-size: 0.95rem;
}

@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
  .span-2 { grid-column: span 1; }
}
</style>
