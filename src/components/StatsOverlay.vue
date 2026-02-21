<script setup>
import { useDisasterStore } from '@/stores/disaster.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const disasterStore = useDisasterStore()

const statCards = [
  {
    key: 'earthquake',
    icon: '🔴',
    label: 'stats.activeEarthquakes',
    colorClass: 'stat-earthquake',
  },
  { key: 'wildfire', icon: '🔥', label: 'stats.activeWildfires', colorClass: 'stat-wildfire' },
  { key: 'flood', icon: '🌊', label: 'stats.activeFloods', colorClass: 'stat-flood' },
  { key: 'drought', icon: '☀️', label: 'stats.activeDroughts', colorClass: 'stat-drought' },
]
</script>

<template>
  <div class="stats-overlay">
    <div
      v-for="stat in statCards"
      :key="stat.key"
      class="stat-card glass-panel"
      :class="stat.colorClass"
    >
      <span class="stat-icon">{{ stat.icon }}</span>
      <div class="stat-data">
        <span class="counter-value">{{ disasterStore.totalCount[stat.key] }}</span>
        <span class="counter-label">{{ t(stat.label) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-overlay {
  position: fixed;
  top: var(--space-md);
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--z-stats);
  display: flex;
  gap: var(--space-sm);
  pointer-events: none;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  pointer-events: all;
  min-width: 100px;
}

.stat-icon {
  font-size: 1.2rem;
}

.stat-data {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.stat-earthquake .counter-value {
  color: var(--color-earthquake);
}
.stat-wildfire .counter-value {
  color: var(--color-wildfire);
}
.stat-flood .counter-value {
  color: var(--color-flood);
}
.stat-drought .counter-value {
  color: var(--color-drought);
}

@media (max-width: 768px) {
  .stats-overlay {
    top: auto;
    bottom: var(--space-md);
    left: var(--space-sm);
    right: var(--space-sm);
    transform: none;
    flex-wrap: wrap;
    justify-content: center;
  }

  .stat-card {
    padding: 6px 10px;
    min-width: auto;
  }

  .counter-value {
    font-size: 1rem;
  }

  .counter-label {
    font-size: 0.55rem;
  }
}
</style>
