<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const router = useRouter()

const auth = useAuthStore()
const incidents = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const error = ref(null)

const HAZARD_TYPES = ['earthquake','wildfire','flood','drought','food_security','tsunami','cyclone','volcano','epidemic']
const SEVERITIES   = ['critical','high','moderate','low','minimal']

const STATUS_LABELS = {
  open: 'Açık', in_progress: 'Devam Ediyor',
  monitoring: 'İzleniyor', closed: 'Kapatıldı', archived: 'Arşivlendi',
}
const STATUS_COLORS = {
  open: '#ef4444', in_progress: '#f59e0b',
  monitoring: '#60a5fa', closed: '#22c55e', archived: '#6b7280',
}
const TRANSITIONS = {
  open:        ['in_progress'],
  in_progress: ['monitoring','closed'],
  monitoring:  ['closed'],
  closed:      ['archived'],
  archived:    [],
}

const form = ref({
  title: '',
  description: '',
  hazard_type: 'earthquake',
  severity: 'moderate',
  area_desc: '',
  response_plan: '',
})

const canCreate = computed(() =>
  auth.isSuperAdmin || ['country_admin','org_admin'].includes(auth.session?.role)
)

async function loadIncidents() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (err) error.value = err.message
  else incidents.value = data || []
  loading.value = false
}

async function submitIncident() {
  if (!form.value.title.trim()) return
  submitting.value = true
  error.value = null
  const { error: err } = await supabase.from('incidents').insert({
    ...form.value,
    country_code: auth.countryCode,
    status: 'open',
  })
  submitting.value = false
  if (err) { error.value = err.message; return }
  showForm.value = false
  form.value.title = ''
  form.value.description = ''
  await loadIncidents()
}

