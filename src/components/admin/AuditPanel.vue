<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'
import { buildComplianceChecklist, TEMPLATE_VERSION } from '@/services/complianceChecklist.js'
import RetentionPolicyPanel from '@/components/admin/RetentionPolicyPanel.vue'
import SecurityEventsPanel from '@/components/admin/SecurityEventsPanel.vue'
import SecurityConfigReportPanel from '@/components/admin/SecurityConfigReportPanel.vue'

const { t } = useI18n()

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

const AUDIT_PAGE_SIZE = 25
const AUDIT_EXPORT_CAP = 5000

// ── Audit & Compliance (spec 007) ───────────────────────────────────────────
const auditRows = ref([])
const auditTotalCount = ref(0)
const auditError = ref(null)
const auditPage = ref(0)
const auditLogLoading = ref(false)
const auditFilters = ref({ tableName: '', userId: '', action: '', from: '', to: '' })
const auditExportCapped = ref(false)
const integrityChecking = ref(false)
const integrityResult = ref(null) // null | 'intact' | { seq }
const historyRows = ref(null)
const historyTarget = ref(null)

function buildAuditQuery(query) {
  const f = auditFilters.value
  if (f.tableName) query = query.eq('table_name', f.tableName)
  if (f.userId) query = query.eq('changed_by', f.userId)
  if (f.action) query = query.eq('action', f.action)
  if (f.from) query = query.gte('created_at', f.from)
  if (f.to) query = query.lte('created_at', f.to)
  return query
}

async function loadAuditLog() {
  auditLogLoading.value = true
  const offset = auditPage.value * AUDIT_PAGE_SIZE
  let query = supabase.from('audit_log').select('*', { count: 'exact' })
  query = buildAuditQuery(query)
  const { data, count, error } = await query
    .order('seq', { ascending: false })
    .range(offset, offset + AUDIT_PAGE_SIZE - 1)
  if (!error) {
    auditRows.value = data || []
    auditTotalCount.value = count || 0
  }
  auditLogLoading.value = false
}

function resetAuditPage() {
  auditPage.value = 0
  loadAuditLog()
}

// spec 019: automatically generated weekly compliance reports (audit
// activity counts + verify_audit_chain() integrity result). Read-only here —
// the only writer is the generate-compliance-report Edge Function.
const complianceReports = ref([])
const complianceReportsLoading = ref(false)

async function loadComplianceReports() {
  complianceReportsLoading.value = true
  const { data } = await supabase
    .from('compliance_reports')
    .select('*')
    .order('period_start', { ascending: false })
  complianceReports.value = data || []
  complianceReportsLoading.value = false
}

// Flattens a report's summary JSONB into row-shaped data so it can go
// through the same rowsToCsv/rowsToJson/triggerDownload helpers already used
// for the manual audit log export (FR-009 — no new export mechanism).
function downloadComplianceReport(report, format) {
  const flatRows = [
    { period_start: report.period_start, period_end: report.period_end, kind: 'integrity', key: 'integrity_ok', value: report.summary.integrity_ok, template_version: TEMPLATE_VERSION },
    { period_start: report.period_start, period_end: report.period_end, kind: 'integrity', key: 'broken_seq', value: report.summary.broken_seq, template_version: TEMPLATE_VERSION },
    ...Object.entries(report.summary.by_action || {}).map(([action, count]) => ({
      period_start: report.period_start, period_end: report.period_end, kind: 'by_action', key: action, value: count, template_version: TEMPLATE_VERSION,
    })),
    ...Object.entries(report.summary.by_table || {}).map(([table, count]) => ({
      period_start: report.period_start, period_end: report.period_end, kind: 'by_table', key: table, value: count, template_version: TEMPLATE_VERSION,
    })),
  ]
  const stamp = report.period_start.slice(0, 10)
  if (format === 'csv') {
    triggerDownload(rowsToCsv(flatRows), `compliance-report-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(flatRows), `compliance-report-${stamp}.json`, 'application/json')
  }
}

// spec 030 (MHEWS-FR-0067/FR-0071): exports a structured, per-criterion
// compliance checklist derived from an existing compliance_reports row +
// that period's audit_log_dead_letter rows. Read-only — no new writer, no
// new authorization path (relies entirely on this route's existing Super
// Admin guard + compliance_reports/audit_log_dead_letter's existing
// super_admin-only RLS policies).
async function downloadComplianceChecklist(report, format) {
  const { data: deadLetterRows } = await supabase
    .from('audit_log_dead_letter')
    .select('id, failed_at')
    .gte('failed_at', report.period_start)
    .lt('failed_at', report.period_end)

  const checklist = buildComplianceChecklist(report, deadLetterRows || [])
  const flatRows = checklist.items.map((item) => ({
    period_start: checklist.periodStart,
    period_end: checklist.periodEnd,
    criterion: item.criterion,
    status: item.status,
    evidence: JSON.stringify(item.evidence),
    template_version: checklist.templateVersion,
  }))
  const stamp = report.period_start.slice(0, 10)
  if (format === 'csv') {
    triggerDownload(rowsToCsv(flatRows), `compliance-checklist-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(flatRows), `compliance-checklist-${stamp}.json`, 'application/json')
  }
}

