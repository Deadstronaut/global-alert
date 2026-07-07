<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useSopDocumentsStore } from '@/stores/sopDocuments.js'
import { useCommunityReportsStore } from '@/stores/communityReports.js'
import { supabase } from '@/services/api/config.js'
import { nextStatuses, requiresAAR } from '@/utils/incidentStateMachine.js'

const router = useRouter()
const { t } = useI18n()

const auth = useAuthStore()
const hazardTypesStore = useHazardTypesStore()
const sopDocumentsStore = useSopDocumentsStore()
const communityReportsStore = useCommunityReportsStore()
const incidents = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const error = ref(null)

// spec 011: which incident (by id) is currently prompting for after-action
// notes before a monitoring -> closed transition, and the draft text typed
// so far. Only one incident can have this prompt open at a time.
const aarTargetId = ref(null)
const aarNotes = ref('')

// spec 026: which incident's timeline is currently expanded (only one open
// at a time, mirroring aarTargetId's single-open pattern), and a cache of
// already-fetched timeline rows keyed by incident id so re-toggling open
// doesn't re-fetch.
const timelineOpenId = ref(null)
const timelineEntries = ref({})
const timelineError = ref(null)

// spec 036: same single-open, cache-by-incident-id pattern as the timeline
// toggle above, but for read-only linked community reports.
const linkedReportsOpenId = ref(null)
const linkedReportsCache = ref({})

async function toggleLinkedReports(incident) {
  if (linkedReportsOpenId.value === incident.id) {
    linkedReportsOpenId.value = null
    return
  }
  linkedReportsOpenId.value = incident.id
  if (linkedReportsCache.value[incident.id]) return
  const data = await communityReportsStore.fetchLinkedToIncident(incident.id)
  linkedReportsCache.value = { ...linkedReportsCache.value, [incident.id]: data }
}

// spec 010: sourced from the hazard taxonomy registry instead of a
// hardcoded list, same reasoning as CapView.vue.
const HAZARD_TYPES = computed(() => hazardTypesStore.activeHazardTypes)
const SEVERITIES   = ['critical','high','moderate','low','minimal']

