<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { isPushSupported, subscribeToPush, unsubscribeFromPush, getExistingPushSubscription } from '@/utils/webPush.js'
import countries from '@/configs/countries.json'

const { t } = useI18n()

// ── Web Push opt-in (spec 063) — no account needed, browser-level only ────
const pushSupported = isPushSupported()
const pushCountryCode = ref('')
const pushSubscribed = ref(false)
const pushBusy = ref(false)
const pushError = ref(null)
const countryOptions = Object.entries(countries)
  .map(([code, c]) => ({ code, name: c.nameEn }))
  .sort((a, b) => a.name.localeCompare(b.name))

async function refreshPushState() {
  if (!pushSupported) return
  pushSubscribed.value = !!(await getExistingPushSubscription())
}

async function togglePush() {
  pushError.value = null
  pushBusy.value = true
  try {
    if (pushSubscribed.value) {
      await unsubscribeFromPush()
      pushSubscribed.value = false
    } else {
      if (!pushCountryCode.value) { pushError.value = t('portal.pushCountryRequired'); return }
      await subscribeToPush({ countryCode: pushCountryCode.value })
      pushSubscribed.value = true
    }
  } catch (err) {
    pushError.value = err.message
  } finally {
    pushBusy.value = false
  }
}

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

onMounted(() => {
  loadAlerts()
  refreshPushState()
})
</script>

<template>
  <div class="portal-page">
    <header class="portal-header">
      <h1>{{ t('portal.title') }}</h1>
      <p class="portal-subtitle">{{ t('portal.subtitle') }}</p>
    </header>

    <div v-if="pushSupported" class="push-optin">
      <template v-if="pushSubscribed">
        <span class="push-status">{{ t('portal.pushSubscribed') }}</span>
        <button class="push-btn push-btn-secondary" :disabled="pushBusy" @click="togglePush">
          {{ pushBusy ? '...' : t('portal.pushUnsubscribe') }}
        </button>
      </template>
      <template v-else>
        <select v-model="pushCountryCode" class="push-country-select">
          <option value="">{{ t('portal.pushSelectCountry') }}</option>
          <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>
        <button class="push-btn" :disabled="pushBusy" @click="togglePush">
          {{ pushBusy ? '...' : t('portal.pushSubscribe') }}
        </button>
      </template>
      <p v-if="pushError" class="portal-error">{{ pushError }}</p>
    </div>

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
.push-optin {
  display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap;
  margin: 0 0 24px; padding: 12px 16px; background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.1); border-radius: 10px;
}
.push-country-select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; color-scheme: dark;
}
.push-btn {
  padding: 8px 16px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem;
}
.push-btn:disabled { opacity: .5; cursor: not-allowed; }
.push-btn-secondary { background: rgba(255,255,255,.06); border-color: rgba(255,255,255,.15); color: #cbd5e1; }
.push-status { font-size: .85rem; color: #22c55e; }
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
