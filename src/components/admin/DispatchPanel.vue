<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

// RLS (20260707120100_dispatch_jobs_and_receipts.sql) is the authoritative
// scope: super_admin sees every job, country_admin/org_admin see only jobs
// for their own country/org, via the join to cap_drafts. No client-side
// filter is added here, same convention as sources.js/contacts.js.

const jobs = ref([])
const receiptsByJob = ref({})
const loading = ref(false)
const error = ref(null)
const retryingJobId = ref(null)

async function loadJobs() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase
    .from('dispatch_jobs')
    .select('*, cap_drafts(title, hazard_type, country_code)')
    .order('created_at', { ascending: false })
    .limit(50)
  if (err) { error.value = err.message; loading.value = false; return }
  jobs.value = data ?? []

  const ids = jobs.value.map((j) => j.id)
  if (ids.length) {
    const { data: receipts } = await supabase
      .from('dispatch_receipts')
      .select('dispatch_job_id, channel, status')
      .in('dispatch_job_id', ids)
    const grouped = {}
    for (const r of receipts ?? []) {
      grouped[r.dispatch_job_id] ??= { sent: 0, delivered: 0, failed: 0, bounced: 0, queued: 0 }
      grouped[r.dispatch_job_id][r.status] = (grouped[r.dispatch_job_id][r.status] ?? 0) + 1
    }
    receiptsByJob.value = grouped
  }
  loading.value = false
}

function hasFailedReceipts(jobId) {
  const counts = receiptsByJob.value[jobId]
  return !!counts && ((counts.failed ?? 0) > 0 || (counts.bounced ?? 0) > 0)
}

async function retry(job) {
  retryingJobId.value = job.id
  error.value = null
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const { data, error: err } = await supabase.functions.invoke('dispatch-alert', {
      body: { job_id: job.id },
      headers: { Authorization: `Bearer ${sessionData.session?.access_token}` },
    })
    if (err) throw err
    if (data?.error) throw new Error(data.error)
    await loadJobs()
  } catch (err) {
    error.value = err.message
  } finally {
    retryingJobId.value = null
  }
}

onMounted(loadJobs)
</script>

<template>
  <div class="dispatch-panel">
    <h3>{{ t('dispatch.panelTitle') }}</h3>

    <div v-if="error" class="form-error">{{ error }}</div>
    <div v-if="loading" class="tab-loading">...</div>

    <table v-else class="dispatch-table">
      <thead>
        <tr>
          <th>{{ t('dispatch.alertColumn') }}</th><th>{{ t('dispatch.countryColumn') }}</th><th>{{ t('dispatch.statusColumn') }}</th>
          <th>{{ t('dispatch.matchedColumn') }}</th><th>{{ t('dispatch.summaryColumn') }}</th><th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="job in jobs" :key="job.id">
          <td>{{ job.cap_drafts?.title || '—' }} ({{ job.cap_drafts?.hazard_type }})</td>
          <td>{{ (job.cap_drafts?.country_code || '—').toUpperCase() }}</td>
          <td>
            <span :class="['status-badge', `status-${job.status}`]">{{ t(`dispatch.status${job.status.charAt(0).toUpperCase()}${job.status.slice(1)}`) }}</span>
          </td>
          <td>{{ job.matched_contact_count }}</td>
          <td>
            <span v-if="receiptsByJob[job.id]">
              {{ receiptsByJob[job.id].sent ?? 0 }} / {{ receiptsByJob[job.id].delivered ?? 0 }} /
              {{ receiptsByJob[job.id].failed ?? 0 }} / {{ receiptsByJob[job.id].bounced ?? 0 }}
            </span>
            <span v-else>—</span>
          </td>
          <td>
            <button
              v-if="hasFailedReceipts(job.id)"
              class="btn-retry"
              :disabled="retryingJobId === job.id"
              @click="retry(job)"
            >
              {{ retryingJobId === job.id ? t('dispatch.retrying') : t('dispatch.retryButton') }}
            </button>
          </td>
        </tr>
        <tr v-if="!jobs.length"><td colspan="6" class="empty-row">{{ t('dispatch.empty') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.dispatch-panel { padding: 4px 0; }
.dispatch-panel h3 { margin: 0 0 14px; color: #e2e8f0; }
.dispatch-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.dispatch-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.dispatch-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.status-badge { padding: 2px 8px; border-radius: 6px; font-size: .72rem; }
.status-queued, .status-running { background: rgba(245,158,11,.15); color: #f59e0b; }
.status-completed { background: rgba(34,197,94,.15); color: #22c55e; }
.status-failed { background: rgba(239,68,68,.15); color: #ef4444; }
.btn-retry { padding: 6px 12px; background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.4); border-radius: 8px; color: #f59e0b; cursor: pointer; font-size: .78rem; }
.btn-retry:disabled { opacity: .5; cursor: not-allowed; }
.form-error { color: #ef4444; font-size: .8rem; margin-bottom: 10px; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
</style>
