<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import countries from '@/configs/countries.json'

const { t } = useI18n()
const auth = useAuthStore()

const sources = ref([])
const alerts = ref([])
const loading = ref(false)
const error = ref(null)

const countryOptions = Object.entries(countries)
  .map(([code, c]) => ({ code, name: c.nameEn }))
  .sort((a, b) => a.name.localeCompare(b.name))

const newSourceName = ref('')
const newSourceCountry = ref(auth.isSuperAdmin ? '' : (auth.countryCode ?? ''))
const creatingSource = ref(false)
const revealedToken = ref(null) // { sourceId, token } — shown once right after create/rotate

async function loadSources() {
  const { data, error: err } = await supabase.from('cap_inbound_sources').select('*').order('created_at', { ascending: false })
  if (err) error.value = err.message
  else sources.value = data ?? []
}

async function loadAlerts() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('cap_inbound_alerts')
    .select('*')
    .order('received_at', { ascending: false })
    .limit(50)
  if (err) error.value = err.message
  else alerts.value = data ?? []
  loading.value = false
}

onMounted(() => {
  loadSources()
  loadAlerts()
})

async function createSource() {
  if (!newSourceName.value.trim() || !newSourceCountry.value) return
  creatingSource.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('cap_inbound_sources')
    .insert({
      country_code: newSourceCountry.value.toLowerCase(),
      name: newSourceName.value.trim(),
    })
    .select()
    .single()
  creatingSource.value = false
  if (err) { error.value = err.message; return }
  newSourceName.value = ''
  revealedToken.value = { sourceId: data.id, token: data.ingest_token }
  await loadSources()
}

async function toggleSourceActive(source) {
  const { error: err } = await supabase.from('cap_inbound_sources').update({ is_active: !source.is_active }).eq('id', source.id)
  if (err) error.value = err.message
  else await loadSources()
}

async function promote(alert) {
  const { error: err } = await supabase.rpc('promote_cap_inbound_alert', { p_inbound_id: alert.id })
  if (err) error.value = err.message
  else await loadAlerts()
}

async function reject(alert) {
  const { error: err } = await supabase.rpc('reject_cap_inbound_alert', { p_inbound_id: alert.id })
  if (err) error.value = err.message
  else await loadAlerts()
}

function statusLabel(status) {
  return t(`capInbound.statusValue.${status}`)
}
</script>

<template>
  <div class="cap-inbound-panel">
    <div class="inbound-section">
      <h3>{{ t('capInbound.sourcesTitle') }}</h3>
      <p class="panel-hint">{{ t('capInbound.sourcesHint') }}</p>
      <div class="source-create-row">
        <input v-model="newSourceName" :placeholder="t('capInbound.sourceNamePlaceholder')" />
        <select v-if="auth.isSuperAdmin" v-model="newSourceCountry">
          <option value="">— {{ t('capInbound.country') }} —</option>
          <option v-for="c in countryOptions" :key="c.code" :value="c.code">{{ c.name }}</option>
        </select>
        <button class="btn-submit" :disabled="creatingSource" @click="createSource">{{ t('capInbound.createSource') }}</button>
      </div>
      <div v-if="revealedToken" class="token-reveal">
        {{ t('capInbound.tokenRevealHint') }}
        <code>{{ revealedToken.token }}</code>
      </div>
      <table class="inbound-table">
        <thead>
          <tr>
            <th>{{ t('capInbound.sourceName') }}</th>
            <th>{{ t('capInbound.country') }}</th>
            <th>{{ t('capInbound.status') }}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in sources" :key="s.id">
            <td>{{ s.name }}</td>
            <td>{{ s.country_code?.toUpperCase() || '—' }}</td>
            <td>{{ s.is_active ? t('capInbound.active') : t('capInbound.inactive') }}</td>
            <td><button class="btn-link" @click="toggleSourceActive(s)">{{ s.is_active ? t('capInbound.deactivate') : t('capInbound.activate') }}</button></td>
          </tr>
          <tr v-if="!sources.length"><td colspan="4" class="empty-row">{{ t('capInbound.noSources') }}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="inbound-section">
      <h3>{{ t('capInbound.alertsTitle') }}</h3>
      <div v-if="error" class="form-error">{{ error }}</div>
      <div v-if="loading" class="tab-loading">...</div>
      <div v-else v-for="a in alerts" :key="a.id" class="inbound-row">
        <div class="inbound-row-header">
          <strong>{{ a.parsed_headline || t('capInbound.noHeadline') }}</strong>
          <span :class="['status-badge', `status-${a.status}`]">{{ statusLabel(a.status) }}</span>
        </div>
        <p class="inbound-meta">
          {{ a.parsed_event || '—' }} · {{ a.parsed_severity || '—' }} · {{ a.country_code?.toUpperCase() }}
          · {{ new Date(a.received_at).toLocaleString() }}
        </p>
        <p v-if="a.parsed_area_desc" class="inbound-area">{{ a.parsed_area_desc }}</p>
        <details class="inbound-raw">
          <summary>{{ t('capInbound.viewRaw') }}</summary>
          <pre>{{ a.raw_payload }}</pre>
        </details>
        <div v-if="a.status !== 'promoted' && a.status !== 'rejected'" class="inbound-actions">
          <button class="btn-submit" @click="promote(a)">{{ t('capInbound.promote') }}</button>
          <button class="btn-reject" @click="reject(a)">{{ t('capInbound.reject') }}</button>
        </div>
      </div>
      <p v-if="!loading && !alerts.length" class="empty-row">{{ t('capInbound.noAlerts') }}</p>
    </div>
  </div>
