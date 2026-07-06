<script setup>
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import HazardEncyclopediaPanel from '@/components/admin/HazardEncyclopediaPanel.vue'

const router = useRouter()
const { t } = useI18n()
</script>

<template>
  <div class="hazard-encyclopedia-page">
    <div class="page-header">
      <div>
        <button class="btn-back" @click="router.push('/')">← Harita</button>
        <h1 class="page-title">🌋 {{ t('hazardTaxonomy.hierarchy.encyclopediaTitle') }}</h1>
      </div>
    </div>

    <HazardEncyclopediaPanel />
  </div>
</template>

<style scoped>
.hazard-encyclopedia-page { max-width: 1100px; margin: 0 auto; padding: 24px 20px 60px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
.btn-back { background: none; border: none; color: var(--color-text-muted,#94a3b8); cursor: pointer; font-size: .85rem; padding: 0 0 8px; }
.page-title { margin: 0; color: #e2e8f0; font-size: 1.4rem; }
</style>
