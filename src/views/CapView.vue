<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const router = useRouter()

const auth = useAuthStore()
const drafts = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const error = ref(null)

const HAZARD_TYPES = ['earthquake','wildfire','flood','drought','food_security','tsunami','cyclone','volcano','epidemic']
const SEVERITIES   = ['critical','high','moderate','low','minimal']
const CERTAINTIES  = ['observed','likely','possible','unlikely','unknown']
const URGENCIES    = ['immediate','expected','future','past','unknown']
const STATUS_LABELS = {
  draft: 'Taslak', pending_approval: 'Onay Bekliyor', approved: 'Onaylandı',
  broadcast: 'Yayınlandı', rejected: 'Reddedildi', cancelled: 'İptal',
  expired: 'Süresi Doldu', false_alarm: 'Yanlış Alarm', all_clear: 'Tehlike Geçti',
}
const STATUS_COLORS = {
  draft: '#94a3b8', pending_approval: '#f59e0b', approved: '#22c55e',
  broadcast: '#4ade80', rejected: '#ef4444', cancelled: '#6b7280',
  expired: '#6b7280', false_alarm: '#f97316', all_clear: '#60a5fa',
}

const form = ref({
  hazard_type: 'earthquake',
  severity: 'moderate',
  certainty: 'likely',
  urgency: 'immediate',
  title: '',
  description: '',
  instructions: '',
  area_desc: '',
  lang: 'en',
  effective_at: new Date().toISOString().slice(0,16),
  expires_at:   new Date(Date.now() + 86400000).toISOString().slice(0,16),
})

// Valid state transitions (FR-0027)
const TRANSITIONS = {
  draft:            ['pending_approval','cancelled'],
  pending_approval: ['approved','rejected','cancelled'],
  approved:         ['broadcast','cancelled'],
  broadcast:        ['false_alarm','all_clear','expired'],
  rejected:         [],
  cancelled:        [],
  expired:          [],
  false_alarm:      [],
  all_clear:        [],
}

const canCreate = computed(() =>
  auth.isSuperAdmin || ['country_admin','org_admin'].includes(auth.session?.role)
)

async function loadDrafts() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('cap_drafts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)
  if (err) error.value = err.message
  else drafts.value = data || []
  loading.value = false
}

async function submitDraft() {
  if (!form.value.title.trim()) return
  submitting.value = true
  error.value = null
  const { error: err } = await supabase.from('cap_drafts').insert({
    ...form.value,
    effective_at: new Date(form.value.effective_at).toISOString(),
    expires_at:   new Date(form.value.expires_at).toISOString(),
    country_code: auth.countryCode,
    status: 'draft',
  })
  submitting.value = false
  if (err) { error.value = err.message; return }
  showForm.value = false
  form.value.title = ''
  form.value.description = ''
  form.value.instructions = ''
  await loadDrafts()
}

async function transition(draft, newStatus) {
  const { error: err } = await supabase
    .from('cap_drafts')
    .update({ status: newStatus, approved_by: newStatus === 'approved' ? auth.session?.id : null })
    .eq('id', draft.id)
  if (err) { error.value = err.message; return }
  await loadDrafts()
}

