<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { supabase } from '@/services/api/config.js'
import { allowedTransitions, isDraftCompleteForApproval, canUserActOnDraft } from '@/lib/capStateMachine.js'
import { generateCapXml, generateCapJson } from '@/lib/capExport.js'
import { buildEvidencePackageManifest } from '@/lib/evidencePackage.js'
import { rowsToCsv } from '@/lib/auditExport.js'
import JSZip from 'jszip'

const router = useRouter()
const { t } = useI18n()

const auth = useAuthStore()
const disaster = useDisasterStore()
const hazardTypesStore = useHazardTypesStore()

const drafts = ref([])
const loading = ref(false)
const showForm = ref(false)
const submitting = ref(false)
const error = ref(null)
const activeTab = ref('active') // 'active' | 'history'

// spec 010: sourced from the hazard taxonomy registry instead of a hardcoded
// list — a CAP alert can be authored for any registered hazard type, unlike
// ManualEntryForm/FileImportForm/SourceFormModal which are limited to
// hazard types with a dedicated disaster table.
const HAZARD_TYPES = computed(() => hazardTypesStore.activeHazardTypes)
const SEVERITIES   = ['critical','high','moderate','low','minimal']
const CERTAINTIES  = ['observed','likely','possible','unlikely','unknown']
const URGENCIES    = ['immediate','expected','future','past','unknown']
const ACTIVE_STATUSES  = ['draft','pending_approval','approved','broadcast']
const HISTORY_STATUSES = ['rejected','cancelled','expired','false_alarm','all_clear']
const STATUS_COLORS = {
  draft: '#94a3b8', pending_approval: '#f59e0b', approved: '#22c55e',
  broadcast: '#4ade80', rejected: '#ef4444', cancelled: '#6b7280',
  expired: '#6b7280', false_alarm: '#f97316', all_clear: '#60a5fa',
}

const selectedSourceEventId = ref(null)

const form = ref({
  hazard_type: 'earthquake',
  severity: 'moderate',
  certainty: 'likely',
  urgency: 'immediate',
  title: '',
  description: '',
  instructions: '',
  area_desc: '',
  region_code: '',
  lang: 'en',
  effective_at: new Date().toISOString().slice(0,16),
  expires_at:   new Date(Date.now() + 86400000).toISOString().slice(0,16),
})

// Reason prompt modal state (reject/cancel — spec 006 FR-011)
const reasonPrompt = ref(null) // { draft, targetStatus, reason }

const canCreate = computed(() =>
  auth.isSuperAdmin || ['country_admin','org_admin'].includes(auth.session?.role)
)

const detectedEvents = computed(() => disaster.allEvents?.value ?? disaster.allEvents ?? [])

const visibleDrafts = computed(() => {
  const statuses = activeTab.value === 'active' ? ACTIVE_STATUSES : HISTORY_STATUSES
  return drafts.value.filter(d => statuses.includes(d.status))
})

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

function startBlankDraft() {
  selectedSourceEventId.value = null
  showForm.value = true
}

function startFromEvent(event) {
  selectedSourceEventId.value = String(event.id ?? '')
  form.value.hazard_type = event.type || form.value.hazard_type
  form.value.severity = event.severity || form.value.severity
  form.value.area_desc = event.title || form.value.area_desc
  showForm.value = true
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
    org_id: auth.session?.orgId ?? null,
    source_event_id: selectedSourceEventId.value,
    status: 'draft',
  })
  submitting.value = false
  if (err) { error.value = translateError(err.message); return }
  showForm.value = false
  selectedSourceEventId.value = null
  form.value.title = ''
  form.value.description = ''
  form.value.instructions = ''
  form.value.region_code = ''
  await loadDrafts()
}

function translateError(message) {
  if (!message) return t('cap.errors.generic')
  if (message.includes('incomplete_draft')) return t('cap.errors.incompleteDraft', { fields: '' })
  if (message.includes('four_eyes_violation')) return t('cap.errors.fourEyes')
  if (message.includes('invalid_transition') || message.includes('stale')) return t('cap.errors.staleStatus')
  if (message.includes('reason_required')) return t('cap.errors.reasonRequired')
  return message
}

