<script setup>
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useHazardTypesStore, getChildren } from '@/stores/hazardTypes.js'

const { t } = useI18n()
const store = useHazardTypesStore()

onMounted(() => {
  if (!store.loaded) store.fetchHazardTypes()
})

// FR-006/FR-009: read-only, active-only — reuses the app-wide cache already
// populated at boot (SC-004), no new fetch here.
const entries = computed(() =>
  store.hazardTypes
    .filter((h) => h.is_active)
    .map((h) => ({
      ...h,
      parent: store.hazardTypes.find((p) => p.code === h.parent_code) ?? null,
      children: getChildren(store.hazardTypes, h.code).filter((c) => c.is_active),
      thresholds: store.thresholds[h.code] ?? null,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name)),
)
</script>

<template>
  <div class="hazard-encyclopedia">
    <div v-if="store.loading" class="tab-loading">...</div>
    <div v-else-if="!entries.length" class="tab-empty">{{ t('hazardTaxonomy.empty') }}</div>

    <div v-else class="encyclopedia-grid">
      <article v-for="h in entries" :key="h.code" class="hazard-card">
        <h4>{{ h.display_name }}</h4>
        <span class="hazard-category">{{ h.category }}</span>
        <p v-if="h.description" class="hazard-description">{{ h.description }}</p>

        <p v-if="h.parent" class="hazard-relation">
          {{ t('hazardTaxonomy.hierarchy.partOf', { name: h.parent.display_name }) }}
        </p>
        <p v-if="h.children.length" class="hazard-relation">
          {{ t('hazardTaxonomy.hierarchy.includes', { names: h.children.map((c) => c.display_name).join(', ') }) }}
        </p>

        <div v-if="h.thresholds?.breakpoints?.length" class="hazard-thresholds">
          <h5>{{ t('hazardTaxonomy.hierarchy.thresholdsTitle') }}</h5>
          <ul>
            <li v-for="bp in h.thresholds.breakpoints" :key="bp.severity">
              {{ bp.severity }} — {{ h.thresholds.metric_name }} ≥ {{ bp.min_value }}{{ h.thresholds.unit ? ' ' + h.thresholds.unit : '' }}
            </li>
          </ul>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.hazard-encyclopedia { padding: 4px 0; }
.tab-loading, .tab-empty { font-size: .82rem; color: var(--color-text-muted,#94a3b8); }
.encyclopedia-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.hazard-card {
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.1);
  border-radius: 12px; padding: 16px;
}
.hazard-card h4 { margin: 0 0 4px; color: #e2e8f0; }
.hazard-category { font-size: .72rem; text-transform: uppercase; color: var(--color-text-muted,#94a3b8); }
.hazard-description { font-size: .82rem; color: #cbd5e1; margin: 10px 0; }
.hazard-relation { font-size: .78rem; color: var(--color-text-muted,#94a3b8); margin: 4px 0; }
.hazard-thresholds { margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,.06); }
.hazard-thresholds h5 { margin: 0 0 6px; font-size: .75rem; color: var(--color-text-muted,#94a3b8); }
.hazard-thresholds ul { margin: 0; padding-left: 18px; font-size: .78rem; color: #cbd5e1; }
</style>
