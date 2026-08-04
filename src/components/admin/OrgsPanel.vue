<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const auth = useAuthStore()
const canAdmin = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')

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

onMounted(() => {
  loadOrgs()
})
</script>

<template>
  <div class="tab-content">
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
</style>
