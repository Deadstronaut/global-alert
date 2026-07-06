<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

// Unauthenticated route (spec 009 US4). The existing viewer_cap_read_public
// RLS policy on cap_drafts already permits anon SELECT on 'broadcast' (and
// terminal-after-broadcast) rows — no new RLS policy was needed for this
// view (data-model.md/research.md). This query still filters client-side to
// status = 'broadcast' AND expires_at > now() (FR-013/FR-014): the RLS
// policy is intentionally broader (it also covers false_alarm/all_clear/
// expired so those states remain auditable), the portal itself only ever
// displays the currently-active subset.

const alerts = ref([])
const loading = ref(true)
const error = ref(null)

async function loadAlerts() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('cap_drafts')
    .select('id, title, description, hazard_type, severity, area_desc, effective_at, expires_at')
    .eq('status', 'broadcast')
    .gt('expires_at', new Date().toISOString())
    .order('effective_at', { ascending: false })
  if (err) error.value = err.message
  else alerts.value = data ?? []
  loading.value = false
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

onMounted(loadAlerts)
</script>

<template>
  <div class="portal-page">
    <header class="portal-header">
      <h1>{{ t('portal.title') }}</h1>
      <p class="portal-subtitle">{{ t('portal.subtitle') }}</p>
    </header>

    <div v-if="error" class="portal-error">{{ error }}</div>
    <div v-if="loading" class="portal-loading">...</div>

    <div v-else class="alert-list">
      <div v-if="!alerts.length" class="portal-empty">{{ t('portal.empty') }}</div>
      <article v-for="a in alerts" :key="a.id" :class="['alert-card', `severity-${a.severity}`]">
        <div class="alert-card-header">
          <span class="alert-hazard">{{ a.hazard_type }}</span>
          <span class="alert-severity">{{ a.severity }}</span>
        </div>
        <h2 class="alert-title">{{ a.title }}</h2>
        <p v-if="a.area_desc" class="alert-area">{{ a.area_desc }}</p>
        <p v-if="a.description" class="alert-description">{{ a.description }}</p>
        <div class="alert-meta">
          <span>{{ t('portal.issuedLabel') }}: {{ formatDate(a.effective_at) }}</span>
          <span>{{ t('portal.expiresLabel') }}: {{ formatDate(a.expires_at) }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.portal-page { max-width: 720px; margin: 0 auto; padding: 32px 20px; color: #e2e8f0; }
.portal-header { text-align: center; margin-bottom: 28px; }
.portal-header h1 { margin: 0; font-size: 1.6rem; }
.portal-subtitle { color: #94a3b8; font-size: .85rem; margin-top: 4px; }
.portal-error { color: #ef4444; text-align: center; }
.portal-loading, .portal-empty { text-align: center; color: #94a3b8; padding: 30px 0; }
.alert-list { display: flex; flex-direction: column; gap: 14px; }
.alert-card {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px 18px;
}
.alert-card.severity-critical { border-color: rgba(239,68,68,.5); }
.alert-card.severity-high { border-color: rgba(245,158,11,.5); }
.alert-card-header { display: flex; justify-content: space-between; font-size: .75rem; text-transform: uppercase; color: #94a3b8; margin-bottom: 6px; }
.alert-title { margin: 0 0 8px; font-size: 1.1rem; }
.alert-area, .alert-description { margin: 0 0 8px; font-size: .88rem; color: #cbd5e1; }
.alert-meta { display: flex; justify-content: space-between; font-size: .72rem; color: #94a3b8; margin-top: 10px; }
</style>
