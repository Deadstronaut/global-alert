<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const router = useRouter()

const auth = useAuthStore()
const tab = ref('users')   // 'users' | 'orgs' | 'drill'

// ── Users ──────────────────────────────────────────────────────────────────────
const users = ref([])
const usersLoading = ref(false)
const usersError = ref(null)
const editingUser = ref(null)   // { id, role, country_code }
const savingUser = ref(false)

const ROLES = ['super_admin','country_admin','org_admin','viewer']

async function loadUsers() {
  usersLoading.value = true
  usersError.value = null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, country_code, org_id, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) usersError.value = error.message
  else users.value = data || []
  usersLoading.value = false
}

async function saveUser() {
  if (!editingUser.value) return
  savingUser.value = true
  const { error } = await supabase
    .from('profiles')
    .update({ role: editingUser.value.role, country_code: editingUser.value.country_code || null })
    .eq('id', editingUser.value.id)
  savingUser.value = false
  if (error) { usersError.value = error.message; return }
  editingUser.value = null
  await loadUsers()
}

async function revokeAccess(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ role: 'viewer' })
    .eq('id', userId)
  if (error) { usersError.value = error.message; return }
  await loadUsers()
}

// ── Organizations ──────────────────────────────────────────────────────────────
const orgs = ref([])
const orgsLoading = ref(false)
const orgsError = ref(null)
const showOrgForm = ref(false)
const orgForm = ref({ name: '', country_code: '', type: 'general', parent_org_id: '' })
const savingOrg = ref(false)

const ORG_TYPES = ['general','fire','flood','earthquake','health','police','military']

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
  if (error) { orgsError.value = error.message; return }
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
  if (error) { drillsError.value = error.message; return }
  showDrillForm.value = false
  await loadDrills()
}

