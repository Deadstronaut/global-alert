<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'
import { getRegionNames } from '@/data/boundaries/index.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const { t } = useI18n()
const auth = useAuthStore()

const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')
const canCreateUsers = computed(() => canAdmin.value || auth.session?.role === 'org_admin')

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
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

// Both revoke and suspend previously ran on a single click with NO
// confirmation at all — for account-security actions on someone ELSE's
// account, that's worse than the native window.confirm() this same
// 2026-07-25 session already replaced for kaynak delete. Same ConfirmDialog
// + own-password re-verification pattern as AdminView's confirmDeleteSource.
const pendingRevokeUser = ref(null)
const pendingSuspendUser = ref(null)
const confirmDialogError = ref(null)
const confirmDialogSubmitting = ref(false)

async function verifyOwnPassword(password) {
  const { error } = await supabase.auth.signInWithPassword({ email: auth.session.email, password })
  return error ? (error.message || 'Şifre yanlış. Tekrar deneyin.') : null
}

async function confirmRevokeAccess(password) {
  confirmDialogError.value = null
  confirmDialogSubmitting.value = true
  try {
    const authErr = await verifyOwnPassword(password)
    if (authErr) { confirmDialogError.value = 'Şifre yanlış. Tekrar deneyin.'; return }
    const { error } = await supabase.from('profiles').update({ role: 'viewer' }).eq('id', pendingRevokeUser.value.id)
    if (error) { usersError.value = error.message; return }
    pendingRevokeUser.value = null
    await loadUsers()
  } finally {
    confirmDialogSubmitting.value = false
  }
}

// Real access suspension (spec 004 gap 3) — distinct from revokeAccess()'s role
// downgrade above: this blocks login entirely rather than just lowering permissions.
async function confirmSuspendUser(password) {
  confirmDialogError.value = null
  confirmDialogSubmitting.value = true
  try {
    const authErr = await verifyOwnPassword(password)
    if (authErr) { confirmDialogError.value = 'Şifre yanlış. Tekrar deneyin.'; return }
    await auth.suspendUser(pendingSuspendUser.value.id)
    pendingSuspendUser.value = null
    await loadUsers()
  } catch (err) {
    confirmDialogError.value = err.message
  } finally {
    confirmDialogSubmitting.value = false
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

onMounted(() => {
  loadUsers()
})
</script>

<template>
  <div class="tab-content">
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
    <div v-if="usersLoading" class="tab-loading">{{ t('sidebar.loadingEllipsis') }}</div>
    <div v-else class="users-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ t('admin.table.email') }}</th>
            <th>{{ t('admin.table.fullName') }}</th>
            <th>{{ t('admin.table.role') }}</th>
            <th>{{ t('admin.table.country') }}</th>
            <th>{{ t('admin.table.org') }}</th>
            <th v-if="auth.isSuperAdmin">{{ t('admin.capabilities.columnLabel') }}</th>
            <th v-if="auth.isSuperAdmin">{{ t('admin.accessReview.lastLogin') }}</th>
            <th v-if="auth.isSuperAdmin">{{ t('admin.accessReview.lockStatus') }}</th>
            <th>{{ t('admin.table.registered') }}</th>
            <th>{{ t('admin.table.action') }}</th>
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
                  @click="pendingRevokeUser = u"
                  title="Erişimi kısıtla (rolü viewer'a düşür)"
                >
                  🔒
                </button>
                <button
                  v-if="canAdmin && u.id !== auth.session?.id && u.is_active !== false"
                  class="btn-suspend"
                  @click="pendingSuspendUser = u"
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

    <ConfirmDialog
      v-if="pendingRevokeUser"
      title="Erişimi kısıtla"
      :message="`&quot;${pendingRevokeUser.email}&quot; kullanıcısının rolünü viewer'a düşürmek istediğinize emin misiniz?`"
      require-password
      danger
      confirm-label="Kısıtla"
      :error="confirmDialogError"
      :submitting="confirmDialogSubmitting"
      @confirm="confirmRevokeAccess"
      @cancel="pendingRevokeUser = null; confirmDialogError = null"
    />
    <ConfirmDialog
      v-if="pendingSuspendUser"
      title="Hesabı askıya al"
      :message="`&quot;${pendingSuspendUser.email}&quot; kullanıcısını askıya almak istediğinize emin misiniz? Girişi tamamen engellenir.`"
      require-password
      danger
      confirm-label="Askıya Al"
      :error="confirmDialogError"
      :submitting="confirmDialogSubmitting"
      @confirm="confirmSuspendUser"
      @cancel="pendingSuspendUser = null; confirmDialogError = null"
    />
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
.users-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  background: rgba(2, 6, 23, 0.28);
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}
.data-table th {
  padding: 9px 12px;
  text-align: left;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted, #94a3b8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  background: rgba(15, 23, 42, 0.72);
}
.data-table td {
  padding: 9px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: middle;
}
.data-table tr:hover td {
  background: rgba(77, 163, 255, 0.04);
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
.form-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.form-field input,
.form-field select {
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
.form-error {
  color: #ef4444;
  font-size: 0.8rem;
  flex: 1;
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
</style>
