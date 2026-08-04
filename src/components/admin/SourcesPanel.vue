<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { useSourcesStore } from '@/stores/sources.js'
import { groupSourcesByScope, sortSources, SOURCE_SORT_MODES } from '@/utils/sourceScope.js'
import { computeDisplayState } from '@/utils/sourceDisplayState.js'
import SourceHealthCard from '@/components/admin/SourceHealthCard.vue'
import SourceFormModal from '@/components/admin/SourceFormModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { supabase } from '@/services/api/config.js'

const auth = useAuthStore()
const sourcesStore = useSourcesStore()

const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleString('tr-TR') : '—'
}

// ── Data Sources (feature 001-data-ingestion-monitoring) ───────────────────────
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

// Feature 002-source-scoping: group already-RLS-filtered sources into global/local for display.
const sourceSortMode = ref('hazard')
const groupedSources = computed(() => groupSourcesByScope(sortSources(sourcesStore.sources, sourceSortMode.value)))

// "Genel Sağlık Raporu" (2026-07-25 request) — deliberately READ-ONLY and
// purely client-side over data already loaded into sourcesStore. Discussed
// with the user whether this should also auto-FIX problems (restart a
// Docker container, redeploy an Edge Function, etc.) — decided against it:
// this app has no browser-reachable path to Docker or the Supabase CLI at
// all (same "frontend never talks to the aggregator directly" boundary
// this admin panel already respects elsewhere, see triggerSourceNow below),
// and auto-remediating a live disaster-alert system's data sources without
// a human looking at what actually broke is a real safety risk, not just
// an engineering shortcut. This reports; a human still decides what to do.
const STATE_LABELS = {
  healthy: 'Sağlıklı', degraded: 'Bozulmuş', down: 'Çalışmıyor', disabled: 'Devre Dışı',
  offline: 'Çevrimdışı', overdue: 'Gecikmiş', pending: 'Henüz Çalıştırılmadı',
}
const healthReport = ref(null)

function runHealthDiagnostic() {
  const now = Date.now()
  const counts = {}
  const problems = []
  for (const s of sourcesStore.sources) {
    const state = computeDisplayState(s, now)
    counts[state] = (counts[state] ?? 0) + 1
    if (state === 'down' || state === 'degraded' || state === 'offline') {
      problems.push({ name: s.name, hazard_type: s.hazard_type, state, last_success_at: s.last_success_at, consecutive_failures: s.consecutive_failures })
    }
  }
  healthReport.value = {
    ranAt: new Date().toISOString(),
    total: sourcesStore.sources.length,
    counts,
    problems,
  }
}

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
  // The form renders right after .tab-actions, near the top of the tab —
  // invisible without scrolling if the admin clicked "Düzenle" on a card
  // further down the grid. Without this, clicking Düzenle silently opened
  // the form off-screen with no visible feedback (2026-07-25 feedback:
  // "yukarıdaki yer edit oluyor ama anlaşılmıyor").
  document.querySelector('.tab-content')?.scrollTo({ top: 0, behavior: 'smooth' })
}

// "Elle güncelleyeceğim" kaynakları için — aggregator'a doğrudan bir istek
// atmıyoruz (bkz. server/src/index.js'in "Frontend ile DOĞRUDAN iletişim
// YOK" kuralı), sadece bir zaman damgası yazıyoruz; dynamicSources.js zaten
// çalışan 60 saniyelik döngüsünde bunu görüp kaynağı bir kerelik çekiyor
// (bkz. 20260725190000_manual_source_trigger.sql).
async function triggerSourceNow(source) {
  await sourcesStore.updateSource(source.id, { manual_trigger_requested_at: new Date().toISOString() })
}

// Native window.confirm() replaced with the in-app ConfirmDialog
// (2026-07-25 request: "hep yukarıdan HTML alarm ile çıkıyor" — the browser's
// native top-of-page dialog isn't part of this app's UI at all). Deletion
// additionally re-verifies the acting admin's own password before the
// action runs, not just a click-through confirmation.
const pendingToggleSource = ref(null)
const pendingDeleteSource = ref(null)
const confirmDialogError = ref(null)
const confirmDialogSubmitting = ref(false)

