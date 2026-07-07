<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useSourcesStore } from '@/stores/sources.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { supabase } from '@/services/api/config.js'
import SourceHealthCard from '@/components/admin/SourceHealthCard.vue'
import SourceFormModal from '@/components/admin/SourceFormModal.vue'
import ManualEntryForm from '@/components/admin/ManualEntryForm.vue'
import FileImportForm from '@/components/admin/FileImportForm.vue'
import BoundaryUploadForm from '@/components/admin/BoundaryUploadForm.vue'
import { getRegionNames } from '@/data/boundaries/index.js'
import { groupSourcesByScope } from '@/utils/sourceScope.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'
import { buildComplianceChecklist, TEMPLATE_VERSION } from '@/services/complianceChecklist.js'
import ExposureDatasetManager from '@/components/impact/ExposureDatasetManager.vue'
import ContactsPanel from '@/components/admin/ContactsPanel.vue'
import DispatchPanel from '@/components/admin/DispatchPanel.vue'
import IntegrationsPanel from '@/components/admin/IntegrationsPanel.vue'
import HazardTaxonomyPanel from '@/components/admin/HazardTaxonomyPanel.vue'
import SopRepositoryPanel from '@/components/admin/SopRepositoryPanel.vue'
import MapLayerRegistryPanel from '@/components/admin/MapLayerRegistryPanel.vue'
import RetentionPolicyPanel from '@/components/admin/RetentionPolicyPanel.vue'
import SecurityEventsPanel from '@/components/admin/SecurityEventsPanel.vue'
import SecurityConfigReportPanel from '@/components/admin/SecurityConfigReportPanel.vue'
import CommunityReportsPanel from '@/components/admin/CommunityReportsPanel.vue'
import AssignedCommunityReportsPanel from '@/components/admin/AssignedCommunityReportsPanel.vue'
import { computeResponseTimeSeconds, computeAckRate } from '@/utils/drillMetrics.js'
import { useHazardTypesStore } from '@/stores/hazardTypes.js'
import { useDrillInjectedEventsStore } from '@/stores/drillInjectedEvents.js'

const router = useRouter()
const { t } = useI18n()

const auth = useAuthStore()
const hazardTypesStore = useHazardTypesStore()
const drillInjectedEventsStore = useDrillInjectedEventsStore()
const tab = ref('users') // 'users' | 'orgs' | 'drill' | 'sources' | 'manual' | 'csv' | 'boundaries' | 'contacts' | 'dispatch' | 'audit'

async function handleLogout() {
  await auth.logout()
  router.push('/login')
}

// ── Users ──────────────────────────────────────────────────────────────────────
const users = ref([])
const usersLoading = ref(false)
const usersError = ref(null)
const editingUser = ref(null) // { id, role, country_code }
const savingUser = ref(false)

const ROLES = ['super_admin', 'country_admin', 'org_admin', 'viewer']

// spec 018: which of the 4 named capabilities each country_admin/org_admin
// currently holds — { [profileId]: Set<capability> }. Loaded fresh alongside
// the user list so toggle state always reflects ground truth (US3), not just
// local UI state.
const CAPABILITIES = ['hazard_taxonomy', 'sop_repository', 'map_layers', 'audit']
const capabilityGrants = ref({})
const capabilityGrantError = ref(null)

// spec 028: Access Review Report (super_admin only) — last-login + capability
// summary per profile, sourced from get_access_review() so the same query
// backs both the new table columns and the export button. Kept separate from
// `users` (loadUsers()'s plain profiles select) since get_access_review()
// doesn't return full_name/edit-relevant fields the existing table needs.
const accessReview = ref([])
const accessReviewError = ref(null)
const accessReviewByProfileId = computed(() => {
  const map = {}
  for (const row of accessReview.value) map[row.profile_id] = row
  return map
})

async function loadAccessReview() {
  if (!auth.isSuperAdmin) return
  accessReviewError.value = null
  const { data, error } = await supabase.rpc('get_access_review')
  if (error) accessReviewError.value = error.message
  else accessReview.value = data || []
}

function isLocked(profileId) {
  const row = accessReviewByProfileId.value[profileId]
  return !!(row?.locked_until && new Date(row.locked_until) > new Date())
}

async function unlockUser(profileId) {
  accessReviewError.value = null
  try {
    await supabase.rpc('unlock_profile', { p_profile_id: profileId }).then(({ error }) => {
      if (error) throw error
    })
    await loadAccessReview()
  } catch (err) {
    accessReviewError.value = err.message ?? String(err)
  }
}