function allowedTransitions(status) {
  return TRANSITIONS[status] || []
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

onMounted(loadDrafts)
</script>

<template>
  <div class="cap-page">
    <div class="cap-header">
      <div class="cap-title-row">
        <button class="btn-back" @click="router.push('/')">← Harita</button>
        <h1 class="cap-title">⚠️ CAP Uyarı Sistemi</h1>
        <span class="cap-subtitle">Common Alerting Protocol</span>
      </div>
      <button v-if="canCreate" class="btn-new" @click="showForm = !showForm">
        {{ showForm ? '✕ Kapat' : '+ Yeni Uyarı' }}
      </button>
    </div>

    <!-- Create form -->
    <Transition name="slide-down">
      <div v-if="showForm && canCreate" class="cap-form-card">
        <h3 class="form-title">Yeni CAP Taslağı</h3>
        <div class="form-grid">
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
          <label class="form-field">
            <span>Kesinlik</span>
            <select v-model="form.certainty">
              <option v-for="c in CERTAINTIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>Aciliyet</span>
            <select v-model="form.urgency">
              <option v-for="u in URGENCIES" :key="u" :value="u">{{ u }}</option>
            </select>
          </label>
          <label class="form-field span-2">
            <span>Başlık *</span>
            <input v-model="form.title" placeholder="Uyarı başlığı..." />
          </label>
          <label class="form-field span-2">
            <span>Açıklama</span>
            <textarea v-model="form.description" rows="3" placeholder="Durum açıklaması..." />
          </label>
          <label class="form-field span-2">
            <span>Koruyucu Talimatlar</span>
            <textarea v-model="form.instructions" rows="2" placeholder="Halkın yapması gerekenler..." />
          </label>
          <label class="form-field">
            <span>Etkilenen Bölge</span>
            <input v-model="form.area_desc" placeholder="İstanbul, Kadıköy..." />
          </label>
          <label class="form-field">
            <span>Dil</span>
            <select v-model="form.lang">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label class="form-field">
            <span>Geçerlilik Başlangıcı</span>
            <input type="datetime-local" v-model="form.effective_at" />
          </label>
          <label class="form-field">
            <span>Geçerlilik Sonu</span>
            <input type="datetime-local" v-model="form.expires_at" />
          </label>
        </div>
        <div class="form-actions">
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="btn-submit" @click="submitDraft" :disabled="submitting || !form.title.trim()">
            {{ submitting ? 'Kaydediliyor...' : '💾 Taslak Oluştur' }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Error -->
    <div v-if="error && !showForm" class="cap-error">{{ error }}</div>

    <!-- Loading -->
    <div v-if="loading" class="cap-loading">Yükleniyor...</div>

    <!-- Empty -->
    <div v-else-if="!loading && drafts.length === 0" class="cap-empty">
      Henüz uyarı taslağı yok.
    </div>

    <!-- Drafts list -->
    <div v-else class="drafts-list">
      <div v-for="draft in drafts" :key="draft.id" class="draft-card">
        <div class="draft-top">
          <span class="draft-hazard">{{ draft.hazard_type }}</span>
          <span class="draft-severity" :class="'sev-' + draft.severity">{{ draft.severity }}</span>
          <span class="draft-status" :style="{ color: STATUS_COLORS[draft.status] }">
            ● {{ STATUS_LABELS[draft.status] }}
          </span>
          <span class="draft-date">{{ formatDate(draft.created_at) }}</span>
        </div>
        <h4 class="draft-title">{{ draft.title }}</h4>
        <p v-if="draft.description" class="draft-desc">{{ draft.description }}</p>
        <div v-if="draft.area_desc" class="draft-area">📍 {{ draft.area_desc }}</div>
        <div class="draft-validity">
          {{ formatDate(draft.effective_at) }} → {{ formatDate(draft.expires_at) }}
        </div>

        <!-- State transition buttons (FR-0027) -->
        <div v-if="canCreate && allowedTransitions(draft.status).length" class="draft-actions">
          <button
            v-for="next in allowedTransitions(draft.status)"
            :key="next"
            class="btn-transition"
            :style="{ borderColor: STATUS_COLORS[next] }"
            @click="transition(draft, next)"
          >
            → {{ STATUS_LABELS[next] }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cap-page {
  min-height: 100vh;
  background: var(--color-bg, #0f1117);
  color: var(--color-text-primary, #e2e8f0);
  padding: 24px;
  font-family: var(--font-sans, 'Inter', sans-serif);
}

.cap-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.cap-title-row { display: flex; flex-direction: column; gap: 4px; }
.btn-back {
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  padding: 6px 14px;
  font-size: .8rem;
  cursor: pointer;
  transition: background .15s;
  width: fit-content;
}
.btn-back:hover { background: rgba(255,255,255,.12); color: var(--color-text-primary, #e2e8f0); }
.cap-title { font-size: 1.6rem; font-weight: 800; margin: 0; }
.cap-subtitle { font-size: 0.75rem; color: var(--color-text-muted, #94a3b8); text-transform: uppercase; letter-spacing: .1em; }

.btn-new {
  padding: 8px 18px;
  background: rgba(77,163,255,.18);
  border: 1px solid rgba(77,163,255,.4);
  border-radius: 8px;
  color: #4da3ff;
  font-weight: 600;
  cursor: pointer;
  font-size: .85rem;
  transition: background .15s;
}
.btn-new:hover { background: rgba(77,163,255,.28); }

.cap-form-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}
.form-title { font-size: 1rem; font-weight: 700; margin: 0 0 16px; }
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.span-2 { grid-column: span 2; }
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: .78rem;
  color: var(--color-text-muted, #94a3b8);
}
.form-field input,
.form-field select,
.form-field textarea {
  background: #1e2330;
  border: 1px solid rgba(255,255,255,.15);
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: .85rem;
  width: 100%;
  resize: vertical;
}
.form-field select {
  color-scheme: dark;
}
.form-field select option {
  background: #1e2330;
  color: #e2e8f0;
}
.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: none;
  border-color: rgba(77,163,255,.5);
}

.form-actions { display: flex; align-items: center; gap: 12px; margin-top: 16px; }
.form-error { color: #ef4444; font-size: .8rem; flex: 1; }
.btn-submit {
  padding: 9px 22px;
  background: rgba(34,197,94,.2);
  border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px;
  color: #22c55e;
  font-weight: 600;
  cursor: pointer;
  font-size: .85rem;
  transition: background .15s;
}
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }

.cap-loading, .cap-empty {
  text-align: center;
  padding: 48px;
  color: var(--color-text-muted, #94a3b8);
  font-size: .9rem;
}
.cap-error {
  background: rgba(239,68,68,.12);
  border: 1px solid rgba(239,68,68,.3);
  border-radius: 8px;
  padding: 10px 14px;
  color: #ef4444;
  font-size: .85rem;
  margin-bottom: 16px;
}

.drafts-list { display: flex; flex-direction: column; gap: 12px; }
.draft-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: 16px;
  transition: border-color .15s;
}
.draft-card:hover { border-color: rgba(255,255,255,.18); }

.draft-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.draft-hazard {
  font-size: .7rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(255,255,255,.08);
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: .05em;
}
.draft-severity {
  font-size: .7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 4px;
}
.sev-critical { background: rgba(124,58,237,.2); color: #a78bfa; }
.sev-high     { background: rgba(239,68,68,.2);  color: #f87171; }
.sev-moderate { background: rgba(249,115,22,.2); color: #fb923c; }
.sev-low      { background: rgba(251,191,36,.2); color: #fcd34d; }
.sev-minimal  { background: rgba(74,222,128,.2); color: #4ade80; }

.draft-status { font-size: .78rem; font-weight: 600; }
.draft-date   { font-size: .72rem; color: var(--color-text-muted, #94a3b8); margin-left: auto; }

.draft-title { font-size: 1rem; font-weight: 700; margin: 0 0 6px; }
.draft-desc  { font-size: .82rem; color: var(--color-text-muted, #94a3b8); margin: 0 0 6px; line-height: 1.5; }
.draft-area  { font-size: .78rem; color: #60a5fa; margin-bottom: 4px; }
.draft-validity { font-size: .72rem; color: var(--color-text-muted, #94a3b8); font-family: monospace; }

.draft-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
.btn-transition {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid;
  border-radius: 6px;
  font-size: .75rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-text-secondary, #cbd5e1);
  transition: background .15s;
}
.btn-transition:hover { background: rgba(255,255,255,.06); }

.slide-down-enter-active, .slide-down-leave-active {
  transition: max-height .3s ease, opacity .25s ease;
  max-height: 800px;
  overflow: hidden;
}
.slide-down-enter-from, .slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
</style>
