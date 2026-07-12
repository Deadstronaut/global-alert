<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useCommunityReportsStore } from '@/stores/communityReports.js'
import { useCommunityReportsStreamStore } from '@/stores/communityReportsStream.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const store = useCommunityReportsStore()
const stream = useCommunityReportsStreamStore()
const hazardTypesStore = useHazardTypesStore()
const auth = useAuthStore()

const rejectingId = ref(null)
const rejectReason = ref('')
const rejectError = ref(null)

const assignedOrgByReport = ref({})
const organizationsByCountry = ref({})

// User Story 4: link an approved report to an incident. Scoped client-side
// to the caller's own country (super_admin sees all) — the approved-read
// RLS policy itself is intentionally NOT country-scoped (FR-008: any
// signed-in role sees all approved reports on the map), but linking to an
// incident only makes sense within the moderator's own jurisdiction.
const approvedReports = computed(() =>
  store.reports.filter((r) => auth.isSuperAdmin || r.country_code === auth.countryCode),
)
const incidentsByCountry = ref({})
const selectedIncidentByReport = ref({})
const linkError = ref(null)

async function loadIncidentsFor(countryCode) {
  if (!countryCode || incidentsByCountry.value[countryCode]) return
  const { data } = await supabase
    .from('incidents')
    .select('id, title, status')
    .eq('country_code', countryCode)
    .in('status', ['open', 'in_progress', 'monitoring'])
    .order('title')
  incidentsByCountry.value[countryCode] = data ?? []
}

async function linkIncident(report) {
  const incidentId = selectedIncidentByReport.value[report.id]
  if (!incidentId) return
  const result = await store.linkToIncident(report.id, incidentId)
  if (!result.success) linkError.value = result.error
}

onMounted(() => {
  store.fetchModerationQueue()
  store.fetchApproved()
  if (!hazardTypesStore.loaded) hazardTypesStore.fetchHazardTypes()
  loadClusterSummaries()
  // Live notification stream (spec 036 remaining item): a new/updated report
  // simply triggers a refetch of whichever lists could be affected — safer
  // than trying to splice the SSE payload's partial shape directly into
  // reactive state, and cheap since these are already fast, indexed queries.
  stream.connect(() => {
    store.fetchModerationQueue()
    store.fetchApproved()
  })
})

onUnmounted(() => {
  stream.disconnect()
})

// Scheduled geo-cluster digest (spec 036 remaining item): read-only here —
// the only writer is the daily generate-community-report-cluster-summary
// Edge Function. RLS already scopes rows to the caller's own country (or
// all countries for super_admin), so no client-side filtering is needed.
const clusterSummaries = ref([])
const clusterSummariesLoading = ref(false)

async function loadClusterSummaries() {
  clusterSummariesLoading.value = true
  const { data } = await supabase
    .from('community_report_cluster_summaries')
    .select('*')
    .order('period_start', { ascending: false })
    .limit(14)
  clusterSummaries.value = data || []
  clusterSummariesLoading.value = false
}

function hazardDisplayName(code) {
  return hazardTypesStore.hazardTypes.find((h) => h.code === code)?.display_name ?? code
}

function photoUrl(path) {
  if (!path) return null
  return supabase.storage.from('community-report-photos').getPublicUrl(path).data.publicUrl
}

function audioUrl(path) {
  if (!path) return null
  return supabase.storage.from('community-report-audio').getPublicUrl(path).data.publicUrl
}

async function loadOrganizationsFor(countryCode) {
  if (!countryCode || organizationsByCountry.value[countryCode]) return
  organizationsByCountry.value[countryCode] = await store.fetchAssignableOrganizations(countryCode)
}

async function approve(report) {
  await loadOrganizationsFor(report.country_code)
  const result = await store.approveReport(report.id, {
    assignedOrgId: assignedOrgByReport.value[report.id] || null,
  })
  if (!result.success) rejectError.value = result.error
}

function startReject(id) {
  rejectingId.value = id
  rejectReason.value = ''
  rejectError.value = null
}

async function confirmReject(id) {
  if (!rejectReason.value.trim()) {
    rejectError.value = t('communityReport.moderation.rejectReasonRequired')
    return
  }
  const result = await store.rejectReport(id, rejectReason.value.trim())
  if (!result.success) {
    rejectError.value = result.error
    return
  }
  rejectingId.value = null
  rejectReason.value = ''
}
</script>

