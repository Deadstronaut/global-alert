<script setup>
import { computed } from 'vue'
import { useDisasterStore } from '@/stores/disaster.js'
import { useUIStore } from '@/stores/ui.js'

const disasterStore = useDisasterStore()
const uiStore = useUIStore()

const STAT_META = {
  earthquake: { chipClass: 'chip-earthquake' },
  wildfire: { chipClass: 'chip-wildfire' },
  flood: { chipClass: 'chip-flood' },
  drought: { chipClass: 'chip-drought' },
  food_security: { chipClass: 'chip-food-security' },
  tsunami: { chipClass: 'chip-tsunami' },
  cyclone: { chipClass: 'chip-cyclone' },
  volcano: { chipClass: 'chip-volcano' },
  epidemic: { chipClass: 'chip-epidemic' },
}

const statChips = computed(() => {
  return Object.entries(disasterStore.totalCount)
    .filter(([key]) => key !== 'total' && STAT_META[key])
    .map(([key, value]) => ({
      key,
      value,
      ...STAT_META[key],
    }))
})
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
      v-for="stat in statChips"
      :key="stat.key"
      class="stat-chip"
      :class="stat.chipClass"
    >
      <span class="chip-glow" aria-hidden="true"></span>
      <span class="chip-icon" :title="stat.key">
        <svg
          v-if="stat.key === 'earthquake'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 15 9 9l3 4 2-2 6 8H4Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'wildfire'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 3c2 3 1 4 3 6 1-1 2-2 2-4 3 2 5 5 5 9a8 8 0 1 1-16 0c0-3 2-6 4-8 0 2 1 3 2 4 1-2 0-4 0-7Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'flood'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M4 10h16v4H4zM2 16c2 0 2 2 4 2s2-2 4-2 2 2 4 2 2-2 4-2 2 2 4 2v2c-2 0-2-2-4-2s-2 2-4 2-2-2-4-2-2 2-4 2-2-2-4-2-2 2-4 2v-2c2 0 2-2 4-2Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'drought'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M13 2 6 13h5l-2 9 9-13h-5l2-7Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'food_security'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 2c3 2 4 5 4 8s-1 6-4 10c-3-4-4-7-4-10s1-6 4-8Zm6 3c2 2 3 4 3 7-2-1-4-2-5-4 0-1 1-2 2-3ZM6 5c1 1 2 2 2 3-1 2-3 3-5 4 0-3 1-5 3-7Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'tsunami'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M3 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2v2c-2 0-2 2-4 2s-2-2-4-2-2 2-4 2-2-2-4-2-2 2-4 2-2-2-4-2v-2Zm2-7c5 0 9 2 12 6H5z" />
        </svg>
        <svg
          v-else-if="stat.key === 'cyclone'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M12 4a8 8 0 1 1-7.5 10h3a5 5 0 1 0 4.5-7V4Zm0 16a8 8 0 0 1-7.7-6H8a5 5 0 1 0 4-7.8V9a2 2 0 1 1 0 4 2 2 0 0 1 0-4V6a8 8 0 0 1 0 16Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'volcano'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M9 3h2l-1 3h4l-1 3 2 2 5 10H4l5-10 2-8Zm2 8-3 6h8l-3-6-1 2-1-2Z" />
        </svg>
        <svg
          v-else-if="stat.key === 'epidemic'"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M11 2h2v4h-2zM4.9 4.9l1.4-1.4 2.8 2.8-1.4 1.4zM18.7 3.5l1.4 1.4-2.8 2.8-1.4-1.4zM2 11h4v2H2zm16 0h4v2h-4zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-7.1 9.1 1.4-1.4 2.8 2.8-1.4 1.4zm12.9-1.4 1.4 1.4-2.8 2.8-1.4-1.4zM11 18h2v4h-2z" />
        </svg>
      </span>
      <span class="chip-value">{{ stat.value }}</span>
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  pointer-events: none;
  width: min(92vw, 980px);
  transition:
    top 0.35s ease,
    transform 0.35s ease,
    opacity 0.25s ease;
}

.stats-overlay.stats-shifted-down {
  top: calc(var(--space-md) + 16px);
}

.stat-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 8px 16px 8px 10px;
  border-radius: 999px;
  pointer-events: all;
  overflow: hidden;
  border: 1px solid rgba(135, 169, 255, 0.18);
  background:
    linear-gradient(135deg, rgba(20, 30, 52, 0.82), rgba(10, 15, 30, 0.68)),
    rgba(9, 14, 27, 0.44);
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(16px) saturate(140%);
  -webkit-backdrop-filter: blur(16px) saturate(140%);
}

.chip-glow {
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  background: radial-gradient(circle at left center, rgba(255, 255, 255, 0.08), transparent 52%);
  pointer-events: none;
}

.chip-icon,
.chip-value {
  position: relative;
  z-index: 1;
}

.chip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  font-size: 1rem;
  line-height: 1;
}

.chip-icon svg {
  width: 16px;
  height: 16px;
  fill: rgba(255, 255, 255, 0.94);
}

.chip-value {
  font-size: 1rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: rgba(244, 247, 255, 0.96);
  text-shadow: 0 1px 12px rgba(0, 0, 0, 0.24);
}

.chip-earthquake { border-color: rgba(121, 202, 255, 0.28); }
.chip-wildfire { border-color: rgba(255, 144, 79, 0.28); }
.chip-flood { border-color: rgba(94, 165, 255, 0.3); }
.chip-drought { border-color: rgba(255, 112, 140, 0.28); }
.chip-food-security { border-color: rgba(255, 207, 97, 0.28); }
.chip-tsunami { border-color: rgba(102, 199, 255, 0.3); }
.chip-cyclone { border-color: rgba(130, 122, 255, 0.28); }
.chip-volcano { border-color: rgba(255, 118, 91, 0.3); }
.chip-epidemic { border-color: rgba(90, 239, 182, 0.28); }

.chip-earthquake .chip-icon { background: rgba(121, 202, 255, 0.18); }
.chip-wildfire .chip-icon { background: rgba(255, 144, 79, 0.18); }
.chip-flood .chip-icon { background: rgba(94, 165, 255, 0.18); }
.chip-drought .chip-icon { background: rgba(255, 112, 140, 0.18); }
.chip-food-security .chip-icon { background: rgba(255, 207, 97, 0.18); }
.chip-tsunami .chip-icon { background: rgba(102, 199, 255, 0.18); }
.chip-cyclone .chip-icon { background: rgba(130, 122, 255, 0.18); }
.chip-volcano .chip-icon { background: rgba(255, 118, 91, 0.18); }
.chip-epidemic .chip-icon { background: rgba(90, 239, 182, 0.18); }

@media (max-width: 1150px) {
  .stats-overlay {
    left: auto;
    right: var(--space-md);
    transform: none;
    justify-content: flex-end;
    width: calc(100vw - var(--sidebar-width) - 32px);
  }

  .stat-chip {
    padding-right: 14px;
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
    justify-content: flex-start;
    gap: 8px;
  }

  .stats-overlay.stats-mobile-shifted {
    top: calc(var(--space-sm) + 8px);
  }

  .stats-overlay.hidden-on-mobile {
    display: none !important;
  }

  .stat-chip {
    min-height: 42px;
    padding: 6px 12px 6px 8px;
    gap: 8px;
  }

  .chip-icon {
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    font-size: 0.92rem;
  }

  .chip-icon svg {
    width: 14px;
    height: 14px;
  }

  .chip-value {
    font-size: 0.94rem;
  }
}
</style>
