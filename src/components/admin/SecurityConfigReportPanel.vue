<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'
import { rowsToCsv, rowsToJson, triggerDownload } from '@/lib/auditExport.js'

const { t } = useI18n()

const report = ref(null)
const loading = ref(false)
const error = ref(null)

async function loadReport() {
  loading.value = true
  error.value = null
  const { data, error: err } = await supabase.rpc('get_security_config_report')
  if (err) error.value = err.message
  else report.value = data
  loading.value = false
}

function exportReport(format) {
  if (!report.value) return
  const stamp = Date.now()
  if (format === 'csv') {
    triggerDownload(rowsToCsv([report.value]), `security-config-report-${stamp}.csv`, 'text/csv')
  } else {
    triggerDownload(rowsToJson(report.value), `security-config-report-${stamp}.json`, 'application/json')
  }
}

onMounted(loadReport)
</script>

<template>
  <div class="security-config-report-panel">
    <h4>{{ t('audit.securityConfig.title') }}</h4>

    <div v-if="error" class="form-error">{{ error }}</div>
    <div v-if="loading" class="tab-loading">...</div>

    <div v-else-if="report" class="security-config-body">
      <div class="security-config-section">
        <h5>{{ t('audit.securityConfig.mfaPolicy') }}</h5>
        <ul>
          <li v-for="p in report.mfa_role_policy" :key="p.role">
            {{ p.role }} — {{ p.required ? t('audit.securityConfig.required') : t('audit.securityConfig.notRequired') }}
          </li>
        </ul>
      </div>
      <div class="security-config-section">
        <h5>{{ t('audit.securityConfig.retentionPolicies') }}</h5>
        <ul>
          <li v-for="p in report.retention_policies" :key="p.category">
            {{ p.category }} — {{ p.retention_days }} {{ t('audit.securityConfig.days') }} ({{ p.action }})
          </li>
          <li v-if="!report.retention_policies.length" class="empty-row">{{ t('audit.securityConfig.noPolicies') }}</li>
        </ul>
      </div>
      <div class="security-config-section">
        <h5>{{ t('audit.securityConfig.capabilityGrants') }}</h5>
        <ul>
          <li v-for="(count, cap) in report.capability_grant_counts" :key="cap">{{ cap }} — {{ count }}</li>
        </ul>
      </div>
      <div class="security-config-export-row">
        <button class="btn-export" @click="exportReport('csv')">{{ t('audit.securityConfig.exportCsv') }}</button>
        <button class="btn-export" @click="exportReport('json')">{{ t('audit.securityConfig.exportJson') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.security-config-report-panel { padding: 4px 0; }
.security-config-report-panel h4 { margin: 0 0 12px; color: #e2e8f0; }
.security-config-section { margin-bottom: 14px; }
.security-config-section h5 { margin: 0 0 8px; font-size: .82rem; color: #e2e8f0; }
.security-config-section ul { list-style: none; padding: 0; margin: 0; font-size: .8rem; color: #e2e8f0; display: flex; flex-direction: column; gap: 4px; }
.empty-row { color: var(--color-text-muted,#94a3b8); }
.security-config-export-row { display: flex; gap: 6px; }
.btn-export {
  padding: 6px 14px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.15);
  border-radius: 6px; color: #e2e8f0; font-size: .78rem; cursor: pointer;
}
.form-error { color: #ef4444; font-size: .8rem; margin-bottom: 10px; }
.tab-loading { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
</style>
