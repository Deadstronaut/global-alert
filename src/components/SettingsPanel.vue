<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useDisasterStore } from '@/stores/disaster.js'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'

const { t, locale } = useI18n()
const router = useRouter()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()
const disasterStore = useDisasterStore()
const authStore = useAuthStore()
const canAccessAdmin = computed(() =>
  ['super_admin', 'country_admin', 'org_admin'].includes(authStore.session?.role)
)

async function handleLogout() {
  await authStore.logout()
  uiStore.toggleSettings()
  // See SidebarPanel.vue's handleLogout: push '/login' directly, not '/' —
  // if already on '/', re-pushing it is a no-op duplicate navigation and the
  // post-logout redirect never fires.
  router.push('/login')
}

function changeLanguage(lang) {
  locale.value = lang
}

function navigateTo(path) {
  uiStore.toggleSettings()
  router.push(path)
}
</script>

<template>
  <transition name="slide-right">
    <div v-if="uiStore.settingsPanelOpen" class="settings-panel glass-panel">
      <div class="settings-header">
        <h3>⚙️ {{ t('settings.title') }}</h3>
        <button class="btn-icon btn-ghost" @click="uiStore.toggleSettings()">✕</button>
      </div>

      <!-- Map View Mode -->
      <div class="settings-section">
        <h4 class="settings-section-title">Harita Görünüm Modu</h4>
        <div class="map-mode-selector-settings">
          <button 
            class="mode-btn-settings" 
            :class="{ active: uiStore.mapMode === 'normal' }"
            @click="uiStore.mapMode = 'normal'"
          >
            📍 Durum
          </button>
          <button 
            class="mode-btn-settings" 
            :class="{ active: uiStore.mapMode === 'hexagon' }"
            @click="uiStore.mapMode = 'hexagon'"
          >
            ⬡ Petek
          </button>
          <button 
            class="mode-btn-settings" 
            :class="{ active: uiStore.mapMode === 'heatmap' }"
            @click="uiStore.mapMode = 'heatmap'"
          >
            🔥 Isı
          </button>
        </div>
      </div>

      <!-- Display -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.display') }}</h4>

        <label class="settings-toggle">
          <span>{{ uiStore.darkMode ? 'Dark Mode' : 'Light Mode' }}</span>
          <input type="checkbox" v-model="uiStore.darkMode" />
          <span class="toggle-switch"></span>
        </label>

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

      <!-- Data -->
      <div class="settings-section">
        <h4 class="settings-section-title">Veri</h4>
        <button
          class="btn btn-ghost settings-action-btn"
          @click="disasterStore.refreshAll()"
          :disabled="disasterStore.isLoading"
        >
          🔄 {{ t('app.refreshAll') }}
        </button>
      </div>

      <!-- Operations -->
      <div class="settings-section">
        <h4 class="settings-section-title">Operasyon</h4>
        <div class="settings-actions">
          <button class="btn btn-ghost settings-action-btn" @click="navigateTo('/alerts/cap')">
            ⚠️ CAP Uyarılar
          </button>
          <button class="btn btn-ghost settings-action-btn" @click="navigateTo('/alerts/incidents')">
            🚨 Olay Takip
          </button>
          <button class="btn btn-ghost settings-action-btn" @click="navigateTo('/shelters')">
            🏠 Sığınaklar
          </button>
        </div>
      </div>

      <!-- Language -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.language') }}</h4>
        <div class="language-buttons">
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'en' }"
            @click="changeLanguage('en')"
          >
            EN
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'es' }"
            @click="changeLanguage('es')"
          >
            ES
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'fr' }"
            @click="changeLanguage('fr')"
          >
            FR
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'ru' }"
            @click="changeLanguage('ru')"
          >
            RU
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'ar' }"
            @click="changeLanguage('ar')"
          >
            AR
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'zh' }"
            @click="changeLanguage('zh')"
          >
            ZH
          </button>
          <button
            class="btn btn-ghost lang-btn"
            :class="{ 'btn-primary': locale === 'tr' }"
            @click="changeLanguage('tr')"
          >
            TR
          </button>
        </div>
      </div>

      <!-- Account -->
      <div class="settings-section" v-if="authStore.isLoggedIn">
        <h4 class="settings-section-title">{{ t('settings.account') }}</h4>
        <p class="settings-desc">{{ t('settings.loggedInAs', { email: authStore.session?.email }) }}</p>
        <button
          v-if="canAccessAdmin"
          class="btn btn-ghost settings-action-btn"
          @click="navigateTo('/admin')"
        >
          🛡️ Yönetim
        </button>
        <button class="btn btn-danger logout-btn" @click="handleLogout">
          ⎋ {{ t('settings.logout') }}
        </button>
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
  flex-wrap: wrap;
  gap: 8px;
}

.lang-btn {
  flex: 1 1 calc(33% - 8px);
  min-width: 60px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  font-weight: 700;
  padding: 8px;
}

.settings-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-action-btn {
  width: 100%;
  justify-content: center;
  min-height: 34px;
  font-size: 0.82rem;
  font-weight: 700;
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

.map-mode-selector-settings {
  display: flex;
  gap: 8px;
  width: 100%;
}

.mode-btn-settings {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
  padding: 8px 4px;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn-settings:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.2);
}

.mode-btn-settings.active {
  background: rgba(77, 163, 255, 0.15);
  border-color: var(--color-accent);
  color: var(--color-accent);
  box-shadow: 0 0 12px rgba(77, 163, 255, 0.1);
}

.logout-btn {
  width: 100%;
  justify-content: center;
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
}

.logout-btn:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.6);
}
</style>
