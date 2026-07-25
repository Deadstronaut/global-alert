<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { computeDisplayState } from '@/utils/sourceDisplayState.js'

const props = defineProps({
  source: { type: Object, required: true },
  canManage: { type: Boolean, default: false },
  // Feature 002-source-scoping: only relevant when the viewer (super_admin) can see
  // local sources from more than one country and needs to tell them apart.
  showCountryBadge: { type: Boolean, default: false },
})

defineEmits(['edit', 'toggle-active', 'delete', 'view-audit', 'trigger-now'])

// The manual_trigger_requested_at signal (20260725190000_manual_source_trigger.sql)
// is only ever picked up by dynamicSources.js's generic/custom-source loop —
// it requires endpoint_config.field_map (isGenericSource() there). A Docker-
// importer-family source marked automation_kind='manual' (e.g. Meta/HDX
// Population — "run the raster-importer container by hand") has no field_map
// and nothing anywhere would ever notice this timestamp for it, so the button
// must not offer a false promise there.
const canTriggerManually = computed(
  () => props.source.automation_kind === 'manual' && !!props.source.endpoint_config?.field_map?.id,
)

const STATE_META = {
  healthy:  { label: 'Sağlıklı', color: '#22c55e', dot: '●' },
  degraded: { label: 'Bozulmuş', color: '#fbbf24', dot: '▲' },
  down:     { label: 'Çalışmıyor', color: '#ef4444', dot: '✕' },
  disabled: { label: 'Devre Dışı', color: '#94a3b8', dot: '○' },
  offline:  { label: 'Çevrimdışı', color: '#ef4444', dot: '✕' },
  // Softer than 'offline': used for scheduled/manual sources whose staleness
  // is expected between runs, not an incident — see isStale's automation_kind
  // branch below. Amber like 'degraded', not red: worth a glance, not urgent.
  overdue:  { label: 'Gecikmiş', color: '#fbbf24', dot: '◐' },
  // Never fetched even once (last_success_at is null) — distinct from
  // 'offline' (used to run successfully, then went quiet). A source that
  // simply hasn't been triggered yet (e.g. the aggregator container isn't
  // running locally, or it's a slow-cron source that hasn't hit its first
  // interval) is not the same signal as one that broke, and showing both as
  // red "Çevrimdışı" reads as "this is failing" when it may just be new.
  pending:  { label: 'Henüz Çalıştırılmadı', color: '#64748b', dot: '○' },
}

// automation_kind (20260725180000_data_sources_automation_kind.sql) — WHICH
// of three genuinely different automation models a source runs under.
// Surfaced as an icon so staleness reads correctly per kind: a 'continuous'
// source going quiet is an incident (⚡ + red), a 'scheduled' one going quiet
// between its own daily/weekly/monthly cycles is normal (🕐 + amber, never
// red), and a 'manual' source has no "supposed to have run by now" at all
// (🖖 — Vulcan salute doubles as this project's own "hands-off, someone
// runs this by hand" mark, per live discussion 2026-07-25).
const AUTOMATION_META = {
  continuous: { icon: '⚡', label: 'Canlı / sürekli çalışıyor' },
  scheduled:  { icon: '🕐', label: 'Zamanlanmış (cron)' },
  manual:     { icon: '🖖', label: 'Elle yükleniyor (otomatik tetikleyici yok)' },
}
const automationMeta = computed(
  () => AUTOMATION_META[props.source.automation_kind] ?? AUTOMATION_META.scheduled,
)

// health_state is only ever updated by the aggregator when it actually attempts
// a fetch (server/src/processors/sourceHealth.js) — if that process isn't running
// at all, nothing ever flips it, so a stale 'healthy' from its last run sits in
// the DB forever. `now` re-evaluates on an interval so this card independently
// notices "no success reported in longer than expected" even with the
// aggregator fully down, instead of trusting the frozen DB value. See computeDisplayState().
const now = ref(Date.now())
let nowTimer
onMounted(() => { nowTimer = setInterval(() => { now.value = Date.now() }, 30000) })
onUnmounted(() => clearInterval(nowTimer))

// computeDisplayState is shared with sourceScope.js's "Duruma Göre" sort —
// found live 2026-07-25 that sorting by the raw DB health_state produced a
// visibly wrong order (most rows sit at a stale 'healthy' in the DB even
// when their badge shows Gecikmiş/Çevrimdışı/Henüz Çalıştırılmadı on
// screen); both places now derive the SAME displayed state from the same
// function so the sort always matches what the badge actually shows.
const stateMeta = computed(() => STATE_META[computeDisplayState(props.source, now.value)] ?? STATE_META.disabled)

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
  <div
    class="source-card"
    :style="{ borderColor: stateMeta.color + '66', background: stateMeta.color + '0a' }"
  >
    <div class="source-card-top">
      <span class="source-state-group">
        <span class="source-state" :style="{ color: stateMeta.color }">
          {{ stateMeta.dot }} {{ stateMeta.label }}
        </span>
        <span class="source-automation-icon" :title="automationMeta.label">{{ automationMeta.icon }}</span>
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
      <button v-if="canTriggerManually" class="btn-trigger" @click="$emit('trigger-now', source)">
        🔁 Şimdi Çalıştır
      </button>
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
.source-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.72rem;
}
.source-state-group { display: flex; align-items: center; gap: 5px; }
.source-state { font-weight: 700; }
.source-automation-icon { font-size: 0.85rem; cursor: default; }
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
/* 2-column grid instead of flex-wrap — with a long label like "Devre Dışı
   Bırak" alongside short ones like the icon-only delete button, flex-wrap
   produced ragged, inconsistent rows (2026-07-25 feedback: "dağınık ve
   responsive değil"). A fixed 2-up grid keeps every button the same width
   regardless of its label length or how many buttons this card has
   (4 normally, 5 when 🔁 Şimdi Çalıştır is also shown). */
.source-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}
.source-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary, #e2e8f0);
  font-size: 0.72rem;
  line-height: 1.25;
  text-align: center;
  cursor: pointer;
  transition: background 0.15s;
}
.source-actions button:hover { background: rgba(255, 255, 255, 0.12); }
.btn-delete:hover { background: rgba(239, 68, 68, 0.2); }
.btn-trigger:hover { background: rgba(34, 197, 94, 0.2); }
</style>
