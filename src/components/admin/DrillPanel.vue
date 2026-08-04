<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useDrillInjectedEventsStore } from '@/stores/drillInjectedEvents.js'
import { useDrillScenarioStepsStore } from '@/stores/drillScenarioSteps.js'
import { supabase } from '@/services/api/config.js'
import { computeResponseTimeSeconds, computeAckRate } from '@/utils/drillMetrics.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'

const emit = defineEmits(['go-to-hazard-taxonomy'])

const { t } = useI18n()
const auth = useAuthStore()
const hazardTypesStore = useHazardTypesStore()
const drillInjectedEventsStore = useDrillInjectedEventsStore()
const drillScenarioStepsStore = useDrillScenarioStepsStore()

const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

// ── Drill sessions ─────────────────────────────────────────────────────────────
const drills = ref([])
const drillsLoading = ref(false)
const drillsError = ref(null)
const showDrillForm = ref(false)
const drillForm = ref({ title: '', country_code: '', scenario_type: 'earthquake', description: '' })
const savingDrill = ref(false)

async function loadDrills() {
  drillsLoading.value = true
  const { data, error } = await supabase
    .from('drill_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) drillsError.value = error.message
  else drills.value = data || []
  drillsLoading.value = false
}

async function startDrill() {
  savingDrill.value = true
  const { error } = await supabase.from('drill_sessions').insert({
    ...drillForm.value,
    status: 'active',
    started_at: new Date().toISOString(),
  })
  savingDrill.value = false
  if (error) {
    drillsError.value = error.message
    return
  }
  showDrillForm.value = false
  await loadDrills()
}

async function endDrill(drill) {
  // spec 013 FR-006: count exercise CAP alerts authored during this drill's
  // active window, so the summary reflects actual drill activity.
  const { count: alertsIssued } = await supabase
    .from('cap_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('is_exercise', true)
    .eq('country_code', drill.country_code)
    .gte('created_at', drill.started_at)

  // spec 017 US1 FR-001: response time = elapsed time from drill start to
  // the first exercise alert issued during it (not last/average — see
  // spec.md Acceptance Scenario 3).
  const { data: exerciseDrafts } = await supabase
    .from('cap_drafts')
    .select('id, created_at')
    .eq('is_exercise', true)
    .eq('country_code', drill.country_code)
    .gte('created_at', drill.started_at)
    .order('created_at', { ascending: true })

  const firstAlertAt = exerciseDrafts?.[0]?.created_at ?? null
  const responseTimeSeconds = computeResponseTimeSeconds(drill.started_at, firstAlertAt)

  // spec 017 US2 FR-005: ack rate is counted only against dispatches that
  // were actually sent, using the same exercise-draft ID set fetched above
  // (analysis finding M1 — a dedicated ID-set query, not a reuse of the
  // alertsIssued aggregate).
  let ackRate = null
  const draftIds = (exerciseDrafts ?? []).map((d) => d.id)
  if (draftIds.length > 0) {
    const { data: jobs } = await supabase.from('dispatch_jobs').select('id').in('cap_draft_id', draftIds)
    const jobIds = (jobs ?? []).map((j) => j.id)
    if (jobIds.length > 0) {
      const { count: sentCount } = await supabase
        .from('dispatch_receipts')
        .select('id', { count: 'exact', head: true })
        .in('dispatch_job_id', jobIds)
        .in('status', ['sent', 'delivered'])
      const { count: ackCount } = await supabase
        .from('dispatch_receipts')
        .select('id', { count: 'exact', head: true })
        .in('dispatch_job_id', jobIds)
        .not('acknowledged_at', 'is', null)
      ackRate = computeAckRate(sentCount ?? 0, ackCount ?? 0)
    }
  }

  const summary = {
    duration_min: Math.round((Date.now() - new Date(drill.started_at).getTime()) / 60000),
    ended_at: new Date().toISOString(),
    alerts_issued: alertsIssued ?? 0,
    response_time_seconds: responseTimeSeconds,
    ack_rate: ackRate,
  }
  const { error } = await supabase
    .from('drill_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString(), summary })
    .eq('id', drill.id)
  if (error) {
    drillsError.value = error.message
    return
  }
  await loadDrills()
}

// spec 037 (US1): simulated hazard injection for an active drill. One shared
// form, keyed by which drill card currently has it open (mirrors the
// single-open pattern used elsewhere in this file, e.g. showDrillForm).
const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'minimal']
const injectingForDrillId = ref(null)
const drillInjectionForm = ref({ hazard_type: '', lat: '', lng: '', severity: 'moderate', description: '' })
const injectingEvent = ref(false)
const drillInjectedEventsByDrill = ref({})

function toggleDrillInjectionForm(drill) {
  if (injectingForDrillId.value === drill.id) {
    injectingForDrillId.value = null
    return
  }
  injectingForDrillId.value = drill.id
  drillInjectionForm.value = { hazard_type: '', lat: '', lng: '', severity: 'moderate', description: '' }
  loadDrillInjectedEvents(drill.id)
  loadDrillScenarioSteps(drill.id)
}

// Scheduled multi-step scenario sequences (spec 037 remaining item): an
// ordered plan of hazard injections, each firing automatically N minutes
// after the drill starts (process_drill_scenario_steps() pg_cron job) —
// distinct from the immediate manual injection form above.
const scenarioStepForm = ref({ delay_minutes: '', hazard_type: '', lat: '', lng: '', severity: 'moderate', description: '' })
const addingScenarioStep = ref(false)

async function loadDrillScenarioSteps(drillId) {
  await drillScenarioStepsStore.fetchSteps(drillId)
}

async function submitScenarioStep(drill) {
  addingScenarioStep.value = true
  const result = await drillScenarioStepsStore.addStep(drill.id, {
    delay_minutes: Number(scenarioStepForm.value.delay_minutes),
    hazard_type: scenarioStepForm.value.hazard_type,
    lat: Number(scenarioStepForm.value.lat),
    lng: Number(scenarioStepForm.value.lng),
    severity: scenarioStepForm.value.severity,
    description: scenarioStepForm.value.description,
  })
  addingScenarioStep.value = false
  if (!result.success) return
  scenarioStepForm.value = { delay_minutes: '', hazard_type: '', lat: '', lng: '', severity: 'moderate', description: '' }
}

async function removeScenarioStep(drillId, stepId) {
  await drillScenarioStepsStore.removeStep(drillId, stepId)
}

async function loadDrillInjectedEvents(drillId) {
  const data = await drillInjectedEventsStore.fetchForActiveDrill(drillId)
  drillInjectedEventsByDrill.value = { ...drillInjectedEventsByDrill.value, [drillId]: data }
}

async function submitDrillInjection(drill) {
  injectingEvent.value = true
  const result = await drillInjectedEventsStore.injectEvent({
    drill_session_id: drill.id,
    country_code: drill.country_code,
    hazard_type: drillInjectionForm.value.hazard_type,
    lat: Number(drillInjectionForm.value.lat),
    lng: Number(drillInjectionForm.value.lng),
    severity: drillInjectionForm.value.severity,
    description: drillInjectionForm.value.description,
  })
  injectingEvent.value = false
  if (!result.success) return
  drillInjectionForm.value = { hazard_type: '', lat: '', lng: '', severity: 'moderate', description: '' }
  await loadDrillInjectedEvents(drill.id)
}

// spec 037 (US3, FR-009): manual removal before a drill ends — independent
// of the RLS-driven auto-hide that happens once a drill is 'completed'.
async function removeDrillInjectedEvent(drillId, eventId) {
  const result = await drillInjectedEventsStore.removeEvent(eventId)
  if (!result.success) return
  await loadDrillInjectedEvents(drillId)
}

// spec 032 (MHEWS-SD-DRILL-02): exports a single completed drill's summary,
// same rowsToCsv/rowsToJson/triggerDownload call pattern as
// downloadComplianceReport()/downloadIncidentReport() — "veri yok" (no data)
// is preserved explicitly rather than silently rendered as 0/empty.
function downloadDrillSummary(drill, format) {
  const s = drill.summary ?? {}
  const flatRows = [
    { drill_id: drill.id, title: drill.title, key: 'duration_min', value: s.duration_min ?? null },
    { drill_id: drill.id, title: drill.title, key: 'alerts_issued', value: s.alerts_issued ?? 0 },
    { drill_id: drill.id, title: drill.title, key: 'response_time_seconds', value: s.response_time_seconds ?? t('admin.drillNoData') },
    {
      drill_id: drill.id,
      title: drill.title,
      key: 'ack_rate',
      value: s.ack_rate ? `${s.ack_rate.acknowledged}/${s.ack_rate.sent}` : t('admin.drillNoData'),
    },
  ]
  if (format === 'csv') {
    triggerDownload(rowsToCsv(flatRows), `drill-summary-${drill.id}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(flatRows), `drill-summary-${drill.id}.json`, 'application/json')
  }
}

// spec 032 (After-Action Feedback Loop): saves an optional free-text
// lessons-learned note plus an optional hazard-type association on a
// completed drill — no new authorization path or audit mechanism needed,
// drill_sessions' existing RLS policies and audit_drill_sessions trigger
// already cover this UPDATE.
const savingDrillFeedback = ref(null)

async function saveDrillFeedback(drill, lessonsLearned, relatedHazardType) {
  savingDrillFeedback.value = drill.id
  const { error } = await supabase
    .from('drill_sessions')
    .update({ lessons_learned: lessonsLearned || null, related_hazard_type: relatedHazardType || null })
    .eq('id', drill.id)
  if (error) drillsError.value = error.message
  else await loadDrills()
  savingDrillFeedback.value = null
}

function goToHazardEditor() {
  emit('go-to-hazard-taxonomy')
}

onMounted(() => {
  loadDrills()
  hazardTypesStore.fetchHazardTypes()
})
</script>

<template>
  <div class="tab-content">
    <div class="tab-actions">
      <button v-if="canAdmin" class="btn-new" @click="showDrillForm = !showDrillForm">
        {{ showDrillForm ? '✕ Kapat' : '+ Tatbikat Başlat' }}
      </button>
    </div>
    <Transition name="slide-down">
      <div v-if="showDrillForm" class="form-card">
        <div class="form-grid">
          <label class="form-field span-2"
            ><span>Tatbikat Adı *</span>
            <input v-model="drillForm.title" placeholder="2025 Deprem Tatbikatı..." />
          </label>
          <label class="form-field"
            ><span>Ülke</span>
            <input v-model="drillForm.country_code" placeholder="tr" maxlength="2" />
          </label>
          <label class="form-field"
            ><span>Senaryo</span>
            <select v-model="drillForm.scenario_type">
              <option value="earthquake">Deprem</option>
              <option value="flood">Sel</option>
              <option value="wildfire">Yangın</option>
              <option value="tsunami">Tsunami</option>
              <option value="multi_hazard">Çok Tehlikeli</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button
            class="btn-submit drill-start"
            @click="startDrill"
            :disabled="savingDrill || !drillForm.title"
          >
            🎯 {{ savingDrill ? 'Başlatılıyor...' : 'Tatbikatı Başlat' }}
          </button>
        </div>
      </div>
    </Transition>
    <div v-if="drillsLoading" class="tab-loading">Yükleniyor...</div>
    <div v-else class="drills-list">
      <div
        v-for="d in drills"
        :key="d.id"
        class="drill-card"
        :class="{ 'drill-active': d.status === 'active' }"
      >
        <div class="drill-top">
          <span class="drill-status" :class="'ds-' + d.status"
            >● {{ d.status.toUpperCase() }}</span
          >
          <span class="drill-country">{{ d.country_code }}</span>
          <span class="drill-scenario">{{ d.scenario_type }}</span>
          <span class="muted" style="margin-left: auto">{{ formatDate(d.created_at) }}</span>
        </div>
        <div class="drill-title">{{ d.title }}</div>
        <div v-if="d.started_at" class="muted" style="font-size: 0.75rem">
          Başladı: {{ formatDate(d.started_at) }}
          <span v-if="d.ended_at"> · Bitti: {{ formatDate(d.ended_at) }}</span>
        </div>
        <div v-if="d.summary" class="drill-summary">
          Süre: {{ d.summary.duration_min }} dk · Uyarı: {{ d.summary.alerts_issued ?? 0 }}
          · {{ t('admin.drillResponseTime') }}: {{ d.summary.response_time_seconds != null ? Math.round(d.summary.response_time_seconds / 60) + ' dk' : t('admin.drillNoData') }}
          · {{ t('admin.drillAckRate') }}: {{ d.summary.ack_rate ? d.summary.ack_rate.acknowledged + ' / ' + d.summary.ack_rate.sent : t('admin.drillNoData') }}
        </div>
        <div v-if="canAdmin && d.status === 'active'" class="drill-actions">
          <button class="btn-end-drill" @click="endDrill(d)">⏹ Tatbikatı Bitir</button>
          <button class="btn-export" @click="toggleDrillInjectionForm(d)">
            🎯 {{ t('drillInjection.form.toggleButton') }}
          </button>
        </div>

        <!-- spec 037: simulated hazard injection, active drills only -->
        <div v-if="canAdmin && injectingForDrillId === d.id" class="drill-injection-form">
          <label class="form-field">
            <span>{{ t('drillInjection.form.hazardType') }}</span>
            <select v-model="drillInjectionForm.hazard_type">
              <option value="" disabled>{{ t('drillInjection.form.hazardTypePlaceholder') }}</option>
              <option v-for="h in hazardTypesStore.activeHazardTypes" :key="h.code" :value="h.code">{{ h.display_name }}</option>
            </select>
          </label>
          <div class="form-grid">
            <label class="form-field">
              <span>{{ t('drillInjection.form.lat') }}</span>
              <input v-model="drillInjectionForm.lat" type="number" step="any" />
            </label>
            <label class="form-field">
              <span>{{ t('drillInjection.form.lng') }}</span>
              <input v-model="drillInjectionForm.lng" type="number" step="any" />
            </label>
          </div>
          <label class="form-field">
            <span>{{ t('drillInjection.form.severity') }}</span>
            <select v-model="drillInjectionForm.severity">
              <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>{{ t('drillInjection.form.description') }}</span>
            <textarea v-model="drillInjectionForm.description" rows="2"></textarea>
          </label>
          <button :disabled="injectingEvent" @click="submitDrillInjection(d)">
            {{ t('drillInjection.form.submit') }}
          </button>

          <ul v-if="drillInjectedEventsByDrill[d.id]?.length" class="drill-injected-list">
            <li v-for="ev in drillInjectedEventsByDrill[d.id]" :key="ev.id">
              <span>🎯 {{ ev.hazard_type }} — {{ ev.description }}</span>
              <button class="btn-export" @click="removeDrillInjectedEvent(d.id, ev.id)">
                {{ t('drillInjection.remove.action') }}
              </button>
            </li>
          </ul>

          <!-- Scheduled multi-step scenario sequence: fires automatically N minutes after drill start -->
          <div class="drill-scenario-sequence">
            <h4>{{ t('drillScenario.title') }}</h4>
            <p class="muted" style="font-size: 0.75rem">{{ t('drillScenario.hint') }}</p>
            <div class="form-grid">
              <label class="form-field">
                <span>{{ t('drillScenario.delayMinutes') }}</span>
                <input v-model="scenarioStepForm.delay_minutes" type="number" min="0" step="1" />
              </label>
              <label class="form-field">
                <span>{{ t('drillInjection.form.hazardType') }}</span>
                <select v-model="scenarioStepForm.hazard_type">
                  <option value="" disabled>{{ t('drillInjection.form.hazardTypePlaceholder') }}</option>
                  <option v-for="h in hazardTypesStore.activeHazardTypes" :key="h.code" :value="h.code">{{ h.display_name }}</option>
                </select>
              </label>
            </div>
            <div class="form-grid">
              <label class="form-field">
                <span>{{ t('drillInjection.form.lat') }}</span>
                <input v-model="scenarioStepForm.lat" type="number" step="any" />
              </label>
              <label class="form-field">
                <span>{{ t('drillInjection.form.lng') }}</span>
                <input v-model="scenarioStepForm.lng" type="number" step="any" />
              </label>
            </div>
            <label class="form-field">
              <span>{{ t('drillInjection.form.severity') }}</span>
              <select v-model="scenarioStepForm.severity">
                <option v-for="s in SEVERITIES" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
            <label class="form-field">
              <span>{{ t('drillInjection.form.description') }}</span>
              <textarea v-model="scenarioStepForm.description" rows="2"></textarea>
            </label>
            <button :disabled="addingScenarioStep" @click="submitScenarioStep(d)">
              {{ t('drillScenario.addStep') }}
            </button>

            <ol v-if="drillScenarioStepsStore.stepsByDrill[d.id]?.length" class="drill-scenario-steps-list">
              <li v-for="step in drillScenarioStepsStore.stepsByDrill[d.id]" :key="step.id">
                <span v-if="step.injected_at">✅</span>
                <span v-else>⏳</span>
                +{{ step.delay_minutes }} {{ t('drillScenario.minutesShort') }} — {{ step.hazard_type }}: {{ step.description }}
                <button v-if="!step.injected_at" class="btn-export" @click="removeScenarioStep(d.id, step.id)">
                  {{ t('drillInjection.remove.action') }}
                </button>
              </li>
            </ol>
          </div>
        </div>

        <div v-if="d.status === 'completed'" class="drill-actions">
          <button class="btn-export" @click="downloadDrillSummary(d, 'csv')">{{ t('admin.drillExportSummary') }} (CSV)</button>
          <button class="btn-export" @click="downloadDrillSummary(d, 'json')">{{ t('admin.drillExportSummary') }} (JSON)</button>
        </div>
        <div v-if="canAdmin && d.status === 'completed'" class="drill-feedback">
          <label>
            <span>{{ t('admin.drillLessonsLearned') }}</span>
            <textarea v-model="d.lessons_learned" rows="2"></textarea>
          </label>
          <label>
            <span>{{ t('admin.drillRelatedHazard') }}</span>
            <select v-model="d.related_hazard_type">
              <option :value="null">—</option>
              <option v-for="h in hazardTypesStore.hazardTypes" :key="h.code" :value="h.code">{{ h.display_name }}</option>
            </select>
          </label>
          <button
            class="btn-export"
            :disabled="savingDrillFeedback === d.id"
            @click="saveDrillFeedback(d, d.lessons_learned, d.related_hazard_type)"
          >{{ t('admin.drillSaveFeedback') }}</button>
          <a v-if="d.related_hazard_type" href="#" class="btn-export" @click.prevent="goToHazardEditor">{{ t('admin.drillGoToThresholdEditor') }}</a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  animation: fade-in 0.2s ease;
  border: 1px solid rgba(148, 163, 184, 0.14);
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.42);
  padding: 16px;
}
@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.tab-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
.tab-loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted, #94a3b8);
}
.btn-new {
  padding: 8px 16px;
  background: rgba(77, 163, 255, 0.18);
  border: 1px solid rgba(77, 163, 255, 0.4);
  border-radius: 8px;
  color: #4da3ff;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.15s;
}
.btn-new:hover {
  background: rgba(77, 163, 255, 0.28);
}
.muted {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.75rem;
}
.btn-export {
  padding: 6px 14px;
  background: rgba(77, 163, 255, 0.15);
  border: 1px solid rgba(77, 163, 255, 0.35);
  border-radius: 8px;
  color: #4da3ff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-export:hover {
  background: rgba(77, 163, 255, 0.25);
}
.form-card {
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 14px;
  margin-bottom: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.span-2 {
  grid-column: span 3;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.form-field input,
.form-field select,
.form-field textarea {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  width: 100%;
}
.form-field select {
  color-scheme: dark;
}
.form-field select option {
  background: #1e2330;
  color: #e2e8f0;
}
.form-field input:focus,
.form-field select:focus {
  outline: none;
  border-color: rgba(77, 163, 255, 0.5);
}
.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.btn-submit {
  padding: 8px 18px;
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  border-radius: 8px;
  color: #22c55e;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
  transition: background 0.15s;
}
.btn-submit.drill-start {
  background: rgba(251, 191, 36, 0.18);
  border-color: rgba(251, 191, 36, 0.4);
  color: #fbbf24;
}
.btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn-submit:not(:disabled):hover {
  background: rgba(34, 197, 94, 0.3);
}
.slide-down-enter-active,
.slide-down-leave-active {
  transition:
    max-height 0.3s ease,
    opacity 0.25s ease;
  max-height: 600px;
  overflow: hidden;
}
.slide-down-enter-from,
.slide-down-leave-to {
  max-height: 0;
  opacity: 0;
}
.drills-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.drill-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
}
.drill-card.drill-active {
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(251, 191, 36, 0.04);
}
.drill-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.drill-status {
  font-size: 0.72rem;
  font-weight: 700;
}
.ds-active {
  color: #fbbf24;
}
.ds-inactive {
  color: #94a3b8;
}
.ds-completed {
  color: #22c55e;
}
.drill-country,
.drill-scenario {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
}
.drill-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 4px;
}
.drill-summary {
  font-size: 0.78rem;
  color: #60a5fa;
  margin-top: 4px;
}
.drill-actions {
  margin-top: 10px;
}
.drill-feedback {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drill-feedback label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.drill-feedback textarea,
.drill-feedback select {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 7px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
  color-scheme: dark;
}
.btn-end-drill {
  padding: 7px 16px;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 8px;
  color: #f87171;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.82rem;
  transition: background 0.15s;
}
.btn-end-drill:hover {
  background: rgba(239, 68, 68, 0.28);
}
</style>