function downloadAccessReview(format) {
  const rows = accessReview.value.map((row) => ({
    email: row.email,
    role: row.role,
    country_code: row.country_code,
    org_id: row.org_id,
    is_active: row.is_active,
    capabilities: (row.capabilities || []).join(', '),
    last_sign_in_at: row.last_sign_in_at || '',
    locked: isLocked(row.profile_id),
  }))
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'csv') {
    triggerDownload(rowsToCsv(rows), `erisim-inceleme-raporu-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(rows), `erisim-inceleme-raporu-${stamp}.json`, 'application/json')
  }
}

async function loadCapabilityGrants() {
  if (!auth.isSuperAdmin) return
  try {
    const grants = await auth.fetchAllCapabilityGrants()
    const byProfile = {}
    for (const g of grants) {
      if (!byProfile[g.profile_id]) byProfile[g.profile_id] = new Set()
      byProfile[g.profile_id].add(g.capability)
    }
    capabilityGrants.value = byProfile
  } catch (err) {
    capabilityGrantError.value = err.message ?? String(err)
  }
}

function hasGrantedCapability(profileId, capability) {
  return capabilityGrants.value[profileId]?.has(capability) ?? false
}

// Only country_admin/org_admin are valid grant targets (FR-003) — enforced
// server-side by a trigger, this is just to keep the toggle UI from offering
// a meaningless action for other rows.
function canHaveCapabilityGrants(user) {
  return user.role === 'country_admin' || user.role === 'org_admin'
}

async function toggleCapability(user, capability) {
  capabilityGrantError.value = null
  const currentlyGranted = hasGrantedCapability(user.id, capability)
  try {
    if (currentlyGranted) {
      await auth.revokeCapability(user.id, capability)
    } else {
      await auth.grantCapability(user.id, capability)
    }
    await loadCapabilityGrants()
  } catch (err) {
    capabilityGrantError.value = err.message ?? String(err)
  }
}

async function loadUsers() {
  usersLoading.value = true
  usersError.value = null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, country_code, org_id, is_active, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) usersError.value = error.message
  else users.value = data || []
  usersLoading.value = false
  await loadCapabilityGrants()
  await loadAccessReview()
}

async function saveUser() {
  if (!editingUser.value) return
  savingUser.value = true
  const { error } = await supabase
    .from('profiles')
    .update({
      role: editingUser.value.role,
      country_code: editingUser.value.country_code || null,
      org_id: editingUser.value.org_id || null,
    })
    .eq('id', editingUser.value.id)
  savingUser.value = false
  if (error) {
    usersError.value = error.message
    return
  }
  editingUser.value = null
  await loadUsers()
}

async function revokeAccess(userId) {
  const { error } = await supabase.from('profiles').update({ role: 'viewer' }).eq('id', userId)
  if (error) {
    usersError.value = error.message
    return
  }
  await loadUsers()
}

// Real access suspension (spec 004 gap 3) — distinct from revokeAccess()'s role
// downgrade above: this blocks login entirely rather than just lowering permissions.
async function suspendUser(userId) {
  try {
    await auth.suspendUser(userId)
    await loadUsers()
  } catch (err) {
    usersError.value = err.message
  }
}

async function reactivateUser(userId) {
  try {
    await auth.reactivateUser(userId)
    await loadUsers()
  } catch (err) {
    usersError.value = err.message
  }
}

// Admin-provisioned accounts (docs/security_roles_protocol.md §2-3):
//   super_admin -> any role/country; country_admin -> org_admin/viewer in own
//   country; org_admin -> viewer only, in own country + own org.
// The create-user Edge Function enforces this hierarchy server-side too.
const showUserForm = ref(false)
const creatingUser = ref(false)
const userForm = ref({
  email: '',
  role: 'viewer',
  country_code: '',
  org_id: '',
  region_code: '',
  full_name: '',
})
const creatableRoles = computed(() => {
  if (auth.isSuperAdmin) return ROLES
  if (auth.session?.role === 'country_admin') return ['org_admin', 'viewer']
  return ['viewer']
})

// Region is just an optional map view-filter, only offered for countries we
// actually have province boundary data for (see src/data/boundaries/README.md).
// Boundary file (~1.3MB per country) is only fetched here, on demand, when an
// admin actually opens this form for a country that has one — not eagerly.
const userFormRegionOptions = ref([])
watch(
  () => (auth.isSuperAdmin ? userForm.value.country_code : auth.countryCode),
  async (cc) => {
    userFormRegionOptions.value = await getRegionNames(cc)
  },
  { immediate: true },
)

async function createUser() {
  creatingUser.value = true
  usersError.value = null
  try {
    await auth.createUser({
      email: userForm.value.email,
      role: userForm.value.role,
      countryCode: userForm.value.country_code.trim().toLowerCase() || null,
      orgId: userForm.value.org_id || null,
      regionCode: userForm.value.region_code || null,
      fullName: userForm.value.full_name || null,
    })
    userForm.value = {
      email: '',
      role: 'viewer',
      country_code: '',
      org_id: '',
      region_code: '',
      full_name: '',
    }
    showUserForm.value = false
    await loadUsers()
  } catch (err) {
    usersError.value = err.message
  } finally {
    creatingUser.value = false
  }
}

// ── Organizations ──────────────────────────────────────────────────────────────
const orgs = ref([])
const orgsLoading = ref(false)
const orgsError = ref(null)
const showOrgForm = ref(false)
const orgForm = ref({ name: '', country_code: '', type: 'general', parent_org_id: '' })
const savingOrg = ref(false)

const ORG_TYPES = ['general', 'fire', 'flood', 'earthquake', 'health', 'police', 'military']

async function loadOrgs() {
  orgsLoading.value = true
  orgsError.value = null
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('country_code')
    .limit(100)
  if (error) orgsError.value = error.message
  else orgs.value = data || []
  orgsLoading.value = false
}

async function saveOrg() {
  savingOrg.value = true
  const { error } = await supabase.from('organizations').insert({
    name: orgForm.value.name,
    country_code: orgForm.value.country_code,
    type: orgForm.value.type,
    parent_org_id: orgForm.value.parent_org_id || null,
  })
  savingOrg.value = false
  if (error) {
    orgsError.value = error.message
    return
  }
  showOrgForm.value = false
  orgForm.value = { name: '', country_code: '', type: 'general', parent_org_id: '' }
  await loadOrgs()
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
  tab.value = 'hazardTaxonomy'
}

const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')

// spec 036 (US5): org_admin's own read-only "assigned to me" tab — distinct
// from canAdmin's country_admin/super_admin moderation tab above.
const isOrgAdmin = computed(() => auth.session?.role === 'org_admin')

// spec 018: a country_admin/org_admin granted one of the 4 named capabilities
// gets the same access as super_admin for that specific admin area only —
// does not widen canAdmin/canCreateUsers or any other super_admin-only ability.
function hasCapability(cap) {
  return auth.isSuperAdmin || (auth.session?.capabilities ?? []).includes(cap)
}

// org_admin may provision viewer accounts (docs/security_roles_protocol.md §2)
// but doesn't get the broader org/drill/source management canAdmin grants.
const canCreateUsers = computed(() => canAdmin.value || auth.session?.role === 'org_admin')

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

// ── Data Sources (feature 001-data-ingestion-monitoring) ───────────────────────
const sourcesStore = useSourcesStore()
const showSourceForm = ref(false)
const editingSource = ref(null) // null = create mode
const savingSource = ref(false)

function toggleSourceForm() {
  showSourceForm.value = !showSourceForm.value
  editingSource.value = null
}
function cancelSourceForm() {
  showSourceForm.value = false
  editingSource.value = null
}
const sourceFormError = ref(null)
const auditingSource = ref(null)
const auditData = ref(null)
const auditLoading = ref(false)
const auditError = ref(null)

const FASTEST_POLL_MS = 60_000 // matches earthquake's 60s interval — fastest configured source
let sourcesRefreshTimer = null

// Feature 002-source-scoping: group already-RLS-filtered sources into global/local for display.
const groupedSources = computed(() => groupSourcesByScope(sourcesStore.sources))

// A country_admin may only manage (edit/toggle/delete) sources scoped to their own country —
// enforced by RLS (20260706_data_sources_country_scope.sql), mirrored here so the UI doesn't
// offer actions that would just be rejected by the database.
function canManageSource(source) {
  if (auth.isSuperAdmin) return true
  return canAdmin.value && source.country_code === auth.countryCode
}

async function saveSource(payload) {
  savingSource.value = true
  sourceFormError.value = null
  try {
    if (editingSource.value?.id) {
      await sourcesStore.updateSource(editingSource.value.id, payload)
    } else {
      await sourcesStore.createSource(payload)
    }
    showSourceForm.value = false
    editingSource.value = null
  } catch (err) {
    sourceFormError.value = err.message ?? String(err)
  } finally {
    savingSource.value = false
  }
}

function editSource(source) {
  editingSource.value = source
  showSourceForm.value = true
}

async function toggleSourceActive(source) {
  const action = source.is_active ? 'devre dışı bırakmak' : 'yeniden etkinleştirmek'
  if (!confirm(`"${source.name}" kaynağını ${action} istediğinize emin misiniz?`)) return
  await sourcesStore.setActive(source.id, !source.is_active)
}

async function deleteSourceConfirm(source) {
  if (
    !confirm(
      `"${source.name}" kaynağını kalıcı olarak silmek istediğinize emin misiniz? Daha önce alınan veriler saklanmaya devam edecek, sadece bu kaynaktan yeni veri toplanması durur.`,
    )
  )
    return
  await sourcesStore.deleteSource(source.id)
}

async function viewAudit(source) {
  auditingSource.value = source
  auditLoading.value = true
  auditError.value = null
  auditData.value = null
  try {
    auditData.value = await sourcesStore.fetchAudit(source.id)
  } catch (err) {
    auditError.value = err.message ?? String(err)
  } finally {
    auditLoading.value = false
  }
}

function closeAudit() {
  auditingSource.value = null
  auditData.value = null
}

// ── Built-in feed health (aggregator server) ────────────────────────────────
// These are the always-on ingestion feeds the server polls directly, shown here
// split by scope: worldwide feeds vs. Turkey-only feeds (AFAD, Kandilli).
const disasterStore = useDisasterStore()
const AGGREGATOR_URL = import.meta.env.VITE_AGGREGATOR_URL || 'http://localhost:8765'
const GLOBAL_FEED_LIST = [
  'EMSC',
  'USGS',
  'GEOFON',
  'GDACS',
  'PTWC',
  'NASA FIRMS',
  'FEWS NET',
  'WHO',
]
const LOCAL_FEED_LIST = ['AFAD', 'Kandilli']

const feedServerStatus = ref({})
let feedServerTimer = null

async function checkFeedServer() {
  try {
    const res = await fetch(`${AGGREGATOR_URL}/status`, { signal: AbortSignal.timeout(4000) })
    feedServerStatus.value = res.ok ? ((await res.json()).sources ?? {}) : {}
  } catch {
    feedServerStatus.value = {}
  }
}

function feedStatusColor(entry) {
  if (!entry) return '#6b7280'
  const code = entry.code
  if (code === 200) return '#22c55e'
  if (code === 0) return '#f59e0b'
  if (code === 401 || code === 403) return '#f97316'
  return '#ef4444'
}

function feedStatusLabel(entry) {
  if (!entry) return 'Bilinmiyor'
  if (entry.code === 0) return 'WS kapalı'
  return `HTTP ${entry.code}`
}

function feedLastCheck(entry) {
  if (!entry?.at) return 'Henüz yok'
  const diff = Math.round((Date.now() - entry.at) / 1000)
  if (diff < 60) return `${diff}sn önce`
  return `${Math.round(diff / 60)}dk önce`
}

function buildFeedRows(names) {
  const status = disasterStore.sourcesStatus
  return names.map((name) => ({
    name,
    entry: feedServerStatus.value[name] ?? null,
    active: status[name] !== false,
  }))
}

const feedSources = computed(() => ({
  global: buildFeedRows(GLOBAL_FEED_LIST),
  local: buildFeedRows(LOCAL_FEED_LIST),
}))

function toggleFeedSource(name) {
  disasterStore.toggleSource(name)
}

// ── Audit & Compliance (spec 007) ───────────────────────────────────────────
const AUDIT_PAGE_SIZE = 25
const AUDIT_EXPORT_CAP = 5000
const auditRows = ref([])
const auditTotalCount = ref(0)
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

function openAuditTab() {
  tab.value = 'audit'
  loadAuditLog()
  loadComplianceReports()
  loadIncidentReports()
  loadDrillReports()
  loadDeadLetterCount()
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
  loadUsers()
  loadOrgs()
  loadDrills()
  hazardTypesStore.fetchHazardTypes()
  sourcesStore.fetchSources()
  sourcesRefreshTimer = setInterval(() => sourcesStore.fetchSources(), FASTEST_POLL_MS)
  checkFeedServer()
  feedServerTimer = setInterval(checkFeedServer, 30_000)
})

onUnmounted(() => {
  if (sourcesRefreshTimer) clearInterval(sourcesRefreshTimer)
  if (feedServerTimer) clearInterval(feedServerTimer)
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-header">
      <div class="admin-header-top">
        <button class="btn-back" @click="router.push('/')">← Harita</button>
        <button class="btn-back" @click="handleLogout">
          ⎋ Çıkış Yap
        </button>
      </div>
      <h1 class="admin-title">⚙️ Yönetim Paneli</h1>
      <span class="admin-subtitle">Administration &amp; Access Control</span>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', { active: tab === 'users' }]" @click="tab = 'users'">
        👥 Kullanıcılar
      </button>
      <button :class="['tab', { active: tab === 'orgs' }]" @click="tab = 'orgs'">
        🏢 Organizasyonlar
      </button>
      <button :class="['tab', { active: tab === 'drill' }]" @click="tab = 'drill'">
        🎯 Tatbikat
      </button>
      <button :class="['tab', { active: tab === 'sources' }]" @click="tab = 'sources'">
        📡 Veri Kaynakları
      </button>
      <button v-if="canAdmin" :class="['tab', { active: tab === 'csv' }]" @click="tab = 'csv'">
        📁 Dosya Yükle
      </button>
      <button
        v-if="canAdmin"
        :class="['tab', { active: tab === 'manual' }]"
        @click="tab = 'manual'"
      >
        ✍️ Manuel Giriş
      </button>
      <button
        v-if="canAdmin"
        :class="['tab', { active: tab === 'boundaries' }]"
        @click="tab = 'boundaries'"
      >
        🗺️ Sınır Verisi
      </button>
      <button
        v-if="canCreateUsers"
        :class="['tab', { active: tab === 'contacts' }]"
        @click="tab = 'contacts'"
      >
        📇 {{ t('contacts.tabLabel') }}
      </button>
      <button
        v-if="canCreateUsers"
        :class="['tab', { active: tab === 'dispatch' }]"
        @click="tab = 'dispatch'"
      >
        📨 {{ t('dispatch.panelTitle') }}
      </button>
      <button
        v-if="canCreateUsers"
        :class="['tab', { active: tab === 'integrations' }]"
        @click="tab = 'integrations'"
      >
        🔌 {{ t('integrations.tabLabel') }}
      </button>
      <button
        v-if="hasCapability('hazard_taxonomy')"
        :class="['tab', { active: tab === 'hazardTaxonomy' }]"
        @click="tab = 'hazardTaxonomy'"
      >
        🌋 {{ t('hazardTaxonomy.tabLabel') }}
      </button>
      <button
        v-if="hasCapability('sop_repository')"
        :class="['tab', { active: tab === 'sopRepository' }]"
        @click="tab = 'sopRepository'"
      >
        📋 {{ t('incidentTracking.sopTabLabel') }}
      </button>
      <button
        v-if="hasCapability('map_layers')"
        :class="['tab', { active: tab === 'mapLayers' }]"
        @click="tab = 'mapLayers'"
      >
        🗺️ {{ t('mapLayers.tabLabel') }}
      </button>
      <button
        v-if="hasCapability('audit')"
        :class="['tab', { active: tab === 'audit' }]"
        @click="openAuditTab"
      >
        🛡️ {{ t('audit.tabLabel') }}
      </button>
      <button
        v-if="canAdmin"
        :class="['tab', { active: tab === 'exposure' }]"
        @click="tab = 'exposure'"
      >
        📊 {{ t('impact.exposure.tabLabel') }}
      </button>
      <button
        v-if="canAdmin"
        :class="['tab', { active: tab === 'communityReports' }]"
        @click="tab = 'communityReports'"
      >
        📢 {{ t('communityReport.moderation.tabLabel') }}
      </button>
      <button
        v-if="isOrgAdmin"
        :class="['tab', { active: tab === 'assignedCommunityReports' }]"
        @click="tab = 'assignedCommunityReports'"
      >
        📢 {{ t('communityReport.assigned.tabLabel') }}
      </button>
    </div>

    <!-- ── Users tab ─────────────────────────────────────────────────────── -->
    <div v-if="tab === 'users'" class="tab-content">
      <div v-if="canCreateUsers" class="tab-actions">
        <button class="btn-new" @click="showUserForm = !showUserForm">
          {{ showUserForm ? '✕ Kapat' : '+ Kullanıcı Oluştur' }}
        </button>
      </div>
      <Transition name="slide-down">
        <div v-if="showUserForm" class="form-card">
          <div class="form-grid">
            <label class="form-field"
              ><span>E-posta *</span>
              <input v-model="userForm.email" type="email" placeholder="personel@bakanlik.gov.tr" />
            </label>
            <label class="form-field"
              ><span>Ad Soyad</span>
              <input v-model="userForm.full_name" placeholder="opsiyonel" />
            </label>
            <label class="form-field"
              ><span>Rol *</span>
              <select v-model="userForm.role">
                <option v-for="r in creatableRoles" :key="r" :value="r">{{ r }}</option>
              </select>
            </label>
            <label v-if="auth.isSuperAdmin" class="form-field"
              ><span>Ülke Kodu</span>
              <input
                v-model="userForm.country_code"
                placeholder="tr (super_admin için boş = tüm ülkeler)"
                maxlength="2"
              />
            </label>
            <label v-if="canAdmin" class="form-field"
              ><span>Organizasyon ID</span>
              <input
                v-model="userForm.org_id"
                placeholder="opsiyonel — UUID (org_admin için sınırlar)"
              />
            </label>
            <label v-if="userFormRegionOptions.length" class="form-field"
              ><span>Bölge / İl (opsiyonel — "sadece bölgemi göster" filtresi için)</span>
              <select v-model="userForm.region_code">
                <option value="">— tüm ülke —</option>
                <option v-for="r in userFormRegionOptions" :key="r" :value="r">{{ r }}</option>
              </select>
            </label>
          </div>
          <div class="form-actions">
            <div v-if="usersError" class="form-error">{{ usersError }}</div>
            <button
              class="btn-submit"
              @click="createUser"
              :disabled="creatingUser || !userForm.email"
            >
              {{ creatingUser ? 'Davet gönderiliyor...' : '📧 Davet Gönder' }}
            </button>
          </div>
        </div>
      </Transition>
      <div v-if="usersError" class="tab-error">{{ usersError }}</div>
      <div v-if="capabilityGrantError" class="tab-error">{{ capabilityGrantError }}</div>
      <div v-if="accessReviewError" class="tab-error">{{ accessReviewError }}</div>
      <div v-if="auth.isSuperAdmin" class="access-review-export">
        <button class="btn-export" @click="downloadAccessReview('csv')">{{ t('admin.accessReview.exportCsv') }}</button>
        <button class="btn-export" @click="downloadAccessReview('json')">{{ t('admin.accessReview.exportJson') }}</button>
      </div>
      <div v-if="usersLoading" class="tab-loading">Yükleniyor...</div>
      <div v-else class="users-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Ad Soyad</th>
              <th>Rol</th>
              <th>Ülke</th>
              <th>Org</th>
              <th v-if="auth.isSuperAdmin">{{ t('admin.capabilities.columnLabel') }}</th>
              <th v-if="auth.isSuperAdmin">{{ t('admin.accessReview.lastLogin') }}</th>
              <th v-if="auth.isSuperAdmin">{{ t('admin.accessReview.lockStatus') }}</th>
              <th>Kayıt</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.email || '—' }}</td>
              <td>{{ u.full_name || '—' }}</td>
              <td>
                <span v-if="editingUser?.id !== u.id" class="role-badge" :class="'role-' + u.role">
                  {{ u.role }}<span v-if="u.is_active === false" title="Askıya alındı"> 🚫</span>
                </span>
                <select v-else v-model="editingUser.role" class="inline-select">
                  <option v-for="r in creatableRoles" :key="r" :value="r">{{ r }}</option>
                </select>
              </td>
              <td>
                <span v-if="editingUser?.id !== u.id">{{ u.country_code || '🌍' }}</span>
                <input
                  v-else
                  v-model="editingUser.country_code"
                  class="inline-input"
                  placeholder="tr"
                  maxlength="2"
                />
              </td>
              <td>
                <span v-if="editingUser?.id !== u.id" class="muted">{{ u.org_id || '—' }}</span>
                <input
                  v-else
                  v-model="editingUser.org_id"
                  class="inline-input"
                  placeholder="org uuid"
                />
              </td>
              <td v-if="auth.isSuperAdmin" class="capability-cell">
                <label
                  v-if="canHaveCapabilityGrants(u)"
                  v-for="cap in CAPABILITIES"
                  :key="cap"
                  class="capability-toggle"
                  :title="t('admin.capabilities.' + cap)"
                >
                  <input
                    type="checkbox"
                    :checked="hasGrantedCapability(u.id, cap)"
                    @change="toggleCapability(u, cap)"
                  />
                  {{ t('admin.capabilities.' + cap + 'Short') }}
                </label>
                <span v-else class="muted">—</span>
              </td>
              <td v-if="auth.isSuperAdmin" class="muted">
                {{ accessReviewByProfileId[u.id]?.last_sign_in_at ? formatDate(accessReviewByProfileId[u.id].last_sign_in_at) : '—' }}
              </td>
              <td v-if="auth.isSuperAdmin">
                <span v-if="isLocked(u.id)" class="lock-badge" :title="accessReviewByProfileId[u.id]?.locked_until">
                  🔒 {{ t('admin.accessReview.locked') }}
                </span>
                <span v-else class="muted">—</span>
              </td>
              <td class="muted">{{ formatDate(u.created_at) }}</td>
              <td>
                <div v-if="editingUser?.id !== u.id" class="row-actions">
                  <button v-if="canAdmin" class="btn-edit" @click="editingUser = { ...u }">
                    ✏️
                  </button>
                  <button
                    v-if="auth.isSuperAdmin && isLocked(u.id)"
                    class="btn-reactivate"
                    @click="unlockUser(u.id)"
                    :title="t('admin.accessReview.unlockAction')"
                  >
                    🔓
                  </button>
                  <button
                    v-if="canAdmin && u.role !== 'viewer'"
                    class="btn-revoke"
                    @click="revokeAccess(u.id)"
                    title="Erişimi kısıtla (rolü viewer'a düşür)"
                  >
                    🔒
                  </button>
                  <button
                    v-if="canAdmin && u.id !== auth.session?.id && u.is_active !== false"
                    class="btn-suspend"
                    @click="suspendUser(u.id)"
                    title="Hesabı askıya al (girişi tamamen engeller)"
                  >
                    ⛔
                  </button>
                  <button
                    v-if="canAdmin && u.id !== auth.session?.id && u.is_active === false"
                    class="btn-reactivate"
                    @click="reactivateUser(u.id)"
                    title="Hesabı yeniden aktifleştir"
                  >
                    ✅
                  </button>
                </div>
                <div v-else class="row-actions">
                  <button class="btn-save" @click="saveUser" :disabled="savingUser">✓</button>
                  <button class="btn-cancel" @click="editingUser = null">✕</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── Orgs tab ──────────────────────────────────────────────────────── -->
    <div v-if="tab === 'orgs'" class="tab-content">
      <div class="tab-actions">
        <button v-if="canAdmin" class="btn-new" @click="showOrgForm = !showOrgForm">
          {{ showOrgForm ? '✕ Kapat' : '+ Organizasyon Ekle' }}
        </button>
      </div>
      <Transition name="slide-down">
        <div v-if="showOrgForm" class="form-card">
          <div class="form-grid">
            <label class="form-field"
              ><span>Adı *</span>
              <input v-model="orgForm.name" placeholder="AFAD İstanbul..." />
            </label>
            <label class="form-field"
              ><span>Ülke Kodu</span>
              <input v-model="orgForm.country_code" placeholder="tr" maxlength="2" />
            </label>
            <label class="form-field"
              ><span>Tür</span>
              <select v-model="orgForm.type">
                <option v-for="t in ORG_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="form-field"
              ><span>Üst Organizasyon ID</span>
              <input v-model="orgForm.parent_org_id" placeholder="UUID (opsiyonel)" />
            </label>
          </div>
          <div class="form-actions">
            <div v-if="orgsError" class="form-error">{{ orgsError }}</div>
            <button class="btn-submit" @click="saveOrg" :disabled="savingOrg || !orgForm.name">
              {{ savingOrg ? 'Kaydediliyor...' : '💾 Ekle' }}
            </button>
          </div>
        </div>
      </Transition>
      <div v-if="orgsLoading" class="tab-loading">Yükleniyor...</div>
      <div v-else class="orgs-list">
        <div v-for="org in orgs" :key="org.id" class="org-card">
          <div class="org-name">{{ org.name }}</div>
          <div class="org-meta">
            <span class="org-type">{{ org.type }}</span>
            <span class="org-country">{{ org.country_code }}</span>
            <span v-if="org.parent_org_id" class="org-parent">↳ alt kuruluş</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Drill tab ─────────────────────────────────────────────────────── -->
    <div v-if="tab === 'drill'" class="tab-content">
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

    <!-- ── Data Sources tab ──────────────────────────────────────────────── -->
    <div v-if="tab === 'sources'" class="tab-content">
      <div class="tab-actions">
        <button
          v-if="canAdmin"
          class="btn-new"
          @click="toggleSourceForm"
        >
          {{ showSourceForm && !editingSource ? '✕ Kapat' : '+ Kaynak Ekle' }}
        </button>
      </div>
      <Transition name="slide-down">
        <SourceFormModal
          v-if="showSourceForm"
          :source="editingSource"
          :saving="savingSource"
          :error="sourceFormError"
          @save="saveSource"
          @cancel="cancelSourceForm"
        />
      </Transition>

      <!-- Built-in ingestion feeds (aggregator server health) -->
      <div class="sources-group-label">🌍 Global Kaynaklar</div>
      <div class="sources-grid">
        <button
          v-for="source in feedSources.global"
          :key="source.name"
          class="feed-card"
          :class="{ 'feed-card-inactive': !source.active }"
          @click="toggleFeedSource(source.name)"
        >
          <div class="feed-card-top">
            <span
              class="feed-state"
              :style="{ color: source.active ? feedStatusColor(source.entry) : '#6b7280' }"
            >
              ● {{ source.active ? feedStatusLabel(source.entry) : 'Devre Dışı' }}
            </span>
          </div>
          <div class="source-name">{{ source.name }}</div>
          <div class="feed-card-meta">Son kontrol: {{ feedLastCheck(source.entry) }}</div>
        </button>
      </div>

      <div class="sources-divider"></div>
      <div class="sources-group-label">📍 Yerel Kaynaklar (Türkiye)</div>
      <div class="sources-grid">
        <button
          v-for="source in feedSources.local"
          :key="source.name"
          class="feed-card"
          :class="{ 'feed-card-inactive': !source.active }"
          @click="toggleFeedSource(source.name)"
        >
          <div class="feed-card-top">
            <span
              class="feed-state"
              :style="{ color: source.active ? feedStatusColor(source.entry) : '#6b7280' }"
            >
              ● {{ source.active ? feedStatusLabel(source.entry) : 'Devre Dışı' }}
            </span>
          </div>
          <div class="source-name">{{ source.name }}</div>
          <div class="feed-card-meta">Son kontrol: {{ feedLastCheck(source.entry) }}</div>
        </button>
      </div>

      <div class="sources-divider"></div>

      <div v-if="sourcesStore.error" class="tab-error">{{ sourcesStore.error }}</div>
      <div v-if="sourcesStore.loading && !sourcesStore.sources.length" class="tab-loading">
        Yükleniyor...
      </div>
      <div v-else>
        <div class="sources-group-label">🌍 Küresel Kaynaklar</div>
        <div class="sources-grid">
          <SourceHealthCard
            v-for="source in groupedSources.global"
            :key="source.id"
            :source="source"
            :can-manage="canManageSource(source)"
            @edit="editSource"
            @toggle-active="toggleSourceActive"
            @delete="deleteSourceConfirm"
            @view-audit="viewAudit"
          />
          <div v-if="!groupedSources.global.length" class="tab-loading">Küresel kaynak yok.</div>
        </div>

        <template v-if="groupedSources.local.length">
          <div class="sources-divider"></div>
          <div class="sources-group-label">📍 Yerel Kaynaklar</div>
          <div class="sources-grid">
            <SourceHealthCard
              v-for="source in groupedSources.local"
              :key="source.id"
              :source="source"
              :can-manage="canManageSource(source)"
              :show-country-badge="auth.isSuperAdmin"
              @edit="editSource"
              @toggle-active="toggleSourceActive"
              @delete="deleteSourceConfirm"
              @view-audit="viewAudit"
            />
          </div>
        </template>

        <div v-if="!sourcesStore.sources.length" class="tab-loading">
          Henüz kayıtlı veri kaynağı yok.
        </div>
      </div>

      <!-- Audit panel -->
      <div v-if="auditingSource" class="audit-panel">
        <div class="audit-header">
          <h3>📜 {{ auditingSource.name }} — Geçmiş</h3>
          <button class="btn-cancel-form" @click="closeAudit">✕ Kapat</button>
        </div>
        <div v-if="auditLoading" class="tab-loading">Yükleniyor...</div>
        <div v-else-if="auditError" class="tab-error">{{ auditError }}</div>
        <div v-else-if="auditData" class="audit-content">
          <div class="audit-section">
            <h4>Durum Geçişleri</h4>
            <div v-if="!auditData.transitions.length" class="muted">Kayıt yok.</div>
            <div v-for="t in auditData.transitions" :key="t.id" class="audit-row">
              <span class="muted">{{ formatDate(t.created_at) }}</span>
              <span>{{ t.previous_state }} → {{ t.new_state }}</span>
              <span class="muted">{{ t.reason }}</span>
            </div>
          </div>
          <div class="audit-section">
            <h4>Reddedilen Veriler</h4>
            <div v-if="!auditData.rejected_payloads.length" class="muted">Kayıt yok.</div>
            <div v-for="r in auditData.rejected_payloads" :key="r.id" class="audit-row">
              <span class="muted">{{ formatDate(r.occurred_at) }}</span>
              <span>{{ r.validation_error }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Manual Entry tab ──────────────────────────────────────────────── -->
    <div v-if="tab === 'manual'" class="tab-content">
      <ManualEntryForm />
    </div>

    <!-- ── CSV Import tab ────────────────────────────────────────────────── -->
    <div v-if="tab === 'csv'" class="tab-content">
      <FileImportForm />
    </div>

    <!-- ── Boundary Upload tab ───────────────────────────────────────────── -->
    <div v-if="tab === 'boundaries'" class="tab-content">
      <BoundaryUploadForm />
    </div>

    <!-- ── Contact Directory tab (spec 009) ─────────────────────────────────── -->
    <div v-if="tab === 'contacts'" class="tab-content">
      <ContactsPanel />
    </div>

    <!-- ── Dispatch monitor tab (spec 009) ──────────────────────────────────── -->
    <div v-if="tab === 'dispatch'" class="tab-content">
      <DispatchPanel />
    </div>

    <div v-if="tab === 'integrations'" class="tab-content">
      <IntegrationsPanel />
    </div>

    <!-- ── Hazard Taxonomy tab (spec 010, super_admin or spec 018 capability grant) ── -->
    <div v-if="tab === 'hazardTaxonomy' && hasCapability('hazard_taxonomy')" class="tab-content">
      <HazardTaxonomyPanel />
    </div>

    <!-- ── SOP Repository tab (spec 011, super_admin or spec 018 capability grant) ─── -->
    <div v-if="tab === 'sopRepository' && hasCapability('sop_repository')" class="tab-content">
      <SopRepositoryPanel />
    </div>

    <!-- ── Map Layers tab (spec 012, super_admin or spec 018 capability grant) ──────── -->
    <div v-if="tab === 'mapLayers' && hasCapability('map_layers')" class="tab-content">
      <MapLayerRegistryPanel />
    </div>

    <!-- ── Audit & Compliance tab (spec 007, super_admin or spec 018 capability grant) ── -->
    <div v-if="tab === 'audit' && hasCapability('audit')" class="tab-content audit-tab">
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

    <!-- ── Exposure Datasets tab (spec 008) ─────────────────────────────────── -->
    <div v-if="tab === 'exposure' && canAdmin" class="tab-content">
      <ExposureDatasetManager />
    </div>

    <!-- ── Community Reports moderation tab (spec 036) ──────────────────────── -->
    <div v-if="tab === 'communityReports' && canAdmin" class="tab-content">
      <CommunityReportsPanel />
    </div>

    <!-- ── org_admin's read-only assigned-reports tab (spec 036, US5) ───────── -->
    <div v-if="tab === 'assignedCommunityReports' && isOrgAdmin" class="tab-content">
      <AssignedCommunityReportsPanel />
    </div>
  </div>
</template>

<style scoped>
.admin-page {
  height: 100vh;
  overflow-y: auto;
  background: var(--color-bg, #0f1117);
  color: var(--color-text-primary, #e2e8f0);
  padding: 24px;
  font-family: var(--font-sans, 'Inter', sans-serif);
}
.admin-header {
  margin-bottom: 24px;
}
.admin-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.btn-back {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: var(--color-text-muted, #94a3b8);
  padding: 6px 14px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.15s;
  margin-bottom: 12px;
  display: inline-block;
}
.btn-back:hover {
  background: rgba(255, 255, 255, 0.12);
  color: var(--color-text-primary, #e2e8f0);
}
.admin-title {
  font-size: 1.6rem;
  font-weight: 800;
  margin: 0 0 4px;
}
.admin-subtitle {
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.tab {
  padding: 10px 18px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}
.tab.active {
  color: #4da3ff;
  border-bottom-color: #4da3ff;
}
.tab:hover:not(.active) {
  color: var(--color-text-primary, #e2e8f0);
}

.tab-content {
  animation: fade-in 0.2s ease;
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
  margin-bottom: 14px;
}
.tab-loading {
  text-align: center;
  padding: 40px;
  color: var(--color-text-muted, #94a3b8);
}
.tab-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  color: #ef4444;
  font-size: 0.85rem;
  margin-bottom: 12px;
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

/* Table */
.users-table-wrap {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.data-table th {
  padding: 10px 12px;
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #94a3b8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: middle;
}
.data-table tr:hover td {
  background: rgba(255, 255, 255, 0.02);
}
.muted {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.75rem;
}
.role-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
}
.role-super_admin {
  background: rgba(124, 58, 237, 0.2);
  color: #a78bfa;
}
.role-country_admin {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
}
.role-org_admin {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}
.role-viewer {
  background: rgba(148, 163, 184, 0.15);
  color: #94a3b8;
}
.row-actions {
  display: flex;
  gap: 6px;
}
.compliance-reports-section {
  margin-top: 24px;
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 16px;
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
.capability-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.75rem;
}
.capability-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  cursor: pointer;
}
.btn-edit,
.btn-revoke,
.btn-save,
.btn-cancel {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.15s;
}
.btn-edit:hover {
  background: rgba(77, 163, 255, 0.2);
}
.btn-revoke:hover {
  background: rgba(239, 68, 68, 0.2);
}
.btn-save:hover {
  background: rgba(34, 197, 94, 0.2);
}
.btn-cancel:hover {
  background: rgba(239, 68, 68, 0.2);
}
.inline-select,
.inline-input {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 4px 8px;
  color: #e2e8f0;
  font-size: 0.8rem;
}
.inline-select {
  color-scheme: dark;
}
.inline-select option {
  background: #1e2330;
  color: #e2e8f0;
}

/* Orgs */
.orgs-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.org-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.org-name {
  font-weight: 600;
  font-size: 0.88rem;
}
.org-meta {
  display: flex;
  gap: 8px;
  align-items: center;
}
.org-type,
.org-country {
  font-size: 0.7rem;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
}
.org-parent {
  font-size: 0.7rem;
  color: var(--color-text-muted, #94a3b8);
}

/* Drills */
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

/* Form shared */
.form-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 16px;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.span-2 {
  grid-column: span 2;
}
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.form-field input,
.form-field select {
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  color: #e2e8f0;
  font-size: 0.85rem;
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
.form-error {
  color: #ef4444;
  font-size: 0.8rem;
  flex: 1;
}
.btn-submit {
  padding: 9px 22px;
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

/* Data Sources */
.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.sources-group-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 14px 0 8px;
}
.sources-divider {
  height: 1px;
  background: var(--color-border, rgba(255, 255, 255, 0.12));
  margin: 20px 0 4px;
}
.feed-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.feed-card:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}
.feed-card-inactive {
  opacity: 0.45;
  filter: grayscale(0.6);
}
.feed-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}
.feed-state {
  font-weight: 700;
}
.feed-card-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
}
.source-name {
  flex: 1;
  color: var(--color-text-secondary);
  font-size: 0.95rem;
  font-weight: 700;
}
.audit-panel {
  margin-top: 20px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 18px;
}
.audit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.audit-header h3 {
  margin: 0;
  font-size: 1rem;
}
.audit-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.audit-section h4 {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.audit-row {
  display: flex;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.82rem;
  flex-wrap: wrap;
}

/* ── Audit & Compliance tab (spec 007) ─────────────────────────────────── */
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
  background: #1e2330;
  border: 1px solid rgba(255, 255, 255, 0.15);
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
.access-review-export {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.lock-badge {
  color: #ef4444;
  font-size: 0.78rem;
  font-weight: 600;
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
}
.audit-table th {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  color: var(--color-text-muted, #94a3b8);
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
