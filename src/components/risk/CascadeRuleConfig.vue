<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const auth = useAuthStore()

const rules = ref([])
const loading = ref(false)
const saving = ref(false)
const error = ref(null)

const countryCode = ref(auth.session?.countryCode ?? '')

// spec 049 US2: the opt-in "second alarm system" toggle and unacknowledged
// count are visible ONLY to country_admin/super_admin — org_admin/viewer
// must not see them at all (FR-004), unlike the rule list above which
// every canAdmin role can see (matching cascade_rules' own 3-tier RLS).
const canManageAutoEvaluate = computed(() => auth.isSuperAdmin || auth.session?.role === 'country_admin')
const autoEvaluateEnabled = ref(false)
const autoEvaluateSaving = ref(false)
const unacknowledged = ref([])

async function loadAutoEvaluateSetting() {
  if (!canManageAutoEvaluate.value || !countryCode.value) return
  const { data } = await supabase
    .from('country_cascade_settings')
    .select('auto_evaluate_enabled')
    .eq('country_code', countryCode.value.toLowerCase())
    .maybeSingle()
  autoEvaluateEnabled.value = data?.auto_evaluate_enabled ?? false
}

async function toggleAutoEvaluate() {
  if (!countryCode.value) return
  autoEvaluateSaving.value = true
  const next = !autoEvaluateEnabled.value
  const { error: err } = await supabase.rpc('save_country_cascade_setting', {
    p_country_code: countryCode.value.toLowerCase(),
    p_enabled: next,
  })
  if (!err) autoEvaluateEnabled.value = next
  autoEvaluateSaving.value = false
}

async function loadUnacknowledged() {
  if (!canManageAutoEvaluate.value) return
  // secondary_risk_category has no column of its own on this table — it
  // lives inside rule_config_snapshot (data-model.md §2), same as every
  // other rule-authored field on a historical assessment row.
  const { data } = await supabase
    .from('cascading_risk_assessments')
    .select('id, rule_config_snapshot, admin_boundary_code, recommendation_text, computed_at')
    .eq('triggered_automatically', true)
    .is('acknowledged_at', null)
    .order('computed_at', { ascending: false })
  unacknowledged.value = data || []
}

async function acknowledgeAssessment(id) {
  await supabase.rpc('acknowledge_cascade_assessment', { p_assessment_id: id })
  await loadUnacknowledged()
}

const emptyForm = () => ({
  id: null,
  triggerHazardType: '',
  minMagnitude: '',
  proximityExposureSourceName: '',
  proximityDistanceKm: '',
  minVulnerabilityScore: '',
  secondaryRiskCategory: '',
  recommendationTemplate: '',
  isActive: true,
})
const form = ref(emptyForm())

async function loadRules() {
  loading.value = true
  const { data, error: err } = await supabase
    .from('cascade_rules')
    .select('*')
    .order('created_at', { ascending: false })
  if (!err) rules.value = data || []
  loading.value = false
}

// FR-001: at least one of the three condition groups must be set — this is a
// client-side preview only, save_cascade_rule's rejection is the actual
// authority (matches RiskIndicatorConfig.vue's weight-sum preview pattern).
function hasAnyCondition() {
  return (
    form.value.minMagnitude !== '' ||
    (form.value.proximityExposureSourceName !== '' && form.value.proximityDistanceKm !== '') ||
    form.value.minVulnerabilityScore !== ''
  )
}

async function saveRule() {
  if (!countryCode.value || !form.value.triggerHazardType || !form.value.secondaryRiskCategory || !form.value.recommendationTemplate.trim()) return
  if (!hasAnyCondition()) {
    error.value = t('risk.cascadeRules.errors.noCondition')
    return
  }
  saving.value = true
  error.value = null
  const { error: err } = await supabase.rpc('save_cascade_rule', {
    p_id: form.value.id,
    p_country_code: countryCode.value.toLowerCase(),
    p_trigger_hazard_type: form.value.triggerHazardType,
    p_min_magnitude: form.value.minMagnitude === '' ? null : Number(form.value.minMagnitude),
    p_proximity_exposure_source_name: form.value.proximityExposureSourceName || null,
    p_proximity_distance_km: form.value.proximityDistanceKm === '' ? null : Number(form.value.proximityDistanceKm),
    p_min_vulnerability_score: form.value.minVulnerabilityScore === '' ? null : Number(form.value.minVulnerabilityScore),
    p_secondary_risk_category: form.value.secondaryRiskCategory,
    p_recommendation_template: form.value.recommendationTemplate,
    p_is_active: form.value.isActive,
  })
  if (err) {
    // Surfaces save_cascade_rule's specific validation message (missing
    // condition, unpaired proximity fields) rather than a generic error.
    error.value = err.message
  } else {
    form.value = emptyForm()
    await loadRules()
  }
  saving.value = false
}

