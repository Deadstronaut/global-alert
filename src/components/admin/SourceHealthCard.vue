<script setup>
import { computed } from 'vue'

const props = defineProps({
  source: { type: Object, required: true },
  canManage: { type: Boolean, default: false },
  // Feature 002-source-scoping: only relevant when the viewer (super_admin) can see
  // local sources from more than one country and needs to tell them apart.
  showCountryBadge: { type: Boolean, default: false },
})

defineEmits(['edit', 'toggle-active', 'delete', 'view-audit'])

const STATE_META = {
  healthy:  { label: 'Sağlıklı', color: '#22c55e', dot: '●' },
  degraded: { label: 'Bozulmuş', color: '#fbbf24', dot: '▲' },
  down:     { label: 'Çalışmıyor', color: '#ef4444', dot: '✕' },
  disabled: { label: 'Devre Dışı', color: '#94a3b8', dot: '○' },
}

const stateMeta = computed(() => STATE_META[props.source.health_state] ?? STATE_META.disabled)
const isWarning = computed(() => ['degraded', 'down'].includes(props.source.health_state))

function relativeTime(iso) {
  if (!iso) return 'Henüz yok'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'az önce'
  if (mins < 60) return `${mins} dk önce`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} sa önce`
  return `${Math.round(hours / 24)} gün önce`
}
</script>

<template>
  <div class="source-card" :class="{ 'source-card--warning': isWarning }">
    <div class="source-card-top">
      <span class="source-state" :style="{ color: stateMeta.color }">
        {{ stateMeta.dot }} {{ stateMeta.label }}
      </span>
      <span class="source-hazard-type">{{ source.hazard_type }}</span>
    </div>
    <div class="source-name">
      {{ source.name }}
      <span v-if="showCountryBadge && source.country_code" class="source-country-badge">
        {{ source.country_code }}
      </span>
    </div>
    <div class="source-meta">
      <span>Son başarı: {{ relativeTime(source.last_success_at) }}</span>
      <span v-if="source.consecutive_failures > 0" class="source-failures">
        {{ source.consecutive_failures }} ardışık hata
      </span>
    </div>
    <div v-if="canManage" class="source-actions">
      <button class="btn-edit" @click="$emit('edit', source)">✏️ Düzenle</button>
      <button class="btn-toggle" @click="$emit('toggle-active', source)">
        {{ source.is_active ? '⏸ Devre Dışı Bırak' : '▶ Etkinleştir' }}
      </button>
      <button class="btn-audit" @click="$emit('view-audit', source)">📜 Geçmiş</button>
      <button class="btn-delete" @click="$emit('delete', source)">🗑</button>
    </div>
  </div>
</template>

<style scoped>
.source-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.source-card--warning {
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(251, 191, 36, 0.04);
}
.source-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}
.source-state { font-weight: 700; }
.source-hazard-type {
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 4px;
  color: var(--color-text-muted, #94a3b8);
}
.source-name { font-size: 0.95rem; font-weight: 700; }
.source-country-badge {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-text-muted, #94a3b8);
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 4px;
  vertical-align: middle;
}
.source-meta {
  display: flex;
  gap: 10px;
  font-size: 0.75rem;
  color: var(--color-text-muted, #94a3b8);
}
.source-failures { color: #f87171; }
.source-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.source-actions button {
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary, #e2e8f0);
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s;
}
.source-actions button:hover { background: rgba(255, 255, 255, 0.12); }
.btn-delete:hover { background: rgba(239, 68, 68, 0.2); }
</style>
