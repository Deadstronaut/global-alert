<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()

const events = ref([])
const loading = ref(false)
const error = ref(null)

async function loadEvents() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('audit_log')
    .select('*')
    .eq('event_category', 'security_event')
    .order('created_at', { ascending: false })
    .limit(100)
  if (err) error.value = err.message
  else events.value = data || []
  loading.value = false
}

onMounted(loadEvents)
</script>

<template>
  <div class="security-events-panel">
    <h4>{{ t('audit.securityEvents.title') }}</h4>

    <div v-if="error" class="form-error">{{ error }}</div>
    <div v-if="loading" class="tab-loading">...</div>

    <table v-else class="security-events-table">
      <thead>
        <tr>
          <th>{{ t('audit.securityEvents.action') }}</th>
          <th>{{ t('audit.securityEvents.table') }}</th>
          <th>{{ t('audit.securityEvents.recordId') }}</th>
          <th>{{ t('audit.securityEvents.time') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="e in events" :key="e.id">
          <td>{{ e.action }}</td>
          <td>{{ e.table_name }}</td>
          <td>{{ e.record_id }}</td>
          <td>{{ new Date(e.created_at).toLocaleString() }}</td>
        </tr>
        <tr v-if="!events.length"><td colspan="4" class="empty-row">{{ t('audit.securityEvents.empty') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.security-events-panel { padding: 4px 0; }
.security-events-panel h4 { margin: 0 0 12px; color: #e2e8f0; }
.security-events-table { width: 100%; border-collapse: collapse; font-size: .82rem; }
.security-events-table th { text-align: left; color: var(--color-text-muted,#94a3b8); padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.1); }
.security-events-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,.05); color: #e2e8f0; }
.empty-row { text-align: center; color: var(--color-text-muted,#94a3b8); padding: 20px; }
.form-error { color: #ef4444; font-size: .8rem; margin-bottom: 10px; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
</style>
