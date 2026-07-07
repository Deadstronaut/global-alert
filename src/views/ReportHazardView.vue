<script setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import CommunityReportForm from '@/components/CommunityReportForm.vue'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div class="report-hazard-page">
    <div class="page-header">
      <button class="btn-back" @click="router.push('/')">← Harita</button>
    </div>

    <CommunityReportForm />
  </div>
</template>

<style scoped>
.report-hazard-page { max-width: 1100px; margin: 0 auto; padding: 24px 20px 60px; }
.page-header { margin-bottom: 18px; }
.btn-back { background: none; border: none; color: var(--color-text-muted,#94a3b8); cursor: pointer; font-size: .85rem; padding: 0 0 8px; }
</style>