// spec 026: automatically generated yearly incident reports (count/severity/
// hazard breakdown, avg time-to-close, false-alarm rate). Read-only here —
// the only writer is the generate-incident-report Edge Function.
const incidentReports = ref([])
const incidentReportsLoading = ref(false)

async function loadIncidentReports() {
  incidentReportsLoading.value = true
  const { data } = await supabase
    .from('incident_reports')
    .select('*')
    .order('period_start', { ascending: false })
  incidentReports.value = data || []
  incidentReportsLoading.value = false
}

// Mirrors downloadComplianceReport() — reuses the same rowsToCsv/rowsToJson/
// triggerDownload helpers, no new export mechanism (FR/plan.md's "reuse, don't
// reinvent" rule for this subsection).
function downloadIncidentReport(report, format) {
  const flatRows = [
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'total_incidents', value: report.summary.total_incidents },
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'avg_time_to_close_hours', value: report.summary.avg_time_to_close_hours },
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'false_alarm_rate', value: report.summary.false_alarm_rate },
    ...Object.entries(report.summary.by_severity || {}).map(([severity, count]) => ({
      period_start: report.period_start, period_end: report.period_end, kind: 'by_severity', key: severity, value: count,
    })),
    ...Object.entries(report.summary.by_hazard_type || {}).map(([hazardType, count]) => ({
      period_start: report.period_start, period_end: report.period_end, kind: 'by_hazard_type', key: hazardType, value: count,
    })),
  ]
  const stamp = report.period_start.slice(0, 10)
  if (format === 'csv') {
    triggerDownload(rowsToCsv(flatRows), `incident-report-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(flatRows), `incident-report-${stamp}.json`, 'application/json')
  }
}

// spec 032: automatically generated yearly drill performance reports (total
// drills, average response time, average ack rate, scenario breakdown).
// Read-only here — the only writer is the generate-drill-report Edge
// Function. Lives in the Denetim tab alongside the other scheduled reports
// (compliance/incident), not the Tatbikat tab, matching the project's
// existing "all auto-generated reports live in one place" convention.
const drillReports = ref([])
const drillReportsLoading = ref(false)

async function loadDrillReports() {
  drillReportsLoading.value = true
  const { data } = await supabase
    .from('drill_reports')
    .select('*')
    .order('period_start', { ascending: false })
  drillReports.value = data || []
  drillReportsLoading.value = false
}

// Same rowsToCsv/rowsToJson/triggerDownload call pattern as
// downloadComplianceReport()/downloadIncidentReport() — a separate flatten
// function because drill_reports' summary shape (total_drills/
// avg_response_time_seconds/avg_ack_rate/by_scenario_type) differs
// structurally from a single drill's summary (analysis finding F1).
function downloadDrillReport(report, format) {
  const flatRows = [
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'total_drills', value: report.summary.total_drills },
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'avg_response_time_seconds', value: report.summary.avg_response_time_seconds ?? t('admin.drillNoData') },
    { period_start: report.period_start, period_end: report.period_end, kind: 'totals', key: 'avg_ack_rate', value: report.summary.avg_ack_rate ?? t('admin.drillNoData') },
    ...Object.entries(report.summary.by_scenario_type || {}).map(([scenarioType, count]) => ({
      period_start: report.period_start, period_end: report.period_end, kind: 'by_scenario_type', key: scenarioType, value: count,
    })),
  ]
  const stamp = report.period_start.slice(0, 10)
  if (format === 'csv') {
    triggerDownload(rowsToCsv(flatRows), `drill-report-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(flatRows), `drill-report-${stamp}.json`, 'application/json')
  }
}

