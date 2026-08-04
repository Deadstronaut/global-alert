<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUIStore } from '@/stores/ui.js'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'
import { Button } from '@/components/ui/button'

defineProps({
  // MapView.vue's dock has its own persistent header (with the title +
  // close button) so its collapse toggle has a stable menu to anchor to —
  // this panel's own header would be redundant there. The standalone
  // globe-view usage (HomeView.vue) has no such dock, so it keeps this.
  hideHeader: { type: Boolean, default: false },
  // Rendered inline inside the Dashboard's own sidebar (AppSidebar.vue) as
  // a collapsible "Ayarlar" group — Quick Access and Account are already
  // covered there (the Sayfalar nav group and the sidebar footer's account
  // dropdown respectively), so this hides those two sections to avoid
  // showing the same links/logout button twice.
  embedded: { type: Boolean, default: false },
})

const { t, locale } = useI18n()
const router = useRouter()
const uiStore = useUIStore()
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
  <!-- No own v-if/transition: this is pure panel content now. The map view
       embeds it as one face of impact-panel-dock's flip card (both faces
       always mounted, CSS rotateY handles visibility); the globe view (no
       dock to flip with) wraps it in its own transition + v-if instead. -->
  <div class="settings-panel" :class="{ embedded }">
    <div v-if="!hideHeader" class="settings-header">
      <h3>⚙️ {{ t('settings.title') }}</h3>
      <Button variant="ghost" size="icon" @click="uiStore.toggleSettings()">✕</Button>
    </div>

      <!-- Language -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.language') }}</h4>
        <div class="language-buttons">
          <Button
            :variant="locale === 'en' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('en')"
          >
            EN
          </Button>
          <Button
            :variant="locale === 'es' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('es')"
          >
            ES
          </Button>
          <Button
            :variant="locale === 'fr' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('fr')"
          >
            FR
          </Button>
          <Button
            :variant="locale === 'ru' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('ru')"
          >
            RU
          </Button>
          <Button
            :variant="locale === 'ar' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('ar')"
          >
            AR
          </Button>
          <Button
            :variant="locale === 'zh' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('zh')"
          >
            ZH
          </Button>
          <Button
            :variant="locale === 'tr' ? 'default' : 'ghost'"
            class="lang-btn"
            @click="changeLanguage('tr')"
          >
            TR
          </Button>
        </div>
      </div>

      <!-- Appearance & Accessibility -->
      <div class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.appearance') }}</h4>

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
          <span>{{ t('settings.colorblindMode') }}</span>
          <input type="checkbox" v-model="uiStore.colorblindMode" />
          <span class="toggle-switch"></span>
        </label>
        <p class="settings-desc">{{ t('settings.colorblindDesc') }}</p>

        <label class="settings-toggle">
          <span>{{ t('settings.safeMode') }}</span>
          <input type="checkbox" v-model="uiStore.safeMode" />
          <span class="toggle-switch"></span>
        </label>
        <p class="settings-desc">{{ t('settings.safeModeDesc') }}</p>
      </div>

      <!-- Quick Access -->
      <div v-if="!embedded" class="settings-section">
        <h4 class="settings-section-title">{{ t('settings.quickAccess') }}</h4>
        <div class="quick-access-list">
          <Button variant="ghost" class="quick-access-link" @click="navigateTo('/alerts/cap')">
            <span>⚠️ {{ t('settings.capAlerts') }}</span>
            <span class="quick-access-arrow">›</span>
          </Button>
          <Button variant="ghost" class="quick-access-link" @click="navigateTo('/alerts/incidents')">
            <span>🚨 {{ t('settings.incidentTracking') }}</span>
            <span class="quick-access-arrow">›</span>
          </Button>
          <Button variant="ghost" class="quick-access-link" @click="navigateTo('/shelters')">
            <span>🏠 {{ t('settings.shelters') }}</span>
            <span class="quick-access-arrow">›</span>
          </Button>
          <Button variant="ghost" class="quick-access-link" @click="navigateTo('/hazards')">
            <span>🌋 {{ t('settings.hazardEncyclopedia') }}</span>
            <span class="quick-access-arrow">›</span>
          </Button>
          <Button variant="ghost" class="quick-access-link" @click="navigateTo('/report')">
            <span>📢 {{ t('communityReport.form.title') }}</span>
            <span class="quick-access-arrow">›</span>
          </Button>
          <!-- Admin entry intentionally left as the legacy element — Settings
               migration excludes anything admin-related per project owner. -->
          <button
            v-if="canAccessAdmin"
            class="quick-access-link"
            @click="navigateTo('/admin')"
          >
            <span>🛡️ {{ t('settings.admin') }}</span>
            <span class="quick-access-arrow">›</span>
          </button>
        </div>
      </div>

    <!-- Account -->
    <div class="settings-section" v-if="!embedded && authStore.isLoggedIn">
      <h4 class="settings-section-title">{{ t('settings.account') }}</h4>
      <p class="settings-desc">{{ t('settings.loggedInAs', { email: authStore.session?.email }) }}</p>
      <Button variant="destructive" class="logout-btn" @click="handleLogout">
        ⎋ {{ t('settings.logout') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
/* Matches .impact-panel (ImpactPanel.vue) exactly — same background,
   width and padding — since the two are now faces of the same dock
   (map view) or interchangeable at the same screen position (globe view). */
.settings-panel {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: rgba(15, 17, 23, 0.92);
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: var(--space-md);
}

.settings-panel.embedded {
  height: auto;
  overflow-y: visible;
  background: transparent;
  padding: 4px var(--space-md) var(--space-sm);
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

.quick-access-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  overflow: hidden;
}

.quick-access-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--glass-border);
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-normal);
}

.quick-access-link:last-child {
  border-bottom: none;
}

.quick-access-link:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-primary);
}

.quick-access-link:disabled {
  opacity: 0.5;
  cursor: default;
}

.quick-access-arrow {
  color: var(--color-text-muted);
  font-size: 1rem;
}

.logout-btn {
  width: 100%;
  justify-content: center;
}
</style>
