<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const auth = useAuthStore()

const images = ref([])
const loading = ref(false)
const error = ref(null)
const requesting = ref(false)

const countryCode = ref(auth.isSuperAdmin ? '' : (auth.countryCode ?? ''))
const west = ref('')
const south = ref('')
const east = ref('')
const north = ref('')

async function loadImages() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('satellite_imagery')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (err) error.value = err.message
  else images.value = data ?? []
  loading.value = false
}

onMounted(loadImages)

function publicUrl(storagePath) {
  return supabase.storage.from('satellite-imagery').getPublicUrl(storagePath).data.publicUrl
}

async function requestImagery() {
  error.value = null
  const bbox = [west.value, south.value, east.value, north.value].map(Number)
  if (!countryCode.value || countryCode.value.length !== 2) { error.value = t('satelliteImagery.countryRequired'); return }
  if (bbox.some((v) => !Number.isFinite(v))) { error.value = t('satelliteImagery.bboxRequired'); return }

  requesting.value = true
  const { data, error: err } = await supabase.functions.invoke('import-satellite-imagery', {
    body: { countryCode: countryCode.value, bbox },
  })
  requesting.value = false
  if (err) { error.value = err.message; return }
  if (data?.error) { error.value = data.error; return }
  await loadImages()
}
</script>

<template>
  <div class="satellite-imagery-panel">
    <h3>{{ t('satelliteImagery.title') }}</h3>
    <p class="panel-hint">{{ t('satelliteImagery.hint') }}</p>

    <div class="request-form">
      <label class="form-field"><span>{{ t('satelliteImagery.country') }}</span>
        <input v-model="countryCode" maxlength="2" placeholder="TR" :disabled="!auth.isSuperAdmin" />
      </label>
      <label class="form-field"><span>{{ t('satelliteImagery.west') }}</span><input v-model="west" type="number" step="any" /></label>
      <label class="form-field"><span>{{ t('satelliteImagery.south') }}</span><input v-model="south" type="number" step="any" /></label>
      <label class="form-field"><span>{{ t('satelliteImagery.east') }}</span><input v-model="east" type="number" step="any" /></label>
      <label class="form-field"><span>{{ t('satelliteImagery.north') }}</span><input v-model="north" type="number" step="any" /></label>
      <button class="btn-submit" :disabled="requesting" @click="requestImagery">
        {{ requesting ? t('satelliteImagery.requesting') : t('satelliteImagery.request') }}
      </button>
    </div>
    <p v-if="error" class="form-error">{{ error }}</p>

    <div v-if="loading" class="tab-loading">...</div>
    <div v-else class="image-grid">
      <div v-for="img in images" :key="img.id" class="image-card">
        <a :href="publicUrl(img.storage_path)" target="_blank" rel="noopener">
          <img :src="publicUrl(img.storage_path)" :alt="img.country_code" loading="lazy" />
        </a>
        <div class="image-meta">
          <span>{{ img.country_code?.toUpperCase() }}</span>
          <span>{{ new Date(img.created_at).toLocaleString() }}</span>
        </div>
      </div>
      <p v-if="!images.length" class="empty-row">{{ t('satelliteImagery.empty') }}</p>
    </div>
  </div>
</template>

<style scoped>
.satellite-imagery-panel { padding: 4px 0; }
.satellite-imagery-panel h3 { margin: 0 0 6px; color: #e2e8f0; }
.panel-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 14px; }
.request-form { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 12px; }
.form-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 110px;
}
.form-field input:disabled { opacity: .5; }
.btn-submit { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: .8rem; margin: 8px 0; }
.tab-loading, .empty-row { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 18px; max-width: 1100px; }
.image-card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; overflow: hidden; }
.image-card a { display: block; cursor: zoom-in; }
.image-card img { width: 100%; display: block; aspect-ratio: 1; object-fit: cover; }
.image-meta { display: flex; justify-content: space-between; padding: 6px 10px; font-size: .72rem; color: var(--color-text-muted,#94a3b8); }
</style>