function requiresReason(status) {
  return status === 'rejected' || status === 'cancelled'
}

function requestTransition(draft, newStatus) {
  if (requiresReason(newStatus)) {
    reasonPrompt.value = { draft, targetStatus: newStatus, reason: '' }
    return
  }
  performTransition(draft, newStatus, {})
}

async function confirmReasonPrompt() {
  if (!reasonPrompt.value) return
  const { draft, targetStatus, reason } = reasonPrompt.value
  if (!reason.trim()) { error.value = t('cap.errors.reasonRequired'); return }
  const extra = targetStatus === 'rejected'
    ? { rejection_reason: reason.trim() }
    : { cancellation_reason: reason.trim() }
  await performTransition(draft, targetStatus, extra)
  reasonPrompt.value = null
}

async function performTransition(draft, newStatus, extra) {
  const payload = { status: newStatus, ...extra }
  if (newStatus === 'approved') payload.approved_by = auth.session?.id
  if (['approved','rejected'].includes(newStatus)) payload.last_edited_by = auth.session?.id
  const { error: err } = await supabase
    .from('cap_drafts')
    .update(payload)
    .eq('id', draft.id)
  if (err) { error.value = translateError(err.message) }
  await loadDrafts()
}

function reviseDraft(draft) {
  performTransition(draft, 'draft', { last_edited_by: auth.session?.id })
}

function allowedTransitionsFor(draft) {
  const all = allowedTransitions(draft.status)
  if (draft.status === 'pending_approval') {
    // Four-eyes: approve/reject hidden for the draft's own author/last editor.
    if (!canUserActOnDraft(draft, auth.session?.id)) {
      return all.filter(s => !['approved','rejected'].includes(s))
    }
  }
  if (draft.status === 'rejected') {
    // Resubmission is author-only.
    return draft.created_by === auth.session?.id ? all : []
  }
  return all
}

function actionLabel(status) {
  const map = {
    pending_approval: t('cap.actions.submitForApproval'),
    approved: t('cap.actions.approve'),
    rejected: t('cap.actions.reject'),
    broadcast: t('cap.actions.broadcast'),
    cancelled: t('cap.actions.cancel'),
    draft: t('cap.actions.revise'),
  }
  return map[status] || status
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString() : '—'
}

// spec 011 FR-007/FR-008: operator convenience — pre-fill a new incident
// from a broadcast alert's own fields and link back to it. Existing
// `incidents` RLS insert policies (unchanged by this spec) continue to
// scope who may perform this insert.
const creatingIncidentFor = ref(null)

async function createIncidentFromDraft(draft) {
  creatingIncidentFor.value = draft.id
  const { error: err } = await supabase.from('incidents').insert({
    title: draft.title,
    description: draft.description,
    hazard_type: draft.hazard_type,
    severity: draft.severity,
    area_desc: draft.area_desc,
    country_code: draft.country_code,
    linked_cap_id: draft.id,
    status: 'open',
  })
  creatingIncidentFor.value = null
  if (err) { error.value = err.message; return }
  router.push({ name: 'incidents' })
}

// spec 014 FR-003/FR-005/FR-007: export a broadcast-or-later alert as a
// CAP v1.2-compliant XML/JSON document. Gated on broadcast_at (not status,
// since a 'cancelled' draft may have been cancelled before ever broadcasting
// — see contracts/cap-export.md).
async function fetchSupersededDraft(draft) {
  if (!draft.supersedes_id) return null
  const { data } = await supabase
    .from('cap_drafts')
    .select('sender, id, effective_at')
    .eq('id', draft.supersedes_id)
    .maybeSingle()
  return data ?? null
}

function triggerDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function exportCapXml(draft) {
  const superseded = await fetchSupersededDraft(draft)
  triggerDownload(`cap-${draft.id}.xml`, generateCapXml(draft, superseded), 'application/xml')
}

