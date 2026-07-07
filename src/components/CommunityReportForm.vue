<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useCommunityReportsStore } from '@/stores/communityReports.js'

const { t } = useI18n()
const hazardTypesStore = useHazardTypesStore()
const communityReportsStore = useCommunityReportsStore()

const hazardType = ref('')
const description = ref('')
const lat = ref('')
const lng = ref('')
const photoFile = ref(null)
const photoError = ref(null)

const submitting = ref(false)
const submitted = ref(false)
const errorMessage = ref(null)

const ALLOWED_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024

onMounted(() => {
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
})

const hazardTypeOptions = computed(() => hazardTypesStore.activeHazardTypes)

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
    <h2>{{ t('communityReport.form.title') }}</h2>

    <p v-if="submitted" class="success-message">{{ t('communityReport.form.successMessage') }}</p>

    <form v-else @submit.prevent="handleSubmit">
      <label class="form-field">
        <span>{{ t('communityReport.form.hazardType') }}</span>
        <select v-model="hazardType">
          <option value="" disabled>{{ t('communityReport.form.hazardTypePlaceholder') }}</option>
          <option v-for="h in hazardTypeOptions" :key="h.code" :value="h.code">{{ h.display_name }}</option>
        </select>
      </label>

      <label class="form-field">
        <span>{{ t('communityReport.form.description') }}</span>
        <textarea v-model="description" rows="4" :placeholder="t('communityReport.form.descriptionPlaceholder')" />
      </label>

      <div class="form-grid">
        <label class="form-field">
          <span>{{ t('communityReport.form.lat') }}</span>
          <input v-model="lat" type="number" step="any" />
        </label>
        <label class="form-field">
          <span>{{ t('communityReport.form.lng') }}</span>
          <input v-model="lng" type="number" step="any" />
        </label>
      </div>
      <button type="button" class="secondary-button" @click="useMyLocation">
        {{ t('communityReport.form.useMyLocation') }}
      </button>

      <label class="form-field">
        <span>{{ t('communityReport.form.photo') }}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" @change="onPhotoChange" />
        <small>{{ t('communityReport.form.photoHint') }}</small>
      </label>
      <p v-if="photoError" class="error-message">{{ photoError }}</p>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>

      <button type="submit" :disabled="submitting">
        {{ submitting ? t('communityReport.form.submitting') : t('communityReport.form.submit') }}
      </button>
    </form>
  </div>
</template>

<style scoped>
.community-report-form { max-width: 32rem; margin: 0 auto; padding: 1rem; }
.form-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.secondary-button { margin-bottom: 12px; }
.error-message { color: #c0392b; }
.success-message { color: #1e7e34; font-weight: 600; }
</style>