</template>

<style scoped>
.cap-inbound-panel { display: flex; flex-direction: column; gap: 24px; }
.inbound-section h3 { margin: 0 0 6px; color: #e2e8f0; font-size: .95rem; }
.panel-hint { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 12px; }
.source-create-row { display: flex; gap: 10px; margin-bottom: 10px; }
.source-create-row input, .source-create-row select {
  flex: 1; background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; color-scheme: dark;
}
.token-reveal { font-size: .78rem; color: #eab308; background: rgba(234,179,8,.1); border: 1px solid rgba(234,179,8,.3); border-radius: 8px; padding: 10px; margin-bottom: 10px; }
.token-reveal code { display: block; margin-top: 4px; word-break: break-all; color: #fbbf24; }
.inbound-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.inbound-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.inbound-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.btn-link { background: none; border: none; color: #4aa3ff; cursor: pointer; font-size: .78rem; padding: 0; }
.btn-submit { padding: 8px 16px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .82rem; margin-top: 8px; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.inbound-actions { display: flex; gap: 8px; }
.btn-reject { padding: 8px 16px; background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.4); border-radius: 8px; color: #ef4444; font-weight: 600; cursor: pointer; font-size: .82rem; margin-top: 8px; }
.form-error { color: #ef4444; font-size: .8rem; margin-bottom: 8px; }
.tab-loading, .empty-row { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.inbound-row { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.inbound-row-header { display: flex; justify-content: space-between; align-items: center; }
.inbound-meta { font-size: .75rem; color: var(--color-text-muted,#94a3b8); margin: 4px 0; }
.inbound-area { font-size: .82rem; margin: 4px 0; }
.inbound-raw { font-size: .75rem; color: var(--color-text-muted,#94a3b8); margin-top: 6px; }
.inbound-raw pre { white-space: pre-wrap; word-break: break-all; background: #10141c; padding: 8px; border-radius: 6px; margin-top: 6px; max-height: 200px; overflow-y: auto; }
.status-badge { font-size: .7rem; padding: 2px 8px; border-radius: 10px; }
.status-received { background: rgba(59,130,246,.15); color: #3b82f6; }
.status-reviewed { background: rgba(234,179,8,.15); color: #eab308; }
.status-promoted { background: rgba(34,197,94,.15); color: #22c55e; }
.status-rejected { background: rgba(239,68,68,.15); color: #ef4444; }
</style>
