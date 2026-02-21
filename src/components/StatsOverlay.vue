<script setup>
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()

const statCards = [
  { key: 'earthquake', icon: '⛰️', colorClass: 'stat-earthquake' },
  { key: 'wildfire', icon: '🔥', colorClass: 'stat-wildfire' },
  { key: 'flood', icon: '🌊', colorClass: 'stat-flood' },
  { key: 'drought', icon: '🔴', colorClass: 'stat-drought' },
]
</script>

<template>
  <div
    class="stats-overlay"
    :class="{
      'stats-shifted-down': uiStore.sidebarCollapsed,
      'stats-mobile-shifted': uiStore.sidebarOpen,
      'hidden-on-mobile': uiStore.sidebarOpen,
    }"
  >
    <div
      v-for="stat in statCards"
      :key="stat.key"
      class="stat-card glass-panel"
      :class="stat.colorClass"
    >
      <span class="stat-icon">{{ stat.icon }}</span>
      <div class="stat-data">
        <span class="counter-value">{{ disasterStore.totalCount[stat.key] }}</span>
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
  width: max-content;
  max-width: 95vw;
  transition:
    top 0.35s ease,
    transform 0.35s ease,
    opacity 0.25s ease;
}

.stats-overlay.stats-shifted-down {
  top: calc(var(--space-md) + 16px);
}

.stat-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  pointer-events: all;
  min-width: 90px;
  justify-content: center;
}

.stat-icon {
  font-size: 1.2rem;
}

.stat-data {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.counter-value {
  font-weight: 700;
  color: var(--color-text-primary);
}

@media (max-width: 1150px) {
  .stats-overlay {
    left: auto;
    right: var(--space-md);
    transform: none;
    flex-wrap: wrap;
    justify-content: flex-end;
    width: calc(100vw - var(--sidebar-width) - 40px);
  }
  .stat-card {
    padding: 8px 12px;
    min-width: unset;
  }
}

@media (max-width: 768px) {
  .stats-overlay {
    top: var(--space-sm);
    left: var(--space-sm);
    right: var(--space-sm);
    bottom: auto;
    width: calc(100vw - var(--space-sm) * 2);
    transform: none;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    transition:
      top 0.35s ease,
      transform 0.35s ease,
      opacity 0.25s ease;
  }

  .stats-overlay.stats-mobile-shifted {
    top: calc(var(--space-sm) + 8px);
  }

  .stats-overlay.hidden-on-mobile {
    display: none !important;
  }

  .stat-card {
    padding: 6px 8px;
    flex: 1 1 calc(50% - 8px);
    justify-content: center;
    min-width: 120px;
  }

  .counter-value {
    font-size: 1.05rem;
  }

  .stat-data {
    align-items: center;
  }
}
</style>