<template>
  <div class="community-reports-panel">
    <h3>
      {{ t('communityReport.moderation.tabLabel') }}
      <span
        class="stream-status"
        :class="stream.connected ? 'stream-connected' : 'stream-disconnected'"
        :title="stream.connected ? t('communityReport.stream.connected') : t('communityReport.stream.disconnected')"
      >●</span>
    </h3>

    <p v-if="!store.moderationQueue.length">{{ t('communityReport.moderation.queueEmpty') }}</p>

    <div v-for="report in store.moderationQueue" :key="report.id" class="report-card">
      <div class="report-body">
        <strong>{{ hazardDisplayName(report.hazard_type) }}</strong>
        <p>{{ report.description }}</p>
        <small>{{ report.lat }}, {{ report.lng }} — {{ report.country_code || '—' }}</small>
        <br />
        <small>{{ t('communityReport.moderation.submittedAt') }}: {{ report.created_at }}</small>
        <div v-if="report.photo_path">
          <a :href="photoUrl(report.photo_path)" target="_blank" rel="noopener">
            {{ t('communityReport.moderation.viewPhoto') }}
          </a>
        </div>
        <div v-if="report.audio_path">
          <audio controls :src="audioUrl(report.audio_path)" :aria-label="t('communityReport.moderation.playAudio')"></audio>
        </div>
      </div>

      <div class="report-actions">
        <label class="form-field">
          <span>{{ t('communityReport.moderation.assignOrg') }}</span>
          <select
            v-model="assignedOrgByReport[report.id]"
            @focus="loadOrganizationsFor(report.country_code)"
          >
            <option value="">{{ t('communityReport.moderation.assignOrgNone') }}</option>
            <option
              v-for="org in organizationsByCountry[report.country_code] || []"
              :key="org.id"
              :value="org.id"
            >
              {{ org.name }}
            </option>
          </select>
        </label>

        <button @click="approve(report)">{{ t('communityReport.moderation.approve') }}</button>
        <button @click="startReject(report.id)">{{ t('communityReport.moderation.reject') }}</button>

        <div v-if="rejectingId === report.id" class="reject-form">
          <label class="form-field">
            <span>{{ t('communityReport.moderation.rejectReasonLabel') }}</span>
            <textarea v-model="rejectReason" rows="2" />
          </label>
          <p v-if="rejectError" class="error-message">{{ rejectError }}</p>
          <button @click="confirmReject(report.id)">{{ t('communityReport.moderation.reject') }}</button>
        </div>
      </div>
    </div>

    <h3>{{ t('communityReport.incidentLink.sectionTitle') }}</h3>
    <p v-if="!approvedReports.length">{{ t('communityReport.incidentLink.noLinkedReports') }}</p>
    <div v-for="report in approvedReports" :key="report.id" class="report-card">
      <div class="report-body">
        <strong>{{ hazardDisplayName(report.hazard_type) }}</strong>
        <p>{{ report.description }}</p>
        <small v-if="report.linked_incident_id">{{ t('communityReport.incidentLink.linkedReports') }}</small>
      </div>
      <div class="report-actions">
        <label class="form-field">
          <span>{{ t('communityReport.incidentLink.pickIncident') }}</span>
          <select
            v-model="selectedIncidentByReport[report.id]"
            @focus="loadIncidentsFor(report.country_code)"
          >
            <option value="">—</option>
            <option
              v-for="incident in incidentsByCountry[report.country_code] || []"
              :key="incident.id"
              :value="incident.id"
            >
              {{ incident.title }}
            </option>
          </select>
        </label>
        <button @click="linkIncident(report)">{{ t('communityReport.incidentLink.linkButton') }}</button>
      </div>
    </div>
    <p v-if="linkError" class="error-message">{{ linkError }}</p>

    <h3>{{ t('communityReport.clusterSummary.sectionTitle') }}</h3>
    <div v-if="clusterSummariesLoading" class="tab-loading">{{ t('audit.loading') }}</div>
    <p v-else-if="!clusterSummaries.length">{{ t('communityReport.clusterSummary.empty') }}</p>
    <ul v-else class="cluster-summary-list">
      <li v-for="summary in clusterSummaries" :key="summary.id" class="cluster-summary-row">
        <strong>{{ summary.country_code || t('communityReport.clusterSummary.unresolvedCountry') }}</strong>
        — {{ summary.period_start.slice(0, 10) }}
        — {{ t('communityReport.clusterSummary.totalReports') }}: {{ summary.total_reports }}
        <ul v-if="summary.clusters.length" class="cluster-list">
          <li v-for="(cluster, idx) in summary.clusters" :key="idx">
            ({{ cluster.grid_lat }}, {{ cluster.grid_lng }}) — {{ cluster.report_count }}
            {{ t('communityReport.clusterSummary.reportsAt') }}
            — {{ Object.entries(cluster.hazard_type_breakdown).map(([k, v]) => `${hazardDisplayName(k)}: ${v}`).join(', ') }}
          </li>
        </ul>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.report-card { border: 1px solid var(--color-border,#334155); border-radius: 8px; padding: 12px; margin-bottom: 12px; display: flex; gap: 16px; flex-wrap: wrap; }
.report-body { flex: 1 1 300px; }
.report-actions { display: flex; flex-direction: column; gap: 8px; min-width: 220px; }
.form-field { display: flex; flex-direction: column; gap: 4px; }
.reject-form { display: flex; flex-direction: column; gap: 6px; }
.error-message { color: #c0392b; }
.stream-status { font-size: 0.7rem; margin-left: 8px; }
.stream-connected { color: #1e7e34; }
.stream-disconnected { color: #94a3b8; }
</style>
