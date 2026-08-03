<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { useAiAssistanceStore } from '@/stores/aiAssistance.js'
import { supabase } from '@/services/api/config.js'

// Spec 051 US4 — passive, dismissible list of pending anomaly_flag
// suggestions (ai-anomaly-check writes these on a pg_cron sweep, see
// research.md Decision 2). Dismissing a flag ONLY resolves the
// ai_suggestions row to 'ignored' — it never touches the source hazard
// table, any risk score, cascading-risk rule, alert, or dispatch (FR-011).
const { t } = useI18n()
const auth = useAuthStore()
const aiAssistance = useAiAssistanceStore()

const flags = ref([])
const loading = ref(false)

async function loadFlags() {
  loading.value = true
  let query = supabase
    .from('ai_suggestions')
    .select('*')
    .eq('capability', 'anomaly_flag')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!auth.isSuperAdmin && auth.countryCode) query = query.eq('country_code', auth.countryCode)
  const { data } = await query
  flags.value = data || []
  loading.value = false
}

async function dismiss(flag) {
  await aiAssistance.resolveSuggestion(flag.id, { status: 'ignored' })
  flags.value = flags.value.filter((f) => f.id !== flag.id)
}

onMounted(loadFlags)
</script>

<template>
  <div class="ai-anomaly-flags-panel">
    <h3>{{ t('ai.anomalyFlagsTitle') }}</h3>
    <p class="ai-anomaly-flags-panel__hint">{{ t('ai.anomalyFlagsHint') }}</p>

    <p v-if="loading">{{ t('ai.loading') }}</p>
    <p v-else-if="!flags.length">{{ t('ai.anomalyFlagsEmpty') }}</p>

    <div v-for="flag in flags" :key="flag.id" class="ai-anomaly-flags-panel__row">
      <div>
        <strong>{{ flag.source_table }}</strong>
        <span class="ai-anomaly-flags-panel__badge">{{ t('ai.suggestedLabel') }}</span>
        <p>
          {{ flag.ai_output?.metric }}: {{ flag.ai_output?.value }}
          ({{ t('ai.anomalyBaselineMean') }} {{ Number(flag.ai_output?.baseline_mean).toFixed(2) }},
          z={{ Number(flag.ai_output?.z_score).toFixed(2) }})
        </p>
        <small>{{ flag.country_code }} — {{ flag.created_at }}</small>
      </div>
      <button type="button" class="ai-anomaly-flags-panel__dismiss" @click="dismiss(flag)">
        {{ t('ai.dismiss') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ai-anomaly-flags-panel { display: flex; flex-direction: column; gap: 12px; }
.ai-anomaly-flags-panel__hint { font-size: .82rem; color: var(--color-text-muted, #94a3b8); margin: 0; }
.ai-anomaly-flags-panel__row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  border: 1px dashed #8a7dfa; border-radius: 8px; padding: 10px 14px; background: rgba(138,125,250,.08);
}
.ai-anomaly-flags-panel__badge { font-size: .7rem; font-weight: 600; color: #6a5cf0; margin-left: 8px; }
.ai-anomaly-flags-panel__dismiss {
  padding: 6px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.2);
  background: rgba(255,255,255,.06); color: #cbd5e1; cursor: pointer; font-size: .78rem;
}
</style>