const STATUS_LABELS = {
  open: 'Açık', in_progress: 'Devam Ediyor',
  monitoring: 'İzleniyor', closed: 'Kapatıldı', archived: 'Arşivlendi',
}
const STATUS_COLORS = {
  open: '#ef4444', in_progress: '#f59e0b',
  monitoring: '#60a5fa', closed: '#22c55e', archived: '#6b7280',
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

// spec 011 FR-001/FR-002: the DB now enforces this via guard_incident_transition(),
// but we still pre-validate client-side (nextStatuses()) so users are only ever
// offered buttons for transitions the DB will actually accept, and so the AAR
// prompt appears before a doomed request round-trips to the server (FR-010).
function requestTransition(incident, newStatus) {
  if (requiresAAR(incident.status, newStatus)) {
    aarTargetId.value = incident.id
    aarNotes.value = incident.post_event_notes || ''
    return
  }
  transition(incident, newStatus)
}

function cancelAAR() {
  aarTargetId.value = null
  aarNotes.value = ''
}

function confirmAAR(incident) {
  if (!aarNotes.value.trim()) return
  transition(incident, 'closed', aarNotes.value)
  cancelAAR()
}

async function transition(incident, newStatus, notes) {
  const patch = { status: newStatus }
  if (newStatus === 'closed') {
    patch.closed_at = new Date().toISOString()
    if (notes !== undefined) patch.post_event_notes = notes
  }
  const { error: err } = await supabase
    .from('incidents').update(patch).eq('id', incident.id)
  if (err) {
    // spec 011 FR-010: surface the guard trigger's specific rejection reason
    // rather than a generic message.
    if (err.message?.includes('aar_required')) {
      error.value = t('incidentTracking.aarRequiredError')
    } else if (err.message?.includes('invalid_incident_transition')) {
      error.value = t('incidentTracking.invalidTransitionError')
    } else {
      error.value = err.message
    }
    return
  }
  await loadIncidents()
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

// spec 026 FR-001/FR-002: get_incident_timeline() enforces its own
// authorization mirroring incidents' RLS — a rejected call surfaces here via
// the standard error.value pattern rather than silently showing nothing.
async function toggleTimeline(incident) {
  if (timelineOpenId.value === incident.id) {
    timelineOpenId.value = null
    return
  }
  timelineOpenId.value = incident.id
  timelineError.value = null
  if (timelineEntries.value[incident.id]) return
  const { data, error: err } = await supabase.rpc('get_incident_timeline', { p_incident_id: incident.id })
  if (err) {
    timelineError.value = err.message
    return
  }
  timelineEntries.value = { ...timelineEntries.value, [incident.id]: data ?? [] }
}

// spec 026 contracts/incident-timeline-reports.md client-side rendering rule.
function describeTimelineEntry(entry) {
  if (!entry.old_data) return t('incidentTracking.timeline.created')
  if (entry.old_data.status !== entry.new_data?.status) {
    return t('incidentTracking.timeline.statusChange', { from: entry.old_data.status, to: entry.new_data?.status })
  }
  return t('incidentTracking.timeline.updated')
}

// spec 011 FR-005: SOPs whose hazard_type_code matches this incident's
// hazard_type, sourced from the global SOP repository (empty list is a
// valid, harmless state per spec.md's Edge Cases).
function linkedSops(incident) {
  return sopDocumentsStore.sopsForHazardType(incident.hazard_type)
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
              <option v-for="h in HAZARD_TYPES" :key="h.code" :value="h.code">{{ h.display_name }}</option>
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
        <div v-if="inc.post_event_notes" class="inc-aar">
          <strong>{{ t('incidentTracking.aarLabel') }}:</strong> {{ inc.post_event_notes }}
        </div>
        <div v-if="inc.linked_cap_id" class="inc-linked-cap">
          <a href="#" @click.prevent="router.push({ name: 'cap', query: { draft: inc.linked_cap_id } })">
            🔗 {{ t('incidentTracking.viewOriginatingAlert') }}
          </a>
        </div>

        <button class="btn-timeline" @click="toggleTimeline(inc)">
          🕐 {{ t('incidentTracking.timeline.button') }}
        </button>
        <div v-if="timelineOpenId === inc.id" class="inc-timeline">
          <p v-if="timelineError" class="form-error">{{ timelineError }}</p>
          <ul v-else-if="timelineEntries[inc.id]?.length">
            <li v-for="(entry, idx) in timelineEntries[inc.id]" :key="idx">
              <span>{{ describeTimelineEntry(entry) }}</span>
              <span class="timeline-date">{{ formatDate(entry.created_at) }}</span>
            </li>
          </ul>
          <p v-else class="tab-loading">{{ t('incidentTracking.timeline.loading') }}</p>
        </div>

        <button class="btn-timeline" @click="toggleLinkedReports(inc)">
          📢 {{ t('communityReport.incidentLink.sectionTitle') }}
        </button>
        <div v-if="linkedReportsOpenId === inc.id" class="inc-timeline">
          <ul v-if="linkedReportsCache[inc.id]?.length">
            <li v-for="report in linkedReportsCache[inc.id]" :key="report.id">
              <span>{{ report.description }}</span>
              <span class="timeline-date">{{ formatDate(report.created_at) }}</span>
            </li>
          </ul>
          <p v-else>{{ t('communityReport.incidentLink.noLinkedReports') }}</p>
        </div>

        <div v-if="linkedSops(inc).length" class="inc-sops">
          <strong class="inc-sops-title">{{ t('incidentTracking.linkedSops') }}</strong>
          <ul>
            <li v-for="sop in linkedSops(inc)" :key="sop.id">
              <span>{{ sop.title }}</span>
              <a v-if="sop.reference_url" :href="sop.reference_url" target="_blank" rel="noopener">↗</a>
            </li>
          </ul>
        </div>

        <div v-if="canCreate && aarTargetId === inc.id" class="aar-prompt">
          <label class="form-field">
            <span>{{ t('incidentTracking.aarPromptLabel') }}</span>
            <textarea v-model="aarNotes" rows="3" :placeholder="t('incidentTracking.aarPromptPlaceholder')" />
          </label>
          <div class="aar-actions">
            <button class="btn-transition" @click="cancelAAR">{{ t('incidentTracking.cancel') }}</button>
            <button class="btn-submit" :disabled="!aarNotes.trim()" @click="confirmAAR(inc)">
              {{ t('incidentTracking.confirmClose') }}
            </button>
          </div>
        </div>
        <div v-else-if="canCreate && nextStatuses(inc.status).length" class="inc-actions">
          <button
            v-for="next in nextStatuses(inc.status)"
            :key="next"
            class="btn-transition"
            :style="{ borderColor: STATUS_COLORS[next] }"
            @click="requestTransition(inc, next)"
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
.inc-aar {
  font-size: .78rem; color: var(--color-text-muted,#94a3b8);
  background: rgba(255,255,255,.03); border-radius: 6px; padding: 8px 10px; margin: 6px 0;
}
.btn-timeline {
  background: none; border: 1px solid rgba(255,255,255,.15); border-radius: 6px;
  color: var(--color-text-muted,#94a3b8); font-size: .72rem; padding: 4px 10px;
  cursor: pointer; margin: 6px 0;
}
.btn-timeline:hover { background: rgba(255,255,255,.06); }
.inc-timeline {
  background: rgba(255,255,255,.03); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
}
.inc-timeline ul { margin: 0; padding-left: 18px; font-size: .78rem; color: #cbd5e1; }
.inc-timeline li { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.timeline-date { color: var(--color-text-muted,#94a3b8); font-size: .72rem; white-space: nowrap; }
.inc-linked-cap { font-size: .78rem; margin-bottom: 4px; }
.inc-linked-cap a { color: #4da3ff; text-decoration: none; }
.inc-linked-cap a:hover { text-decoration: underline; }
.inc-sops {
  font-size: .78rem; margin: 8px 0; padding: 8px 10px;
  background: rgba(77,163,255,.06); border: 1px solid rgba(77,163,255,.2); border-radius: 8px;
}
.inc-sops-title { display: block; margin-bottom: 4px; color: #4da3ff; }
.inc-sops ul { margin: 0; padding-left: 18px; }
.inc-sops li { margin-bottom: 2px; }
.inc-sops a { color: #4da3ff; margin-left: 6px; text-decoration: none; }
.aar-prompt {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px; padding: 12px; margin-top: 12px;
}
.aar-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
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
