<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const emit = defineEmits(['location-selected'])

const query = ref('')
const searching = ref(false)
const error = ref(null)
const noResults = ref(false)

async function search() {
  if (!query.value.trim()) return
  searching.value = true
  error.value = null
  noResults.value = false
  const { data, error: invokeError } = await supabase.functions.invoke('geocode-search', {
    body: { query: query.value.trim() },
  })
  searching.value = false
  if (invokeError || data?.error) {
    error.value = data?.error || invokeError?.message || t('impact.geocoding.error')
    return
  }
  const results = data?.results || []
  if (results.length === 0) {
    noResults.value = true
    return
  }
  emit('location-selected', results[0])
}
</script>

<template>
  <div class="geocoding-search">
    <div class="geocoding-row">
      <input
        v-model="query"
        class="geocoding-input"
        :placeholder="t('impact.geocoding.placeholder')"
        @keyup.enter="search"
      />
      <button class="geocoding-btn" :disabled="searching" @click="search">
        {{ searching ? t('impact.geocoding.searching') : t('impact.geocoding.search') }}
      </button>
    </div>
    <p v-if="noResults" class="geocoding-notice">{{ t('impact.geocoding.noResults') }}</p>
    <p v-if="error" class="geocoding-notice geocoding-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.geocoding-search {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.geocoding-row { display: flex; }
.geocoding-input {
  width: 280px; padding: 8px 14px; border-radius: 20px 0 0 20px;
  border: 1px solid rgba(255,255,255,.2); background: rgba(15,17,23,.85);
  color: #e2e8f0; font-size: .85rem;
}
.geocoding-btn {
  padding: 8px 16px; border-radius: 0 20px 20px 0; border: 1px solid rgba(255,255,255,.2);
  border-left: none; background: rgba(77,163,255,.25); color: #4da3ff; font-size: .8rem;
  font-weight: 600; cursor: pointer;
}
.geocoding-btn:disabled { opacity: .5; cursor: not-allowed; }
.geocoding-notice {
  background: rgba(15,17,23,.9); padding: 4px 12px; border-radius: 8px;
  font-size: .75rem; color: #94a3b8; margin: 0;
}
.geocoding-error { color: #ef4444; }
</style>
