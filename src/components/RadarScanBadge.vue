<script setup>
// Small decorative "scanning radar" badge — sits above the severity
// legend card (live-testing ask, 2026-08-06: "bu resimdeki şiddet
// kutusunun üstüne koyalım"), fitting theme for a disaster-monitoring
// map. Adapted from a Uiverse.io radar loader (credit: mrhyddenn) and
// scaled down from its original 150px loading-spinner size to a small
// ~32px corner badge; class names renamed away from the generic
// ".loader" the original used, since that name is both meaningless here
// (this isn't a loading indicator) and collision-prone in a codebase
// this size.
</script>

<template>
  <div class="radar-scan-badge" role="presentation" aria-hidden="true">
    <span class="radar-scan-badge-sweep"></span>
  </div>
</template>

<style scoped>
.radar-scan-badge {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(10, 14, 20, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.radar-scan-badge::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  box-shadow:
    inset -2px -2px 8px rgba(0, 0, 0, 0.35),
    inset 2px 2px 10px rgba(0, 0, 0, 0.35);
}

.radar-scan-badge::after {
  content: '';
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  box-shadow:
    inset -2px -2px 8px rgba(0, 0, 0, 0.35),
    inset 2px 2px 10px rgba(0, 0, 0, 0.35);
}

.radar-scan-badge-sweep {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 50%;
  height: 100%;
  transform-origin: top left;
  animation: radar-scan-sweep-rotate 2s linear infinite;
  border-top: 1px dashed rgba(255, 255, 255, 0.9);
}

.radar-scan-badge-sweep::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform-origin: top left;
  transform: rotate(-55deg);
  filter: blur(6px) drop-shadow(4px 4px 4px seagreen);
  background: seagreen;
}

@keyframes radar-scan-sweep-rotate {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
