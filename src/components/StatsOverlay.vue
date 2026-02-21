<script setup>
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const disasterStore = useDisasterStore()
const uiStore = useUIStore()

const statCards = [
  {
    key: 'earthquake',
    icon: '🔴',
    label: 'stats.activeEarthquakes',
    colorClass: 'stat-earthquake',
  },
  {
    key: 'wildfire',
    icon: '🔥',
    label: 'stats.activeWildfires',
    colorClass: 'stat-wildfire',
  },
  {
    key: 'flood',
    icon: '🌊',
    label: 'stats.activeFloods',
    colorClass: 'stat-flood',
  },
  {
    key: 'drought',
    icon: '☀️',
    label: 'stats.activeDroughts',
    colorClass: 'stat-drought',
  },
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

/* Tablet Layout (Avoid Sidebar Overlap) */
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

/* Mobile Layout (2x2 Grid at the top) */
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

  /* This is the class applied when sidebar is open */
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

  .counter-label {
    font-size: 0.6rem;
    text-align: center;
  }

  .stat-data {
    align-items: center;
  }
}
</style>