function editRule(rule) {
  form.value = {
    id: rule.id,
    triggerHazardType: rule.trigger_hazard_type,
    minMagnitude: rule.min_magnitude ?? '',
    proximityExposureSourceName: rule.proximity_exposure_source_name ?? '',
    proximityDistanceKm: rule.proximity_distance_km ?? '',
    minVulnerabilityScore: rule.min_vulnerability_score ?? '',
    secondaryRiskCategory: rule.secondary_risk_category,
    recommendationTemplate: rule.recommendation_template,
    isActive: rule.is_active,
  }
}

async function deleteRule(rule) {
  // Past cascading_risk_assessments rows are unaffected (FR-010): their
  // rule_config_snapshot already carries the full rule as it was, and
  // cascade_rule_id is ON DELETE SET NULL, not a cascading delete.
  const { error: err } = await supabase.from('cascade_rules').delete().eq('id', rule.id)
  if (err) {
    error.value = err.message
  } else {
    await loadRules()
  }
}

onMounted(() => {
  loadRules()
  loadAutoEvaluateSetting()
  loadUnacknowledged()
})
</script>

<template>
  <div class="cascade-rule-config">
    <!-- ── Opt-in automatic evaluation (spec 049 US2) — country_admin/
         super_admin only, never org_admin/viewer (FR-004) ──────────────── -->
    <div v-if="canManageAutoEvaluate" class="risk-form risk-auto-evaluate">
      <h4>{{ t('risk.cascadeAuto.title') }}</h4>
      <p class="risk-intro">{{ t('risk.cascadeAuto.intro') }}</p>
      <label class="risk-checkbox-row">
        <input type="checkbox" :checked="autoEvaluateEnabled" :disabled="autoEvaluateSaving" @change="toggleAutoEvaluate" />
        <span>{{ t('risk.cascadeAuto.toggleLabel') }}</span>
      </label>

      <div v-if="unacknowledged.length > 0" class="risk-unacknowledged">
        <h5>{{ t('risk.cascadeAuto.unacknowledgedTitle', { count: unacknowledged.length }) }}</h5>
        <div v-for="a in unacknowledged" :key="a.id" class="risk-row risk-row-block">
          <strong>{{ a.admin_boundary_code }} — {{ a.rule_config_snapshot?.secondary_risk_category }}</strong>
          <p class="risk-recommendation">{{ a.recommendation_text }}</p>
          <button class="btn-reload" @click="acknowledgeAssessment(a.id)">{{ t('risk.cascadeAuto.acknowledge') }}</button>
        </div>
      </div>
      <p v-else class="risk-meta">{{ t('risk.cascadeAuto.noUnacknowledged') }}</p>
    </div>

    <div class="risk-form">
      <h4>{{ t('risk.cascadeRules.formTitle') }}</h4>
      <p class="risk-intro">{{ t('risk.cascadeRules.intro') }}</p>

      <label class="risk-field">
        <span>{{ t('risk.cascadeRules.countryCode') }}</span>
        <input v-model="countryCode" :placeholder="t('risk.dashboard.countryCodePlaceholder')" maxlength="2" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.cascadeRules.triggerHazardType') }}</span>
        <input v-model="form.triggerHazardType" :placeholder="t('risk.cascadeRules.triggerHazardTypePlaceholder')" />
        <span class="risk-hint">{{ t('risk.cascadeRules.triggerHazardTypeHint') }}</span>
      </label>

      <fieldset class="risk-condition-group">
        <legend>{{ t('risk.cascadeRules.conditionsLegend') }}</legend>
        <label class="risk-field">
          <span>{{ t('risk.cascadeRules.minMagnitude') }}</span>
          <input v-model="form.minMagnitude" type="number" step="0.1" :placeholder="t('risk.cascadeRules.minMagnitudePlaceholder')" />
        </label>
        <label class="risk-field">
          <span>{{ t('risk.cascadeRules.proximitySourceName') }}</span>
          <input v-model="form.proximityExposureSourceName" :placeholder="t('risk.cascadeRules.proximitySourceNamePlaceholder')" />
        </label>
        <label class="risk-field">
          <span>{{ t('risk.cascadeRules.proximityDistanceKm') }}</span>
          <input v-model="form.proximityDistanceKm" type="number" step="0.1" min="0" :placeholder="t('risk.cascadeRules.proximityDistanceKmPlaceholder')" />
        </label>
        <label class="risk-field">
          <span>{{ t('risk.cascadeRules.minVulnerabilityScore') }}</span>
          <input v-model="form.minVulnerabilityScore" type="number" step="0.1" min="0" max="10" :placeholder="t('risk.cascadeRules.minVulnerabilityScorePlaceholder')" />
          <span class="risk-hint">{{ t('risk.cascadeRules.minVulnerabilityScoreHint') }}</span>
        </label>
      </fieldset>

      <label class="risk-field">
        <span>{{ t('risk.cascadeRules.secondaryRiskCategory') }}</span>
        <input v-model="form.secondaryRiskCategory" :placeholder="t('risk.cascadeRules.secondaryRiskCategoryPlaceholder')" />
      </label>
      <label class="risk-field">
        <span>{{ t('risk.cascadeRules.recommendationTemplate') }}</span>
        <textarea v-model="form.recommendationTemplate" rows="3" :placeholder="t('risk.cascadeRules.recommendationTemplatePlaceholder')"></textarea>
        <span class="risk-hint">{{ t('risk.cascadeRules.recommendationTemplateHint') }}</span>
      </label>
      <label class="risk-checkbox-row">
        <input type="checkbox" v-model="form.isActive" />
        <span>{{ t('risk.cascadeRules.isActive') }}</span>
      </label>

      <p v-if="error" class="risk-error">{{ error }}</p>
      <div class="risk-form-actions">
        <button class="btn-save" :disabled="saving" @click="saveRule">
          {{ saving ? t('risk.cascadeRules.saving') : t('risk.cascadeRules.save') }}
        </button>
        <button v-if="form.id" class="btn-reload" @click="form = emptyForm()">{{ t('risk.cascadeRules.cancelEdit') }}</button>
      </div>
    </div>

    <div class="risk-list">
      <h4>{{ t('risk.cascadeRules.listTitle') }}</h4>
      <div v-if="loading" class="tab-loading">{{ t('impact.loading') }}</div>
      <div v-else-if="rules.length === 0" class="tab-empty">{{ t('risk.cascadeRules.empty') }}</div>
      <div v-else v-for="r in rules" :key="r.id" class="risk-row">
        <div>
          <strong>{{ r.trigger_hazard_type }} → {{ r.secondary_risk_category }}</strong>
          <span class="risk-meta">{{ r.country_code?.toUpperCase() }}<template v-if="!r.is_active"> · {{ t('risk.cascadeRules.inactive') }}</template></span>
        </div>
        <div class="risk-row-actions">
          <button class="btn-reload" @click="editRule(r)">{{ t('risk.cascadeRules.edit') }}</button>
          <button class="btn-delete" @click="deleteRule(r)">{{ t('risk.cascadeRules.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cascade-rule-config { display: flex; flex-direction: column; gap: 20px; }
.risk-form, .risk-list {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.risk-form h4, .risk-list h4 { margin: 0 0 12px; font-size: .95rem; }
.risk-intro { font-size: .8rem; color: var(--color-text-muted, #94a3b8); margin: 0 0 14px; line-height: 1.4; }
.risk-field { display: flex; flex-direction: column; gap: 4px; font-size: .78rem; color: var(--color-text-muted, #94a3b8); margin-bottom: 10px; }
.risk-field input, .risk-field textarea {
  background: #1e2330; border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
  padding: 6px 10px; color: #e2e8f0; font-size: .82rem; font-family: inherit;
}
.risk-hint { font-size: .72rem; color: var(--color-text-muted, #94a3b8); opacity: .8; line-height: 1.35; }
.risk-condition-group { border: 1px dashed rgba(255,255,255,.15); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; }
.risk-condition-group legend { font-size: .75rem; color: var(--color-text-muted, #94a3b8); padding: 0 4px; }
.risk-checkbox-row { display: flex; align-items: center; gap: 8px; padding: 4px 0 10px; font-size: .82rem; color: #e2e8f0; }
.risk-checkbox-row input { width: auto; }
.risk-error { color: #ef4444; font-size: .8rem; }
.risk-form-actions { display: flex; gap: 8px; }
.btn-save {
  padding: 8px 18px; background: rgba(34,197,94,.2); border: 1px solid rgba(34,197,94,.4);
  border-radius: 8px; color: #22c55e; font-weight: 600; cursor: pointer;
}
.btn-save:disabled { opacity: .5; cursor: not-allowed; }
.risk-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,.06); font-size: .85rem;
}
.risk-row-actions { display: flex; gap: 6px; }
.risk-meta { margin-left: 10px; color: var(--color-text-muted, #94a3b8); font-size: .75rem; }
.btn-reload {
  padding: 4px 12px; background: rgba(59,130,246,.15); border: 1px solid rgba(59,130,246,.35);
  border-radius: 6px; color: #3b82f6; font-size: .75rem; cursor: pointer;
}
.btn-delete {
  padding: 4px 12px; background: rgba(239,68,68,.15); border: 1px solid rgba(239,68,68,.35);
  border-radius: 6px; color: #ef4444; font-size: .75rem; cursor: pointer;
}
.risk-auto-evaluate h5 { margin: 14px 0 8px; font-size: .82rem; }
.risk-unacknowledged { margin-top: 10px; }
.risk-row-block { flex-direction: column; align-items: flex-start; gap: 4px; }
.risk-recommendation { font-size: .82rem; margin: 2px 0; }
</style>