// spec 029: audit writes that failed (never blocking the triggering
// operation, per FR-001) are captured here for a Super Admin to inspect and
// retry. Read-only fetch here — writes/deletes only happen via
// flush_audit_dead_letter().
const deadLetterCount = ref(0)
const deadLetterFlushing = ref(false)
const deadLetterResult = ref(null)

async function loadDeadLetterCount() {
  const { count } = await supabase
    .from('audit_log_dead_letter')
    .select('*', { count: 'exact', head: true })
  deadLetterCount.value = count || 0
}

async function flushDeadLetter() {
  deadLetterFlushing.value = true
  deadLetterResult.value = null
  try {
    const { data, error } = await supabase.rpc('flush_audit_dead_letter')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    deadLetterResult.value = row
    await loadDeadLetterCount()
  } catch (err) {
    auditError.value = err.message ?? String(err)
  } finally {
    deadLetterFlushing.value = false
  }
}

function prevAuditPage() {
  auditPage.value--
  loadAuditLog()
}

function nextAuditPage() {
  auditPage.value++
  loadAuditLog()
}

async function exportAudit(format) {
  let query = supabase.from('audit_log').select('*')
  query = buildAuditQuery(query)
  const { data, error } = await query.order('seq', { ascending: false }).limit(AUDIT_EXPORT_CAP)
  if (error || !data) return
  auditExportCapped.value = data.length === AUDIT_EXPORT_CAP
  const stamp = Date.now()
  if (format === 'csv') {
    triggerDownload(rowsToCsv(data), `audit-export-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(data), `audit-export-${stamp}.json`, 'application/json')
  }
}

async function verifyIntegrity() {
  integrityChecking.value = true
  integrityResult.value = null
  const { data, error } = await supabase.rpc('verify_audit_chain')
  if (error) {
    integrityResult.value = { error: error.message }
  } else if (data === null || data === undefined) {
    integrityResult.value = 'intact'
  } else {
    integrityResult.value = { seq: data }
  }
  integrityChecking.value = false
}

async function viewRecordHistory(row) {
  historyTarget.value = row
  const { data } = await supabase
    .from('audit_log')
    .select('*')
    .eq('table_name', row.table_name)
    .eq('record_id', row.record_id)
    .order('seq', { ascending: true })
  historyRows.value = data || []
}

function closeHistory() {
  historyTarget.value = null
  historyRows.value = null
}

const auditTotalPages = computed(() =>
  Math.max(1, Math.ceil(auditTotalCount.value / AUDIT_PAGE_SIZE)),
)

onMounted(() => {
  loadAuditLog()
  loadComplianceReports()
  loadIncidentReports()
  loadDrillReports()
  loadDeadLetterCount()
})
</script>

<template>
  <div class="tab-content audit-tab">
    <div class="audit-filters">
      <label class="audit-field">
        <span>{{ t('audit.filters.table') }}</span>
        <select v-model="auditFilters.tableName" @change="resetAuditPage">
          <option value="">{{ t('audit.filters.all') }}</option>
          <option value="profiles">profiles</option>
          <option value="organizations">organizations</option>
          <option value="cap_drafts">cap_drafts</option>
          <option value="mfa_recovery_codes">mfa_recovery_codes</option>
        </select>
      </label>
      <label class="audit-field">
        <span>{{ t('audit.filters.action') }}</span>
        <select v-model="auditFilters.action" @change="resetAuditPage">
          <option value="">{{ t('audit.filters.all') }}</option>
          <option value="INSERT">INSERT</option>
          <option value="UPDATE">UPDATE</option>
          <option value="DELETE">DELETE</option>
        </select>
      </label>
      <label class="audit-field">
        <span>{{ t('audit.filters.userId') }}</span>
        <input v-model="auditFilters.userId" @change="resetAuditPage" placeholder="UUID" />
      </label>
      <label class="audit-field">
        <span>{{ t('audit.filters.from') }}</span>
        <input type="date" v-model="auditFilters.from" @change="resetAuditPage" />
      </label>
      <label class="audit-field">
        <span>{{ t('audit.filters.to') }}</span>
        <input type="date" v-model="auditFilters.to" @change="resetAuditPage" />
      </label>
    </div>

    <div class="audit-actions">
      <button class="btn-export" @click="exportAudit('csv')">{{ t('audit.export.csv') }}</button>
      <button class="btn-export" @click="exportAudit('json')">
        {{ t('audit.export.json') }}
      </button>
      <button class="btn-verify" :disabled="integrityChecking" @click="verifyIntegrity">
        {{ integrityChecking ? t('audit.integrity.checking') : t('audit.integrity.verify') }}
      </button>
    </div>
    <p v-if="auditExportCapped" class="audit-notice">{{ t('audit.export.capped') }}</p>
    <p v-if="integrityResult === 'intact'" class="audit-notice audit-notice-ok">
      {{ t('audit.integrity.intact') }}
    </p>
    <p
      v-if="integrityResult && integrityResult.seq !== undefined"
      class="audit-notice audit-notice-error"
    >
      {{ t('audit.integrity.broken', { seq: integrityResult.seq }) }}
    </p>
    <p v-if="integrityResult && integrityResult.error" class="audit-notice audit-notice-error">
      {{ integrityResult.error }}
    </p>

    <div v-if="auditLogLoading" class="tab-loading">{{ t('audit.loading') }}</div>
    <div v-else-if="auditRows.length === 0" class="tab-empty">{{ t('audit.empty') }}</div>
    <table v-else class="audit-table">
      <thead>
        <tr>
          <th>{{ t('audit.columns.action') }}</th>
          <th>{{ t('audit.columns.table') }}</th>
          <th>{{ t('audit.columns.recordId') }}</th>
          <th>{{ t('audit.columns.changedBy') }}</th>
          <th>{{ t('audit.columns.createdAt') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in auditRows" :key="row.id">
          <td>{{ row.action }}</td>
          <td>{{ row.table_name }}</td>
          <td class="audit-mono">{{ row.record_id }}</td>
          <td class="audit-mono">{{ row.changed_by }}</td>
          <td>{{ formatDate(row.created_at) }}</td>
          <td>
            <button class="btn-history" @click="viewRecordHistory(row)">
              {{ t('audit.history.view') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="auditRows.length" class="audit-pagination">
      <button
        :disabled="auditPage === 0"
        @click="prevAuditPage"
      >
        ←
      </button>
      <span>{{ auditPage + 1 }} / {{ auditTotalPages }}</span>
      <button
        :disabled="auditPage + 1 >= auditTotalPages"
        @click="nextAuditPage"
      >
        →
      </button>
    </div>

    <!-- ── Bekleyen Denetim Kayıtları (spec 029: audit write resilience) ── -->
    <div class="compliance-reports-section">
      <h4>{{ t('audit.deadLetter.title') }}</h4>
      <p v-if="deadLetterCount === 0" class="tab-empty">{{ t('audit.deadLetter.empty') }}</p>
      <div v-else class="dead-letter-row">
        <span>{{ t('audit.deadLetter.count', { count: deadLetterCount }) }}</span>
        <button class="btn-export" :disabled="deadLetterFlushing" @click="flushDeadLetter">
          {{ deadLetterFlushing ? t('audit.loading') : t('audit.deadLetter.retry') }}
        </button>
      </div>
      <p v-if="deadLetterResult" class="tab-empty">
        {{ t('audit.deadLetter.result', { succeeded: deadLetterResult.succeeded, failed: deadLetterResult.failed }) }}
      </p>
    </div>

    <!-- ── Geçmiş Raporlar (spec 019: scheduled compliance reports) ────── -->
    <div class="compliance-reports-section">
      <h4>{{ t('audit.reports.title') }}</h4>
      <div v-if="complianceReportsLoading" class="tab-loading">{{ t('audit.loading') }}</div>
      <div v-else-if="complianceReports.length === 0" class="tab-empty">{{ t('audit.reports.empty') }}</div>
      <ul v-else class="compliance-reports-list">
        <li v-for="report in complianceReports" :key="report.id" class="compliance-report-row">
          <span class="compliance-report-period">
            {{ formatDate(report.period_start) }} — {{ formatDate(report.period_end) }}
          </span>
          <span class="compliance-report-summary">
            {{ t('audit.reports.integrity') }}:
            <strong :class="report.summary.integrity_ok ? 'audit-notice-ok' : 'audit-notice-error'">
              {{ report.summary.integrity_ok ? t('audit.reports.intact') : t('audit.reports.broken') }}
            </strong>
          </span>
          <span class="compliance-report-actions">
            <button class="btn-export" @click="downloadComplianceReport(report, 'csv')">{{ t('audit.export.csv') }}</button>
            <button class="btn-export" @click="downloadComplianceReport(report, 'json')">{{ t('audit.export.json') }}</button>
            <button class="btn-export" @click="downloadComplianceChecklist(report, 'csv')">{{ t('audit.reports.checklistExport') }} (CSV)</button>
            <button class="btn-export" @click="downloadComplianceChecklist(report, 'json')">{{ t('audit.reports.checklistExport') }} (JSON)</button>
          </span>
        </li>
      </ul>
    </div>

    <!-- ── Yıllık Olay Raporları (spec 026: scheduled incident reports) ── -->
    <div class="compliance-reports-section">
      <h4>{{ t('audit.incidentReports.title') }}</h4>
      <div v-if="incidentReportsLoading" class="tab-loading">{{ t('audit.loading') }}</div>
      <div v-else-if="incidentReports.length === 0" class="tab-empty">{{ t('audit.incidentReports.empty') }}</div>
      <ul v-else class="compliance-reports-list">
        <li v-for="report in incidentReports" :key="report.id" class="compliance-report-row">
          <span class="compliance-report-period">
            {{ formatDate(report.period_start) }} — {{ formatDate(report.period_end) }}
          </span>
          <span class="compliance-report-summary">
            {{ t('audit.incidentReports.total') }}: <strong>{{ report.summary.total_incidents }}</strong>
            · {{ t('audit.incidentReports.falseAlarmRate') }}:
            <strong>{{ report.summary.false_alarm_rate != null ? Math.round(report.summary.false_alarm_rate * 100) + '%' : '—' }}</strong>
          </span>
          <span class="compliance-report-actions">
            <button class="btn-export" @click="downloadIncidentReport(report, 'csv')">{{ t('audit.export.csv') }}</button>
            <button class="btn-export" @click="downloadIncidentReport(report, 'json')">{{ t('audit.export.json') }}</button>
          </span>
        </li>
      </ul>
    </div>

    <!-- ── Yıllık Tatbikat Raporları (spec 032: scheduled drill reports) ── -->
    <div class="compliance-reports-section">
      <h4>{{ t('audit.drillReports.title') }}</h4>
      <div v-if="drillReportsLoading" class="tab-loading">{{ t('audit.loading') }}</div>
      <div v-else-if="drillReports.length === 0" class="tab-empty">{{ t('audit.drillReports.empty') }}</div>
      <ul v-else class="compliance-reports-list">
        <li v-for="report in drillReports" :key="report.id" class="compliance-report-row">
          <span class="compliance-report-period">
            {{ formatDate(report.period_start) }} — {{ formatDate(report.period_end) }}
          </span>
          <span class="compliance-report-summary">
            {{ t('audit.drillReports.total') }}: <strong>{{ report.summary.total_drills }}</strong>
            · {{ t('admin.drillResponseTime') }}:
            <strong>{{ report.summary.avg_response_time_seconds != null ? Math.round(report.summary.avg_response_time_seconds / 60) + ' dk' : t('admin.drillNoData') }}</strong>
          </span>
          <span class="compliance-report-actions">
            <button class="btn-export" @click="downloadDrillReport(report, 'csv')">{{ t('audit.export.csv') }}</button>
            <button class="btn-export" @click="downloadDrillReport(report, 'json')">{{ t('audit.export.json') }}</button>
          </span>
        </li>
      </ul>
    </div>

    <!-- ── spec 035: Retention policies, security events, security config report ── -->
    <div class="compliance-reports-section">
      <RetentionPolicyPanel />
    </div>
    <div class="compliance-reports-section">
      <SecurityEventsPanel />
    </div>
    <div class="compliance-reports-section">
      <SecurityConfigReportPanel />
    </div>

    <!-- Single-record history panel -->
    <div v-if="historyTarget" class="history-modal-backdrop" @click.self="closeHistory">
      <div class="history-modal">
        <h4>
          {{
            t('audit.history.title', {
              table: historyTarget.table_name,
              id: historyTarget.record_id,
            })
          }}
        </h4>
        <div v-if="historyRows === null" class="tab-loading">{{ t('audit.loading') }}</div>
        <ul v-else class="history-list">
          <li v-for="h in historyRows" :key="h.id">
            <strong>{{ h.action }}</strong> — {{ formatDate(h.created_at) }} ({{ h.changed_by }})
          </li>
        </ul>
        <button class="btn-back" @click="closeHistory">{{ t('audit.close') }}</button>
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
.tab-loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted, #94a3b8);
}
.btn-back {
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 8px;
  color: var(--color-text-secondary, #cbd5e1);
  padding: 7px 14px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;
  margin-bottom: 0;
  display: inline-block;
}
.btn-back:hover {
  background: rgba(77, 163, 255, 0.12);
  border-color: rgba(77, 163, 255, 0.38);
  color: var(--color-text-primary, #e2e8f0);
}
.compliance-reports-section {
  margin-top: 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 16px;
}
.compliance-reports-section:first-of-type {
  margin-top: 0;
  border-top: none;
  padding-top: 0;
}
.compliance-reports-list {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.compliance-report-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.compliance-report-period {
  font-weight: 600;
}
.dead-letter-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 8px 0;
}
.audit-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 16px;
}
.audit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.audit-field input,
.audit-field select {
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  padding: 6px 10px;
  color: #e2e8f0;
  font-size: 0.82rem;
}
.audit-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.btn-export,
.btn-verify,
.btn-history {
  padding: 6px 14px;
  background: rgba(77, 163, 255, 0.15);
  border: 1px solid rgba(77, 163, 255, 0.35);
  border-radius: 8px;
  color: #4da3ff;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.btn-export:hover,
.btn-verify:hover,
.btn-history:hover {
  background: rgba(77, 163, 255, 0.25);
}
.btn-verify:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.audit-notice {
  font-size: 0.8rem;
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 10px;
}
.audit-notice-ok {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
}
.audit-notice-error {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}
.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.audit-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  color: var(--color-text-muted, #94a3b8);
  background: rgba(15, 23, 42, 0.72);
}
.audit-table td {
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.audit-mono {
  font-family: monospace;
  font-size: 0.75rem;
}
.audit-pagination {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  font-size: 0.82rem;
}
.audit-pagination button {
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: transparent;
  color: #e2e8f0;
  cursor: pointer;
}
.audit-pagination button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.history-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.history-modal {
  background: #1a1e29;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 20px;
  width: min(480px, 90vw);
  max-height: 70vh;
  overflow-y: auto;
}
.history-list {
  list-style: none;
  padding: 0;
  margin: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 0.82rem;
}
</style>
