<script setup>
import { useUIStore } from '@/stores/ui.js'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const uiStore = useUIStore()

function dismiss() {
  uiStore.emergencyPopupOpen = false
  uiStore.activeEmergency = null
}
</script>

<template>
  <transition name="pop">
    <div v-if="uiStore.emergencyPopupOpen && uiStore.activeEmergency" class="emergency-overlay">
      <div class="emergency-container">
        <div class="emergency-circle pulse-red" @click="dismiss">
          <div class="emergency-content">
            <span class="emergency-icon">{{ uiStore.activeEmergency.icon }}</span>
            <h2 class="emergency-title">{{ t('alerts.emergencyTitle') }}</h2>
            <p class="emergency-type">{{ uiStore.activeEmergency.title }}</p>
            <div class="emergency-divider"></div>
            <p class="emergency-desc">{{ t('alerts.emergencyInstruction') }}</p>
            <button class="emergency-btn glass-panel" @click.stop="dismiss">
              {{ t('alerts.emergencyDismiss') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.emergency-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
}

.emergency-container {
  position: relative;
  width: 450px;
  height: 450px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emergency-circle {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 23, 68, 0.95) 0%, rgba(136, 14, 79, 0.9) 100%);
  border: 8px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px;
  box-shadow: 0 0 50px rgba(255, 23, 68, 0.6);
  cursor: pointer;
}

.pulse-red {
  animation: pulse-ring 2s infinite;
}

@keyframes pulse-ring {
  0% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(255, 23, 68, 0.7);
  }
  70% {
    transform: scale(1);
    box-shadow: 0 0 0 30px rgba(255, 23, 68, 0);
  }
  100% {
    transform: scale(0.95);
    box-shadow: 0 0 0 0 rgba(255, 23, 68, 0);
  }
}

.emergency-content {
  display: flex;
  flex-direction: column;
  color: white;
}

.emergency-icon {
  font-size: 5rem;
  margin-bottom: 10px;
}

.emergency-title {
  font-size: 1.8rem;
  font-weight: 900;
  letter-spacing: 2px;
  margin-bottom: 5px;
}

.emergency-type {
  font-size: 1.2rem;
  font-weight: 600;
  opacity: 0.9;
}

.emergency-divider {
  width: 80px;
  height: 3px;
  background: white;
  margin: 15px auto;
  border-radius: 2px;
}

.emergency-desc {
  font-size: 0.95rem;
  line-height: 1.5;
  margin-bottom: 25px;
  font-weight: 500;
}

.emergency-btn {
  background: white;
  color: #ff1744;
  border: none;
  font-weight: 800;
  text-transform: uppercase;
  padding: 12px 24px;
  border-radius: 30px;
  font-size: 0.9rem;
  transition: all 0.3s ease;
}

.emergency-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

/* transition animations */
.pop-enter-active,
.pop-leave-active {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.5) rotate(-10deg);
}

@media (max-width: 500px) {
  .emergency-container {
    width: 320px;
    height: 320px;
  }
  .emergency-title {
    font-size: 1.2rem;
  }
  .emergency-icon {
    font-size: 3.5rem;
  }
  .emergency-desc {
    font-size: 0.75rem;
  }
}
</style>
