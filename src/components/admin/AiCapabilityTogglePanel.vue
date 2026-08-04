<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useAiAssistanceStore } from '@/stores/aiAssistance.js'

// Spec 051, FR-001/SC-005 — per-country admin toggle for the four sandboxed
// AI capabilities. country_admin manages only their own country (RLS-locked
// anyway; the input is shown read-only here for clarity); super_admin types
// any 2-letter country code, mirroring the existing free-text country_code
// input pattern used elsewhere in AdminView.vue (userForm/orgForm/drillForm).
const { t } = useI18n()
const auth = useAuthStore()
const aiAssistance = useAiAssistanceStore()

const CAPABILITIES = ['translate', 'summarize', 'classify_photo', 'anomaly_flag']

// super_admin accounts commonly have no fixed country_code of their own, so
// there is nothing to default to from the account itself — restore whatever
// country was last configured here instead (AiAssistantWidget.vue reads the
// same key so the floating chat button uses the same country context a
// super_admin just enabled, rather than silently finding nothing enabled).
const targetCountryCode = ref(
  auth.isSuperAdmin ? localStorage.getItem('aiAssistantCountryCode') || '' : auth.countryCode || '',
)
const loading = ref(false)
const saving = ref(null) // capability currently being saved, or null

const normalizedCountryCode = computed(() => (targetCountryCode.value || '').trim().toLowerCase())

watch(normalizedCountryCode, (code) => {
  if (code) localStorage.setItem('aiAssistantCountryCode', code)
})

async function loadCapabilities() {
  if (!normalizedCountryCode.value) return
  loading.value = true
  await aiAssistance.fetchCapabilities(normalizedCountryCode.value)
  loading.value = false
}

async function toggle(capability) {
  if (!normalizedCountryCode.value) return
  saving.value = capability
  await aiAssistance.setCapabilityEnabled(
    normalizedCountryCode.value,
    capability,
    !aiAssistance.isEnabled(capability),
  )
  saving.value = null
}

onMounted(loadCapabilities)
watch(normalizedCountryCode, loadCapabilities)
</script>

<template>
  <div class="ai-capability-panel">
    <h3>{{ t('ai.panelTitle') }}</h3>
    <p class="ai-capability-panel__hint">{{ t('ai.panelHint') }}</p>

    <label class="ai-capability-panel__country">
      <span>{{ t('ai.countryCode') }}</span>
      <input
        v-model="targetCountryCode"
        :readonly="!auth.isSuperAdmin"
        maxlength="2"
        placeholder="tr"
      />
    </label>

    <div v-if="!normalizedCountryCode" class="ai-capability-panel__empty">{{ t('ai.enterCountryCode') }}</div>

    <ul v-else class="ai-capability-panel__list">
      <li v-for="cap in CAPABILITIES" :key="cap" class="ai-capability-panel__row">
        <span>{{ t(`ai.capabilityLabel.${cap}`) }}</span>
        <button
          type="button"
          :class="['ai-capability-panel__switch', { on: aiAssistance.isEnabled(cap) }]"
          :disabled="loading || saving === cap"
          @click="toggle(cap)"
        >
          {{ aiAssistance.isEnabled(cap) ? t('ai.enabled') : t('ai.disabled') }}
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ai-capability-panel { display: flex; flex-direction: column; gap: 14px; max-width: 520px; }
.ai-capability-panel__hint { font-size: .82rem; color: var(--color-text-muted, #94a3b8); margin: 0; }
.ai-capability-panel__country { display: flex; flex-direction: column; gap: 5px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); max-width: 120px; }
.ai-capability-panel__country input {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 8px 10px; color: #e2e8f0; font-size: .85rem; text-transform: lowercase;
}
.ai-capability-panel__empty { font-size: .82rem; color: #f59e0b; }
.ai-capability-panel__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ai-capability-panel__row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; border: 1px solid rgba(255,255,255,.1); border-radius: 8px; background: #161b26;
  color: #e2e8f0; font-size: .85rem;
}
.ai-capability-panel__switch {
  padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.06); color: #94a3b8; cursor: pointer; font-size: .78rem; font-weight: 600;
}
.ai-capability-panel__switch.on { background: rgba(34,197,94,.2); border-color: rgba(34,197,94,.4); color: #22c55e; }
.ai-capability-panel__switch:disabled { opacity: .5; cursor: not-allowed; }
</style>
