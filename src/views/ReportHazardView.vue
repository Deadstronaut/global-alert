<script setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CommunityReportForm from '@/components/CommunityReportForm.vue'
import { Button } from '@/components/ui/button'

const router = useRouter()
const { t } = useI18n()

// See CapView.vue's `embedded` prop comment — same Dashboard-inline pattern.
const props = defineProps({ embedded: { type: Boolean, default: false } })
</script>

<template>
  <div class="report-hazard-page" :class="{ embedded }">
    <div class="page-header">
      <div>
        <Button v-if="!embedded" variant="ghost" size="sm" class="btn-back" @click="router.push('/')">← Harita</Button>
        <h1 class="page-title">📢 {{ t('communityReport.form.title') }}</h1>
      </div>
    </div>

    <CommunityReportForm />
  </div>
</template>

<style scoped>
/* Matches CapView.vue/IncidentsView.vue/ShelterInfoView.vue's page pattern —
   see ShelterInfoView.vue's comment for why height+overflow-y (not
   min-height/max-width centering) is needed here. */
.report-hazard-page {
  height: 100dvh;
  overflow-y: auto;
  background: var(--color-bg, #0f1117);
  color: var(--color-text-primary, #e2e8f0);
  padding: 24px;
  font-family: var(--font-sans, 'Inter', sans-serif);
}
.report-hazard-page.embedded {
  height: 100%;
  padding: 0;
  background: transparent;
}
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.btn-back { padding: 0 0 8px; height: auto; }
.page-title { margin: 0; color: #e2e8f0; font-size: 1.4rem; }
</style>