async function exportCapJson(draft) {
  const superseded = await fetchSupersededDraft(draft)
  triggerDownload(`cap-${draft.id}.json`, JSON.stringify(generateCapJson(draft, superseded), null, 2), 'application/json')
}

// spec 035 (US2/FR-005-007): CAP XML + dispatch receipts + related audit_log
// rows bundled into a single downloadable .zip — only meaningful once a
// draft has actually reached recipients (same broadcast_at gate as the CAP
// XML/JSON export above).
const buildingEvidenceFor = ref(null)

async function downloadEvidencePackage(draft) {
  if (!draft.broadcast_at) return
  buildingEvidenceFor.value = draft.id
  try {
    const superseded = await fetchSupersededDraft(draft)
    const xml = generateCapXml(draft, superseded)

    const { data: receipts } = await supabase
      .from('dispatch_receipts')
      .select('*, dispatch_jobs!inner(cap_draft_id)')
      .eq('dispatch_jobs.cap_draft_id', draft.id)
    const { data: auditRows } = await supabase
      .from('audit_log')
      .select('*')
      .eq('table_name', 'cap_drafts')
      .eq('record_id', draft.id)

    const zip = new JSZip()
    zip.file('alert.xml', xml)
    zip.file('receipts.csv', rowsToCsv(receipts ?? []))
    zip.file('audit-log.csv', rowsToCsv(auditRows ?? []))
    zip.file(
      'manifest.json',
      JSON.stringify(
        buildEvidencePackageManifest({
          capDraftId: draft.id,
          receiptCount: receipts?.length ?? 0,
          auditLogCount: auditRows?.length ?? 0,
        }),
        null,
        2,
      ),
    )

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `evidence-package-${draft.id}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    buildingEvidenceFor.value = null
  }
}

onMounted(loadDrafts)
</script>

<template>
  <div class="cap-page">
    <div class="cap-header">
      <div class="cap-title-row">
        <button class="btn-back" @click="router.push('/')">{{ t('cap.backToMap') }}</button>
        <h1 class="cap-title">⚠️ {{ t('cap.title') }}</h1>
        <span class="cap-subtitle">{{ t('cap.subtitle') }}</span>
      </div>
      <button v-if="canCreate" class="btn-new" @click="showForm = !showForm">
        {{ showForm ? t('cap.close') : t('cap.newAlert') }}
      </button>
    </div>

    <!-- Event picker + create form -->
    <Transition name="slide-down">
      <div v-if="showForm && canCreate" class="cap-form-card">
        <div v-if="detectedEvents.length" class="event-picker">
          <h4 class="event-picker-heading">{{ t('cap.pickEvent.heading') }}</h4>
          <div class="event-list">
            <button
              v-for="ev in detectedEvents.slice(0, 8)"
              :key="ev.id"
              class="event-chip"
              @click="startFromEvent(ev)"
            >
              {{ ev.type }} · {{ ev.severity }} · {{ ev.title || ev.id }}
            </button>
          </div>
          <button class="btn-blank" @click="startBlankDraft">{{ t('cap.pickEvent.orBlank') }}</button>
        </div>

        <h3 class="form-title">{{ t('cap.form.title') }}</h3>
        <div class="form-grid">
          <label class="form-field">
            <span>{{ t('cap.form.hazardType') }}</span>
            <select v-model="form.hazard_type">
              <option v-for="h in HAZARD_TYPES" :key="h.code" :value="h.code">{{ h.display_name }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.severity') }}</span>
            <select v-model="form.severity">
              <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.certainty') }}</span>
            <select v-model="form.certainty">
              <option v-for="c in CERTAINTIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.urgency') }}</span>
            <select v-model="form.urgency">
              <option v-for="u in URGENCIES" :key="u" :value="u">{{ u }}</option>
            </select>
          </label>
          <label class="form-field span-2">
            <span>{{ t('cap.form.titleLabel') }}</span>
            <input v-model="form.title" :placeholder="t('cap.form.titlePlaceholder')" />
          </label>
          <label class="form-field span-2">
            <span>{{ t('cap.form.description') }}</span>
            <textarea v-model="form.description" rows="3" :placeholder="t('cap.form.descriptionPlaceholder')" />
          </label>
          <label class="form-field span-2">
            <span>{{ t('cap.form.instructions') }}</span>
            <textarea v-model="form.instructions" rows="2" :placeholder="t('cap.form.instructionsPlaceholder')" />
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.area') }}</span>
            <input v-model="form.area_desc" :placeholder="t('cap.form.areaPlaceholder')" />
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.regionCode') }}</span>
            <input v-model="form.region_code" :placeholder="t('cap.form.regionCodePlaceholder')" />
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.lang') }}</span>
            <select v-model="form.lang">
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.effectiveAt') }}</span>
            <input type="datetime-local" v-model="form.effective_at" />
          </label>
          <label class="form-field">
            <span>{{ t('cap.form.expiresAt') }}</span>
            <input type="datetime-local" v-model="form.expires_at" />
          </label>
        </div>
        <div class="form-actions">
          <p v-if="error" class="form-error">{{ error }}</p>
          <button class="btn-submit" @click="submitDraft" :disabled="submitting || !form.title.trim()">
            {{ submitting ? t('cap.form.submitting') : t('cap.form.submit') }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- Reason prompt modal -->
    <div v-if="reasonPrompt" class="reason-modal-backdrop" @click.self="reasonPrompt = null">
      <div class="reason-modal">
        <h4>{{ reasonPrompt.targetStatus === 'rejected' ? t('cap.reasonPrompt.rejectTitle') : t('cap.reasonPrompt.cancelTitle') }}</h4>
        <textarea v-model="reasonPrompt.reason" rows="3" :placeholder="t('cap.reasonPrompt.placeholder')" />
        <div class="reason-modal-actions">
          <button class="btn-back" @click="reasonPrompt = null">{{ t('cap.reasonPrompt.cancelButton') }}</button>
          <button class="btn-submit" @click="confirmReasonPrompt">{{ t('cap.reasonPrompt.confirm') }}</button>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="cap-tabs">
      <button :class="['tab-btn', { active: activeTab === 'active' }]" @click="activeTab = 'active'">{{ t('cap.history.activeTab') }}</button>
      <button :class="['tab-btn', { active: activeTab === 'history' }]" @click="activeTab = 'history'">{{ t('cap.history.historyTab') }}</button>
    </div>

    <!-- Error -->
    <div v-if="error && !showForm" class="cap-error">{{ error }}</div>

    <!-- Loading -->
    <div v-if="loading" class="cap-loading">{{ t('cap.loading') }}</div>

    <!-- Empty -->
    <div v-else-if="!loading && visibleDrafts.length === 0" class="cap-empty">
      {{ t('cap.empty') }}
    </div>

    <!-- Drafts list -->
    <div v-else class="drafts-list">
      <div v-for="draft in visibleDrafts" :key="draft.id" class="draft-card" :class="{ 'draft-exercise': draft.is_exercise }">
        <div v-if="draft.is_exercise" class="draft-exercise-badge">🎯 {{ t('cap.exerciseOnly') }}</div>
        <div class="draft-top">
          <span class="draft-hazard">{{ draft.hazard_type }}</span>
          <span class="draft-severity" :class="'sev-' + draft.severity">{{ draft.severity }}</span>
          <span class="draft-status" :style="{ color: STATUS_COLORS[draft.status] }">
            ● {{ t('cap.status.' + draft.status) }}
          </span>
          <span class="draft-date">{{ formatDate(draft.created_at) }}</span>
        </div>
        <h4 class="draft-title">{{ draft.title }}</h4>
        <p v-if="draft.description" class="draft-desc">{{ draft.description }}</p>
        <div v-if="draft.area_desc" class="draft-area">📍 {{ draft.area_desc }}</div>
        <div v-if="draft.region_code" class="draft-region">🎯 {{ t('cap.form.regionCode') }}: {{ draft.region_code }}</div>
        <div class="draft-validity">
          {{ formatDate(draft.effective_at) }} → {{ formatDate(draft.expires_at) }}
        </div>
        <div v-if="draft.status === 'broadcast'" class="draft-readonly">🔒 {{ t('cap.readOnly') }}</div>
        <div v-if="draft.status === 'broadcast' && canCreate" class="draft-create-incident">
          <button
            class="btn-transition"
            :disabled="creatingIncidentFor === draft.id"
            @click="createIncidentFromDraft(draft)"
          >
            🚨 {{ t('incidentTracking.createIncidentFromAlert') }}
          </button>
        </div>
        <div v-if="draft.broadcast_at" class="draft-cap-export">
          <button class="btn-transition" @click="exportCapXml(draft)">📄 {{ t('cap.exportXml') }}</button>
          <button class="btn-transition" @click="exportCapJson(draft)">🗂️ {{ t('cap.exportJson') }}</button>
          <button
            class="btn-transition"
            :disabled="buildingEvidenceFor === draft.id"
            @click="downloadEvidencePackage(draft)"
          >
            📦 {{ buildingEvidenceFor === draft.id ? t('audit.evidence.building') : t('audit.evidence.download') }}
          </button>
        </div>
        <div v-if="draft.rejection_reason" class="draft-reason">{{ t('cap.history.rejectionReason') }}: {{ draft.rejection_reason }}</div>
        <div v-if="draft.cancellation_reason" class="draft-reason">{{ t('cap.history.cancellationReason') }}: {{ draft.cancellation_reason }}</div>

        <div v-if="canCreate && allowedTransitionsFor(draft).length" class="draft-actions">
          <button
            v-for="next in allowedTransitionsFor(draft)"
            :key="next"
            class="btn-transition"
            :style="{ borderColor: STATUS_COLORS[next] }"
            @click="next === 'draft' ? reviseDraft(draft) : requestTransition(draft, next)"
          >
            → {{ actionLabel(next) }}
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
.event-picker { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px dashed rgba(255,255,255,.12); }
.event-picker-heading { font-size: .85rem; font-weight: 700; margin: 0 0 8px; }
.event-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.event-chip {
  padding: 6px 12px;
  background: rgba(77,163,255,.12);
  border: 1px solid rgba(77,163,255,.3);
  border-radius: 999px;
  color: #4da3ff;
  font-size: .75rem;
  cursor: pointer;
}
.event-chip:hover { background: rgba(77,163,255,.22); }
.btn-blank {
  background: transparent;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  padding: 5px 12px;
  font-size: .75rem;
  cursor: pointer;
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

.reason-modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center; z-index: 50;
}
.reason-modal {
  background: #1a1e29; border: 1px solid rgba(255,255,255,.15);
  border-radius: 12px; padding: 20px; width: min(420px, 90vw);
}
.reason-modal h4 { margin: 0 0 12px; font-size: .95rem; }
.reason-modal textarea {
  width: 100%; background: #1e2330; border: 1px solid rgba(255,255,255,.15);
  border-radius: 8px; padding: 8px 10px; color: #e2e8f0; font-size: .85rem; resize: vertical;
}
.reason-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }

.cap-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.tab-btn {
  padding: 6px 16px; background: transparent; border: 1px solid rgba(255,255,255,.15);
  border-radius: 999px; color: var(--color-text-muted, #94a3b8); font-size: .8rem; cursor: pointer;
}
.tab-btn.active { background: rgba(77,163,255,.18); border-color: rgba(77,163,255,.4); color: #4da3ff; }

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
.draft-readonly { font-size: .72rem; color: #fbbf24; margin-top: 6px; }
.draft-create-incident { margin-top: 8px; }
.draft-cap-export { margin-top: 8px; display: flex; gap: 8px; }
.draft-exercise { border: 2px dashed #f97316; }
.draft-exercise-badge {
  display: inline-block; font-size: .72rem; font-weight: 800; letter-spacing: .05em;
  color: #0b0d12; background: #f97316; padding: 3px 10px; border-radius: 6px; margin-bottom: 8px;
}
.draft-reason { font-size: .78rem; color: #f87171; margin-top: 6px; font-style: italic; }

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