function toggleSourceActive(source) {
  pendingToggleSource.value = source
}
async function confirmToggleSource() {
  confirmDialogSubmitting.value = true
  try {
    await sourcesStore.setActive(pendingToggleSource.value.id, !pendingToggleSource.value.is_active)
    pendingToggleSource.value = null
  } finally {
    confirmDialogSubmitting.value = false
  }
}

function deleteSourceConfirm(source) {
  confirmDialogError.value = null
  pendingDeleteSource.value = source
}

async function verifyOwnPassword(password) {
  const { error } = await supabase.auth.signInWithPassword({ email: auth.session.email, password })
  return error ? (error.message || 'Şifre yanlış. Tekrar deneyin.') : null
}

async function confirmDeleteSource(password) {
  confirmDialogError.value = null
  confirmDialogSubmitting.value = true
  try {
    // Re-verify the CURRENT admin's own password before a destructive
    // delete — verifyOwnPassword calls signInWithPassword against the
    // already-logged-in session's own email, which just re-validates
    // credentials (same call login() uses), it doesn't change whose
    // account is signed in.
    const authErr = await verifyOwnPassword(password)
    if (authErr) {
      confirmDialogError.value = 'Şifre yanlış. Tekrar deneyin.'
      return
    }
    await sourcesStore.deleteSource(pendingDeleteSource.value.id)
    pendingDeleteSource.value = null
  } catch (err) {
    confirmDialogError.value = err.message ?? String(err)
  } finally {
    confirmDialogSubmitting.value = false
  }
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

onMounted(() => {
  if (!sourcesStore.sources.length) sourcesStore.fetchSources()
})
</script>

<template>
  <div class="tab-content">
    <div class="tab-actions sources-tab-actions">
      <label class="sources-sort-control">
        <span>Sırala:</span>
        <select v-model="sourceSortMode">
          <option v-for="m in SOURCE_SORT_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </label>
      <div class="sources-tab-actions-right">
        <button class="btn-new btn-diagnostic" @click="runHealthDiagnostic">
          🩺 Genel Sağlık Raporu
        </button>
        <button
          v-if="canAdmin"
          class="btn-new"
          @click="toggleSourceForm"
        >
          {{ showSourceForm && !editingSource ? '✕ Kapat' : '+ Kaynak Ekle' }}
        </button>
      </div>
    </div>

    <div v-if="healthReport" class="health-report">
      <div class="health-report-header">
        <strong>🩺 Genel Sağlık Raporu</strong>
        <span class="muted">{{ formatDate(healthReport.ranAt) }}</span>
        <button class="btn-cancel-form" @click="healthReport = null">✕ Kapat</button>
      </div>
      <div class="health-report-counts">
        <span v-for="(count, state) in healthReport.counts" :key="state" :class="`health-count health-count-${state}`">
          {{ STATE_LABELS[state] ?? state }}: {{ count }}
        </span>
        <span class="health-count">Toplam: {{ healthReport.total }}</span>
      </div>
      <div v-if="!healthReport.problems.length" class="health-report-ok">
        ✅ Şu an "Bozulmuş", "Çalışmıyor" veya "Çevrimdışı" durumda kaynak yok.
      </div>
      <div v-else class="health-report-problems">
        <div v-for="p in healthReport.problems" :key="p.name + p.hazard_type" class="health-report-row">
          <span :class="`health-count-${p.state}`">{{ STATE_LABELS[p.state] }}</span>
          <span>{{ p.name }} ({{ p.hazard_type }})</span>
          <span class="muted">son başarı: {{ p.last_success_at ? formatDate(p.last_success_at) : 'hiç' }}</span>
          <span v-if="p.consecutive_failures > 0" class="muted">{{ p.consecutive_failures }} ardışık hata</span>
        </div>
      </div>
      <div class="health-report-hint muted">
        Bu rapor salt okunur — hiçbir kaynağı otomatik yeniden başlatmaz/deploy etmez.
        Sorunlu bir kaynağın kartındaki 📜 Geçmiş'ten gerçek hata mesajını okuyup
        ✏️ Düzenle'den düzeltin, ya da geçiciyse (HTTP 5xx) kendi kendine düzelmesini bekleyin.
      </div>
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
          @trigger-now="triggerSourceNow"
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
            @trigger-now="triggerSourceNow"
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
        <div class="audit-hint">
          <strong>Hata mesajını nasıl okumalı:</strong>
          "HTTP 5xx" (500, 502, 503...) kaynağın <em>kendi</em> sunucusunun sorunu — bizim
          tarafımızda düzeltilecek bir şey yok, genelde kendi kendine geçer (bkz. aşağıdaki geçmiş).
          "HTTP 4xx" (401, 403, 404...) veya "unresolvable timestamp" / "missing required field"
          gibi mesajlar bizim isteğimizle/alan eşleştirmemizle ilgili — ✏️ Düzenle'den URL veya
          alan eşleştirmesini kontrol edin. "timeout" genelde geçici bir erişim sorunudur.
        </div>
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

    <ConfirmDialog
      v-if="pendingToggleSource"
      :title="pendingToggleSource.is_active ? 'Kaynağı devre dışı bırak' : 'Kaynağı yeniden etkinleştir'"
      :message="`&quot;${pendingToggleSource.name}&quot; kaynağını ${pendingToggleSource.is_active ? 'devre dışı bırakmak' : 'yeniden etkinleştirmek'} istediğinize emin misiniz?`"
      confirm-label="Onayla"
      :submitting="confirmDialogSubmitting"
      @confirm="confirmToggleSource"
      @cancel="pendingToggleSource = null"
    />
    <ConfirmDialog
      v-if="pendingDeleteSource"
      title="Kaynağı sil"
      :message="`&quot;${pendingDeleteSource.name}&quot; kaynağını kalıcı olarak silmek istediğinize emin misiniz? Daha önce alınan veriler saklanmaya devam edecek, sadece bu kaynaktan yeni veri toplanması durur.`"
      require-password
      danger
      confirm-label="Sil"
      :error="confirmDialogError"
      :submitting="confirmDialogSubmitting"
      @confirm="confirmDeleteSource"
      @cancel="pendingDeleteSource = null; confirmDialogError = null"
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
.muted {
  color: var(--color-text-muted, #94a3b8);
  font-size: 0.75rem;
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
.sources-tab-actions {
  justify-content: space-between;
  align-items: center;
}
.sources-tab-actions-right {
  display: flex;
  gap: 8px;
}
.btn-diagnostic {
  background: rgba(77, 163, 255, 0.12);
  border-color: rgba(77, 163, 255, 0.35);
}
.health-report {
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 14px;
  font-size: 0.8rem;
}
.health-report-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.health-report-header strong { font-size: 0.88rem; }
.health-report-header .btn-cancel-form { margin-left: auto; }
.health-report-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-bottom: 10px;
  font-size: 0.76rem;
}
.health-count-healthy { color: #22c55e; }
.health-count-degraded, .health-count-overdue { color: #fbbf24; }
.health-count-down, .health-count-offline { color: #ef4444; }
.health-count-disabled, .health-count-pending { color: #94a3b8; }
.health-report-ok { color: #22c55e; font-size: 0.8rem; }
.health-report-problems {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.health-report-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 0.78rem;
  padding: 4px 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.08);
}
.health-report-hint {
  margin-top: 10px;
  font-size: 0.72rem;
  line-height: 1.5;
}
.sources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.sources-group-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted, #94a3b8);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 14px 0 8px;
}
.sources-sort-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  color: var(--color-text-muted, #94a3b8);
}
.sources-sort-control select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--color-text-primary, #e2e8f0);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 0.78rem;
  color-scheme: dark;
}
.sources-sort-control select option {
  background: #1e2330;
  color: #e2e8f0;
}
.sources-divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.14);
  margin: 18px 0 4px;
}
.audit-panel {
  margin-top: 20px;
  background: rgba(2, 6, 23, 0.28);
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 8px;
  padding: 14px;
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
.audit-hint {
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--color-text-muted, #94a3b8);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
}
.audit-hint strong { color: var(--color-text-primary, #e2e8f0); }
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
</style>