async function transition(incident, newStatus) {
  const patch = { status: newStatus }
  if (newStatus === 'closed') patch.closed_at = new Date().toISOString()
  const { error: err } = await supabase
    .from('incidents').update(patch).eq('id', incident.id)
  if (err) { error.value = err.message; return }
  await loadIncidents()
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

onMounted(loadIncidents)
</script>

<template>
  <div class="incidents-page">
    <div class="page-header">
      <div>
        <button class="btn-back" @click="router.push('/')">← Harita</button>
        <h1 class="page-title">🚨 Olay Takip</h1>
        <span class="page-subtitle">Incident Report &amp; Lifecycle Tracking</span>
      </div>
      <button v-if="canCreate" class="btn-new" @click="showForm = !showForm">
        {{ showForm ? '✕ Kapat' : '+ Yeni Olay' }}
      </button>
    </div>

    <!-- Create form -->
    <Transition name="slide-down">
      <div v-if="showForm && canCreate" class="form-card">
        <h3 class="form-title">Yeni Olay Kaydı</h3>
        <div class="form-grid">
          <label class="form-field span-2">
            <span>Başlık *</span>
            <input v-model="form.title" placeholder="Olay başlığı..." />
          </label>
          <label class="form-field">
            <span>Tehlike Türü</span>
            <select v-model="form.hazard_type">
              <option v-for="h in HAZARD_TYPES" :key="h" :value="h">{{ h }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>Şiddet</span>
            <select v-model="form.severity">
              <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="form-field span-2">
            <span>Açıklama</span>
            <textarea v-model="form.description" rows="3" placeholder="Olay detayları..." />
          </label>
          <label class="form-field">
            <span>Etkilenen Bölge</span>
            <input v-model="form.area_desc" placeholder="Konum..." />
          </label>
          <label class="form-field">
            <span>Müdahale Planı</span>
            <input v-model="form.response_plan" placeholder="İlk adımlar..." />
          </label>
        </div>
        <div class="form-actions">
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="btn-submit" @click="submitIncident" :disabled="submitting || !form.title.trim()">
            {{ submitting ? 'Kaydediliyor...' : '💾 Olay Oluştur' }}
          </button>
        </div>
      </div>
    </Transition>

    <div v-if="error && !showForm" class="page-error">{{ error }}</div>
    <div v-if="loading" class="page-loading">Yükleniyor...</div>
    <div v-else-if="!loading && incidents.length === 0" class="page-empty">Kayıtlı olay yok.</div>

    <div v-else class="incidents-list">
      <div v-for="inc in incidents" :key="inc.id" class="incident-card"
           :style="{ borderLeftColor: STATUS_COLORS[inc.status] }">
        <div class="inc-top">
          <span class="inc-hazard">{{ inc.hazard_type }}</span>
          <span class="inc-severity" :class="'sev-' + inc.severity">{{ inc.severity }}</span>
          <span class="inc-status" :style="{ color: STATUS_COLORS[inc.status] }">
            ● {{ STATUS_LABELS[inc.status] }}
          </span>
          <span class="inc-date">{{ formatDate(inc.created_at) }}</span>
        </div>

        <h4 class="inc-title">{{ inc.title }}</h4>
        <p v-if="inc.description" class="inc-desc">{{ inc.description }}</p>
        <div v-if="inc.area_desc" class="inc-area">📍 {{ inc.area_desc }}</div>
        <div v-if="inc.response_plan" class="inc-plan">📋 {{ inc.response_plan }}</div>

        <div v-if="canCreate && TRANSITIONS[inc.status]?.length" class="inc-actions">
          <button
            v-for="next in TRANSITIONS[inc.status]"
            :key="next"
            class="btn-transition"
            :style="{ borderColor: STATUS_COLORS[next] }"
            @click="transition(inc, next)"
          >
            → {{ STATUS_LABELS[next] }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.incidents-page {
  min-height: 100vh;
  background: var(--color-bg, #0f1117);
  color: var(--color-text-primary, #e2e8f0);
  padding: 24px;
  font-family: var(--font-sans, 'Inter', sans-serif);
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}
.btn-back { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--color-text-muted,#94a3b8); padding: 6px 14px; font-size: .8rem; cursor: pointer; transition: background .15s; margin-bottom: 8px; }
.btn-back:hover { background: rgba(255,255,255,.12); color: var(--color-text-primary,#e2e8f0); }
.page-title   { font-size: 1.6rem; font-weight: 800; margin: 0; }
.page-subtitle{ font-size: .75rem; color: var(--color-text-muted,#94a3b8); text-transform: uppercase; letter-spacing: .1em; }

.btn-new {
  padding: 8px 18px;
  background: rgba(77,163,255,.18);
  border: 1px solid rgba(77,163,255,.4);
  border-radius: 8px; color: #4da3ff;
  font-weight: 600; cursor: pointer; font-size: .85rem;
  transition: background .15s;
}
.btn-new:hover { background: rgba(77,163,255,.28); }

.form-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 20px; margin-bottom: 24px;
}
.form-title { font-size: 1rem; font-weight: 700; margin: 0 0 16px; }
.form-grid  { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2     { grid-column: span 2; }
.form-field { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select, .form-field textarea {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15);
  border-radius: 8px; padding: 8px 10px; color: #e2e8f0;
  font-size: .85rem; width: 100%; resize: vertical;
}
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus, .form-field select:focus, .form-field textarea:focus {
  outline: none; border-color: rgba(77,163,255,.5);
}
.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.form-error  { color: #ef4444; font-size: .8rem; flex: 1; }
.btn-submit  {
  padding: 9px 22px; background: rgba(34,197,94,.2);
  border: 1px solid rgba(34,197,94,.4); border-radius: 8px;
  color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s;
}
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }

.page-loading, .page-empty { text-align: center; padding: 48px; color: var(--color-text-muted,#94a3b8); font-size: .9rem; }
.page-error  {
  background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3);
  border-radius: 8px; padding: 10px 14px; color: #ef4444; font-size: .85rem; margin-bottom: 16px;
}

.incidents-list { display: flex; flex-direction: column; gap: 12px; }
.incident-card  {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
  border-left: 3px solid; border-radius: 12px; padding: 16px; transition: border-color .15s;
}
.inc-top  { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
.inc-hazard {
  font-size: .7rem; font-weight: 700; text-transform: uppercase;
  background: rgba(255,255,255,.08); padding: 2px 8px; border-radius: 4px; letter-spacing: .05em;
}
.inc-severity { font-size: .7rem; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 4px; }
.sev-critical { background: rgba(124,58,237,.2); color: #a78bfa; }
.sev-high     { background: rgba(239,68,68,.2);  color: #f87171; }
.sev-moderate { background: rgba(249,115,22,.2); color: #fb923c; }
.sev-low      { background: rgba(251,191,36,.2); color: #fcd34d; }
.sev-minimal  { background: rgba(74,222,128,.2); color: #4ade80; }
.inc-status { font-size: .78rem; font-weight: 600; }
.inc-date   { font-size: .72rem; color: var(--color-text-muted,#94a3b8); margin-left: auto; }
.inc-title  { font-size: 1rem; font-weight: 700; margin: 0 0 6px; }
.inc-desc   { font-size: .82rem; color: var(--color-text-muted,#94a3b8); margin: 0 0 6px; line-height: 1.5; }
.inc-area, .inc-plan { font-size: .78rem; color: #60a5fa; margin-bottom: 4px; }
.inc-actions  { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.btn-transition {
  padding: 5px 12px; background: transparent; border: 1px solid;
  border-radius: 6px; font-size: .75rem; font-weight: 600; cursor: pointer;
  color: var(--color-text-secondary,#cbd5e1); transition: background .15s;
}
.btn-transition:hover { background: rgba(255,255,255,.06); }

.slide-down-enter-active, .slide-down-leave-active { transition: max-height .3s ease, opacity .25s ease; max-height: 700px; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { max-height: 0; opacity: 0; }
</style>
