<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useUIStore } from '@/stores/ui.js'
import { useGeolocationStore } from '@/stores/geolocation.js'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()
const uiStore = useUIStore()
const geoStore = useGeolocationStore()

// ── Aggregator server health ──────────────────────────────────────────────────
const SERVER_URL = import.meta.env.VITE_AGGREGATOR_URL || 'http://localhost:8765'

const serverSources = ref({})

async function checkServer() {
  try {
    const res = await fetch(`${SERVER_URL}/status`, {
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const data = await res.json()
      serverSources.value = data.sources ?? {}
    } else {
      serverSources.value = {}
    }
  } catch {
    serverSources.value = {}
  }
}

let serverTimer = null
onMounted(() => {
  checkServer()
  serverTimer = setInterval(checkServer, 30_000)
})
onUnmounted(() => clearInterval(serverTimer))

function changeLanguage(lang) {
  locale.value = lang
}

// Kaynak durumu rengi
function statusColor(entry) {
  if (!entry) return '#6b7280'     // gri - henüz bilgi yok
  const code = entry.code
  if (code === 200) return '#22c55e'  // yeşil
  if (code === 0)   return '#f59e0b'  // sarı - bağlantı yok (WS)
  if (code === 401 || code === 403) return '#f97316' // turuncu
  return '#ef4444'                    // kırmızı - 400/404/500
}

function statusLabel(entry) {
  if (!entry) return '—'
  if (entry.code === 0) return 'WS kapalı'
  return `HTTP ${entry.code}`
}

function lastCheck(entry) {
  if (!entry?.at) return ''
  const diff = Math.round((Date.now() - entry.at) / 1000)
  if (diff < 60) return `${diff}s önce`
  return `${Math.round(diff / 60)}dk önce`
}

const sources = computed(() => {
  const s = serverSources.value
  return [
    'EMSC', 'USGS', 'AFAD', 'Kandilli', 'GEOFON',
    'GDACS', 'PTWC', 'NASA FIRMS', 'FEWS NET', 'WHO'
  ].map(name => ({ name, entry: s[name] ?? null }))
})
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

      <!-- Data Sources -->
      <div class="settings-section">
        <h4 class="settings-section-title">Veri Kaynakları</h4>
        <div class="source-list">
          <div
            v-for="src in sources"
            :key="src.name"
            class="source-row"
          >
            <span class="source-dot" :style="{ background: statusColor(src.entry) }"></span>
            <span class="source-name">{{ src.name }}</span>
            <span class="source-code" :style="{ color: statusColor(src.entry) }">
              {{ statusLabel(src.entry) }}
            </span>
            <span class="source-age">{{ lastCheck(src.entry) }}</span>
          </div>
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

/* Source health list */
.source-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  background: rgba(255,255,255,0.04);
  font-size: 0.78rem;
}

.source-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.source-name {
  flex: 1;
  color: var(--color-text-secondary);
  font-weight: 500;
}

.source-code {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
}

.source-age {
  font-size: 0.65rem;
  color: var(--color-text-muted);
  min-width: 44px;
  text-align: right;
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
