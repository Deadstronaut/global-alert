<script setup>
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps({
  visible: {
    type: Boolean,
    default: true,
  },
})
</script>

<template>
  <transition name="fade-out">
    <div v-if="visible" class="loading-screen">
      <div class="loading-content">
        <div class="loading-globe">
          <div class="globe-ring ring-1"></div>
          <div class="globe-ring ring-2"></div>
          <div class="globe-ring ring-3"></div>
          <span class="globe-emoji">🌍</span>
        </div>

        <h1 class="loading-title">GEWS</h1>
        <p class="loading-subtitle">{{ t('app.subtitle') }}</p>

        <div class="loading-bar-container">
          <div class="loading-bar"></div>
        </div>

        <p class="loading-status">{{ t('app.loading') }}</p>
        <p class="loading-subtext">{{ t('app.loadingSubtext') }}</p>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: var(--z-loading);
  background: radial-gradient(
    ellipse at center,
    var(--color-space-mid) 0%,
    var(--color-space-black) 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  text-align: center;
}

.loading-globe {
  position: relative;
  width: 100px;
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--space-md);
}

.globe-emoji {
  font-size: 3rem;
  z-index: 2;
  animation: globe-float 3s ease-in-out infinite;
}

.globe-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid;
  animation: ring-rotate 4s linear infinite;
}

.ring-1 {
  width: 80px;
  height: 80px;
  border-color: var(--color-accent);
  opacity: 0.4;
  animation-duration: 3s;
}

.ring-2 {
  width: 100px;
  height: 100px;
  border-color: var(--color-info);
  opacity: 0.25;
  animation-duration: 5s;
  animation-direction: reverse;
}

.ring-3 {
  width: 120px;
  height: 120px;
  border-color: var(--color-accent);
  opacity: 0.15;
  animation-duration: 7s;
}

@keyframes globe-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@keyframes ring-rotate {
  0% {
    transform: rotateX(60deg) rotateZ(0deg);
  }
  100% {
    transform: rotateX(60deg) rotateZ(360deg);
  }
}

.loading-title {
  font-size: 2.5rem;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: var(--color-text-primary);
  text-shadow: 0 0 40px var(--color-accent-glow);
}

.loading-subtitle {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  letter-spacing: 0.05em;
}

.loading-bar-container {
  width: 200px;
  height: 3px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: var(--space-md);
}

.loading-bar {
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, var(--color-accent), var(--color-info));
  border-radius: 2px;
  animation: loading-progress 2s ease-in-out infinite;
}

@keyframes loading-progress {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}

.loading-status {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.loading-subtext {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
}

/* Fade out transition */
.fade-out-leave-active {
  transition: opacity 0.8s ease;
}

.fade-out-leave-to {
  opacity: 0;
}
</style>
