<script setup>
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

function changeLanguage(lang) {
  locale.value = lang
}
</script>

<template>
  <transition name="slide-right">
    <div v-if="uiStore.settingsPanelOpen" class="settings-panel glass-panel">
      <div class="settings-header">
        <h3>⚙️ {{ t('settings.title') }}</h3>
        <button class="btn-icon btn-ghost" @click="uiStore.toggleSettings()">✕</button>
      </div>

      <!-- Display -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.display') }}</h4>

        <label class="settings-toggle">
          <span>{{ t('settings.highContrast') }}</span>
          <input type="checkbox" v-model="uiStore.highContrast" />
          <span class="toggle-switch"></span>
        </label>

        <label class="settings-toggle">
          <span>{{ t('settings.safeMode') }}</span>
          <input type="checkbox" v-model="uiStore.safeMode" />
          <span class="toggle-switch"></span>
        </label>
        <p class="settings-desc">{{ t('settings.safeModeDesc') }}</p>
      </div>

      <!-- Accessibility -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.accessibility') }}</h4>

        <label class="settings-toggle">
          <span>{{ t('settings.colorblindMode') }}</span>
          <input type="checkbox" v-model="uiStore.colorblindMode" />
          <span class="toggle-switch"></span>
        </label>
        <p class="settings-desc">{{ t('settings.colorblindDesc') }}</p>
      </div>

      <!-- Notifications -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.notifications') }}</h4>

        <div class="settings-range">
          <label>{{ t('settings.alertRadius') }}</label>
          <input
            type="range"
            min="10"
            max="500"
            step="10"
            :value="geoStore.alertRadius"
            @input="geoStore.setAlertRadius(Number($event.target.value))"
          />
          <span class="range-value">{{ geoStore.alertRadius }} km</span>
        </div>
      </div>

      <!-- Language -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.language') }}</h4>
        <div class="language-buttons">
          <button
            class="btn btn-ghost"
            :class="{ 'btn-primary': locale === 'tr' }"
            @click="changeLanguage('tr')"
          >
            🇹🇷 Türkçe
          </button>
          <button
            class="btn btn-ghost"
            :class="{ 'btn-primary': locale === 'en' }"
            @click="changeLanguage('en')"
          >
            🇬🇧 English
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.settings-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 340px;
  max-width: 90%;
  height: 100vh;
  z-index: var(--z-alerts);
  display: flex;
  flex-direction: column;
  padding: var(--space-md);
  gap: var(--space-md);
  border-radius: 0;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--glass-border);
}

.settings-header h3 {
  font-size: 1rem;
  font-weight: 700;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.settings-section-title {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--color-text-muted);
}

.settings-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 0.85rem;
  cursor: pointer;
  color: var(--color-text-secondary);
}

.settings-toggle input {
  display: none;
}

.toggle-switch {
  width: 40px;
  height: 22px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 11px;
  position: relative;
  transition: background var(--transition-normal);
  flex-shrink: 0;
}

.toggle-switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: var(--color-text-secondary);
  border-radius: 50%;
  transition: all var(--transition-normal);
}

.settings-toggle input:checked + .toggle-switch {
  background: var(--color-accent);
}

.settings-toggle input:checked + .toggle-switch::after {
  left: 21px;
  background: white;
}

.settings-desc {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  line-height: 1.4;
  margin-top: -4px;
}

.settings-range {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.settings-range label {
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

.settings-range input[type='range'] {
  width: 100%;
  accent-color: var(--color-accent);
}

.range-value {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-info);
}

.language-buttons {
  display: flex;
  gap: var(--space-sm);
}

.language-buttons .btn {
  flex: 1;
}

/* Slide transition */
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    transform var(--transition-slow),
    opacity var(--transition-slow);
}

.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