async function endDrill(drill) {
  const summary = {
    duration_min: Math.round((Date.now() - new Date(drill.started_at).getTime()) / 60000),
    ended_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('drill_sessions')
    .update({ status: 'completed', ended_at: new Date().toISOString(), summary })
    .eq('id', drill.id)
  if (error) { drillsError.value = error.message; return }
  await loadDrills()
}

const canAdmin = computed(() =>
  auth.isSuperAdmin || auth.session?.role === 'country_admin'
)

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

onMounted(() => {
  loadUsers()
  loadOrgs()
  loadDrills()
})
</script>

<template>
  <div class="admin-page">
    <div class="admin-header">
      <button class="btn-back" @click="router.push('/')">← Harita</button>
      <h1 class="admin-title">⚙️ Yönetim Paneli</h1>
      <span class="admin-subtitle">Administration &amp; Access Control</span>
    </div>

    <!-- Tabs -->
    <div class="tabs">
      <button :class="['tab', { active: tab === 'users' }]" @click="tab = 'users'">👥 Kullanıcılar</button>
      <button :class="['tab', { active: tab === 'orgs' }]"  @click="tab = 'orgs'">🏢 Organizasyonlar</button>
      <button :class="['tab', { active: tab === 'drill' }]" @click="tab = 'drill'">🎯 Tatbikat</button>
    </div>

    <!-- ── Users tab ─────────────────────────────────────────────────────── -->
    <div v-if="tab === 'users'" class="tab-content">
      <div v-if="usersError" class="tab-error">{{ usersError }}</div>
      <div v-if="usersLoading" class="tab-loading">Yükleniyor...</div>
      <div v-else class="users-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th><th>Ad Soyad</th><th>Rol</th><th>Ülke</th><th>Kayıt</th><th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.email || '—' }}</td>
              <td>{{ u.full_name || '—' }}</td>
              <td>
                <span v-if="editingUser?.id !== u.id" class="role-badge" :class="'role-' + u.role">
                  {{ u.role }}
                </span>
                <select v-else v-model="editingUser.role" class="inline-select">
                  <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
                </select>
              </td>
              <td>
                <span v-if="editingUser?.id !== u.id">{{ u.country_code || '🌍' }}</span>
                <input v-else v-model="editingUser.country_code" class="inline-input" placeholder="tr" maxlength="2" />
              </td>
              <td class="muted">{{ formatDate(u.created_at) }}</td>
              <td>
                <div v-if="editingUser?.id !== u.id" class="row-actions">
                  <button v-if="canAdmin" class="btn-edit" @click="editingUser = { ...u }">✏️</button>
                  <button v-if="canAdmin && u.role !== 'viewer'" class="btn-revoke"
                    @click="revokeAccess(u.id)" title="Erişimi kısıtla">🔒</button>
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
            <label class="form-field"><span>Adı *</span>
              <input v-model="orgForm.name" placeholder="AFAD İstanbul..." />
            </label>
            <label class="form-field"><span>Ülke Kodu</span>
              <input v-model="orgForm.country_code" placeholder="tr" maxlength="2" />
            </label>
            <label class="form-field"><span>Tür</span>
              <select v-model="orgForm.type">
                <option v-for="t in ORG_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </label>
            <label class="form-field"><span>Üst Organizasyon ID</span>
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
            <label class="form-field span-2"><span>Tatbikat Adı *</span>
              <input v-model="drillForm.title" placeholder="2025 Deprem Tatbikatı..." />
            </label>
            <label class="form-field"><span>Ülke</span>
              <input v-model="drillForm.country_code" placeholder="tr" maxlength="2" />
            </label>
            <label class="form-field"><span>Senaryo</span>
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
            <button class="btn-submit drill-start" @click="startDrill" :disabled="savingDrill || !drillForm.title">
              🎯 {{ savingDrill ? 'Başlatılıyor...' : 'Tatbikatı Başlat' }}
            </button>
          </div>
        </div>
      </Transition>
      <div v-if="drillsLoading" class="tab-loading">Yükleniyor...</div>
      <div v-else class="drills-list">
        <div v-for="d in drills" :key="d.id" class="drill-card"
             :class="{ 'drill-active': d.status === 'active' }">
          <div class="drill-top">
            <span class="drill-status" :class="'ds-' + d.status">● {{ d.status.toUpperCase() }}</span>
            <span class="drill-country">{{ d.country_code }}</span>
            <span class="drill-scenario">{{ d.scenario_type }}</span>
            <span class="muted" style="margin-left:auto">{{ formatDate(d.created_at) }}</span>
          </div>
          <div class="drill-title">{{ d.title }}</div>
          <div v-if="d.started_at" class="muted" style="font-size:.75rem">
            Başladı: {{ formatDate(d.started_at) }}
            <span v-if="d.ended_at"> · Bitti: {{ formatDate(d.ended_at) }}</span>
          </div>
          <div v-if="d.summary" class="drill-summary">
            Süre: {{ d.summary.duration_min }} dk
          </div>
          <div v-if="canAdmin && d.status === 'active'" class="drill-actions">
            <button class="btn-end-drill" @click="endDrill(d)">⏹ Tatbikatı Bitir</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-page { min-height: 100vh; background: var(--color-bg,#0f1117); color: var(--color-text-primary,#e2e8f0); padding: 24px; font-family: var(--font-sans,'Inter',sans-serif); }
.admin-header { margin-bottom: 24px; }
.btn-back { background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.12); border-radius: 8px; color: var(--color-text-muted,#94a3b8); padding: 6px 14px; font-size: .8rem; cursor: pointer; transition: background .15s; margin-bottom: 12px; display: inline-block; }
.btn-back:hover { background: rgba(255,255,255,.12); color: var(--color-text-primary,#e2e8f0); }
.admin-title  { font-size: 1.6rem; font-weight: 800; margin: 0 0 4px; }
.admin-subtitle { font-size: .75rem; color: var(--color-text-muted,#94a3b8); text-transform: uppercase; letter-spacing: .1em; }

.tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,.08); }
.tab {
  padding: 10px 18px; background: transparent; border: none; border-bottom: 2px solid transparent;
  color: var(--color-text-muted,#94a3b8); font-size: .85rem; font-weight: 600; cursor: pointer; transition: all .15s;
}
.tab.active   { color: #4da3ff; border-bottom-color: #4da3ff; }
.tab:hover:not(.active) { color: var(--color-text-primary,#e2e8f0); }

.tab-content  { animation: fade-in .2s ease; }
@keyframes fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

.tab-actions  { display: flex; justify-content: flex-end; margin-bottom: 14px; }
.tab-loading  { text-align: center; padding: 40px; color: var(--color-text-muted,#94a3b8); }
.tab-error    { background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.3); border-radius: 8px; padding: 10px 14px; color: #ef4444; font-size: .85rem; margin-bottom: 12px; }

.btn-new      { padding: 8px 16px; background: rgba(77,163,255,.18); border: 1px solid rgba(77,163,255,.4); border-radius: 8px; color: #4da3ff; font-weight: 600; cursor: pointer; font-size: .82rem; transition: background .15s; }
.btn-new:hover{ background: rgba(77,163,255,.28); }

/* Table */
.users-table-wrap { overflow-x: auto; }
.data-table   { width: 100%; border-collapse: collapse; font-size: .82rem; }
.data-table th{ padding: 10px 12px; text-align: left; font-size: .7rem; text-transform: uppercase; letter-spacing: .08em; color: var(--color-text-muted,#94a3b8); border-bottom: 1px solid rgba(255,255,255,.08); }
.data-table td{ padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,.05); vertical-align: middle; }
.data-table tr:hover td { background: rgba(255,255,255,.02); }
.muted        { color: var(--color-text-muted,#94a3b8); font-size: .75rem; }
.role-badge   { padding: 2px 8px; border-radius: 4px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
.role-super_admin   { background: rgba(124,58,237,.2); color: #a78bfa; }
.role-country_admin { background: rgba(59,130,246,.2); color: #60a5fa; }
.role-org_admin     { background: rgba(16,185,129,.2); color: #34d399; }
.role-viewer        { background: rgba(148,163,184,.15); color: #94a3b8; }
.row-actions  { display: flex; gap: 6px; }
.btn-edit, .btn-revoke, .btn-save, .btn-cancel {
  width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(255,255,255,.12);
  background: rgba(255,255,255,.06); cursor: pointer; font-size: .8rem; transition: background .15s;
}
.btn-edit:hover   { background: rgba(77,163,255,.2); }
.btn-revoke:hover { background: rgba(239,68,68,.2); }
.btn-save:hover   { background: rgba(34,197,94,.2); }
.btn-cancel:hover { background: rgba(239,68,68,.2); }
.inline-select, .inline-input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; padding: 4px 8px; color: #e2e8f0; font-size: .8rem;
}
.inline-select { color-scheme: dark; }
.inline-select option { background: #1e2330; color: #e2e8f0; }

/* Orgs */
.orgs-list  { display: flex; flex-direction: column; gap: 8px; }
.org-card   { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
.org-name   { font-weight: 600; font-size: .88rem; }
.org-meta   { display: flex; gap: 8px; align-items: center; }
.org-type, .org-country { font-size: .7rem; background: rgba(255,255,255,.08); padding: 2px 7px; border-radius: 4px; }
.org-parent { font-size: .7rem; color: var(--color-text-muted,#94a3b8); }

/* Drills */
.drills-list   { display: flex; flex-direction: column; gap: 10px; }
.drill-card    { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; padding: 14px 16px; }
.drill-card.drill-active { border-color: rgba(251,191,36,.4); background: rgba(251,191,36,.04); }
.drill-top     { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; flex-wrap: wrap; }
.drill-status  { font-size: .72rem; font-weight: 700; }
.ds-active     { color: #fbbf24; }
.ds-inactive   { color: #94a3b8; }
.ds-completed  { color: #22c55e; }
.drill-country, .drill-scenario { font-size: .7rem; background: rgba(255,255,255,.08); padding: 2px 7px; border-radius: 4px; }
.drill-title   { font-size: .95rem; font-weight: 700; margin-bottom: 4px; }
.drill-summary { font-size: .78rem; color: #60a5fa; margin-top: 4px; }
.drill-actions { margin-top: 10px; }
.btn-end-drill {
  padding: 7px 16px; background: rgba(239,68,68,.18); border: 1px solid rgba(239,68,68,.35);
  border-radius: 8px; color: #f87171; font-weight: 600; cursor: pointer; font-size: .82rem; transition: background .15s;
}
.btn-end-drill:hover { background: rgba(239,68,68,.28); }

/* Form shared */
.form-card   { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 18px; margin-bottom: 16px; }
.form-grid   { display: grid; grid-template-columns: repeat(2,1fr); gap: 12px; }
.span-2      { grid-column: span 2; }
.form-field  { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted,#94a3b8); }
.form-field input, .form-field select {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; width: 100%;
}
.form-field select { color-scheme: dark; }
.form-field select option { background: #1e2330; color: #e2e8f0; }
.form-field input:focus, .form-field select:focus { outline: none; border-color: rgba(77,163,255,.5); }
.form-actions{ display: flex; align-items: center; gap: 12px; margin-top: 14px; }
.form-error  { color: #ef4444; font-size: .8rem; flex: 1; }
.btn-submit  { padding: 9px 22px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4); border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer; font-size: .85rem; transition: background .15s; }
.btn-submit.drill-start { background: rgba(251,191,36,.18); border-color: rgba(251,191,36,.4); color: #fbbf24; }
.btn-submit:disabled { opacity: .45; cursor: not-allowed; }
.btn-submit:not(:disabled):hover { background: rgba(34,197,94,.3); }

.slide-down-enter-active, .slide-down-leave-active { transition: max-height .3s ease, opacity .25s ease; max-height: 600px; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { max-height: 0; opacity: 0; }
</style>
