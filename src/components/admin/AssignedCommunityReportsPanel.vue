<script setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommunityReportsStore } from '@/stores/communityReports.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const store = useCommunityReportsStore()
const hazardTypesStore = useHazardTypesStore()

onMounted(() => {
  store.fetchAssignedToMyOrg()
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
})

function hazardDisplayName(code) {
  return hazardTypesStore.hazardTypes.find((h) => h.code === code)?.display_name ?? code
}

function photoUrl(path) {
  if (!path) return null
  return supabase.storage.from('community-report-photos').getPublicUrl(path).data.publicUrl
}

function audioUrl(path) {
  if (!path) return null
  return supabase.storage.from('community-report-audio').getPublicUrl(path).data.publicUrl
}
</script>

<template>
  <div class="assigned-community-reports-panel">
    <h3>{{ t('communityReport.assigned.tabLabel') }}</h3>

    <p v-if="!store.assignedToMyOrg.length">{{ t('communityReport.assigned.empty') }}</p>

    <!-- Read-only (FR-016): no approve/reject/assign/link controls rendered here. -->
    <div v-for="report in store.assignedToMyOrg" :key="report.id" class="report-card">
      <strong>{{ hazardDisplayName(report.hazard_type) }}</strong>
      <p>{{ report.description }}</p>
      <small>{{ report.lat }}, {{ report.lng }}</small>
      <div v-if="report.photo_path">
        <a :href="photoUrl(report.photo_path)" target="_blank" rel="noopener">
          {{ t('communityReport.moderation.viewPhoto') }}
        </a>
      </div>
      <div v-if="report.audio_path">
        <audio controls :src="audioUrl(report.audio_path)" :aria-label="t('communityReport.moderation.playAudio')"></audio>
      </div>
    </div>
  </div>
</template>

<style scoped>
.report-card { border: 1px solid var(--color-border,#334155); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
</style>
