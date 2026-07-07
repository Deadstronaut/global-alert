<script setup>
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { supabase } from '@/services/api/config.js'

const { t } = useI18n()
const auth = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref(null)

// Spec 005 US2/US3: once a second factor is enrolled, a correct password
// alone does not complete login — this local step gates navigation until a
// TOTP code (or a recovery code) is also verified.
const mfaPending = ref(false)
const mfaFactorId = ref(null)
const mfaCode = ref('')
const useRecoveryCode = ref(false)
const recoveryCode = ref('')

function goToApp(session) {
  // super_admin (no country_code) -> global view; country_admin/org_admin -> scoped to their country
  router.push(session.countryCode ? `/${session.countryCode}` : '/')
}

async function loadPendingFactor() {
  const { data: factors } = await supabase.auth.mfa.listFactors()
  mfaFactorId.value = factors?.totp?.[0]?.id ?? null
}

// Handles arriving directly at /mfa-challenge (e.g. redirected by the router
// guard from another URL) rather than having just submitted the password
// form in this same component instance.
onMounted(async () => {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (data.currentLevel === 'aal1' && data.nextLevel === 'aal2') {
    mfaPending.value = true
    await loadPendingFactor()
  }
})

async function handleLogin() {
  if (!email.value || !password.value) return
  loading.value = true
  error.value = null
  try {
    const result = await auth.login(email.value, password.value)
    if (result?.mfaPending) {
      mfaPending.value = true
      await loadPendingFactor()
      return
    }
    goToApp(result)
  } catch (err) {
    // spec 028 FR-005: a distinct, actionable message for a locked account
    // rather than a generic auth-error passthrough.
    if (err.message === 'account_locked') {
      const until = err.lockedUntil ? new Date(err.lockedUntil).toLocaleTimeString() : ''
      error.value = t('login.accountLocked', { until })
    } else {
      error.value = err.message ?? 'Giriş başarısız'
    }
  } finally {
    loading.value = false
  }
}

async function handleMfaVerify() {
  loading.value = true
  error.value = null
  try {
    const session = await auth.verifyMfaChallenge(mfaFactorId.value, mfaCode.value)
    goToApp(session)
  } catch (err) {
    error.value = err.message ?? t('mfaChallenge.invalidCode')
  } finally {
    loading.value = false
  }
}

async function handleRecoveryCodeVerify() {
  loading.value = true
  error.value = null
  try {
    const session = await auth.verifyRecoveryCode(recoveryCode.value)
    goToApp(session)
  } catch (err) {
    error.value = err.message ?? t('mfaChallenge.invalidRecoveryCode')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-bg-grid" />

    <div class="login-card">
      <div class="login-header">
        <div class="login-logo-ring">
          <span class="login-logo-icon">🌍</span>
        </div>
        <div class="login-brand">
          <h1 class="login-title">GEWS</h1>
          <p class="login-subtitle">Global Emergency Warning System</p>
        </div>
        <div class="login-status">
          <span class="status-dot" />
          <span class="status-label">System Online</span>
        </div>
      </div>

      <div class="login-divider" />

      <div class="login-body">
        <p class="login-welcome">Emergency Operations Center</p>
        <p class="login-desc">Authorized personnel only. All access is logged and monitored.</p>

        <form v-if="!mfaPending" class="login-form" @submit.prevent="handleLogin">
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="E-posta"
            class="login-input"
            required
          />
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="Parola"
            class="login-input"
            required
          />
          <div v-if="error" class="login-error">{{ error }}</div>
          <button type="submit" class="login-btn btn-admin" :disabled="loading">
            <span v-if="!loading">Giriş Yap</span>
            <span v-else class="btn-spinner" />
          </button>
        </form>

        <form
          v-else-if="!useRecoveryCode"
          class="login-form"
          @submit.prevent="handleMfaVerify"
        >
          <p class="login-desc">{{ t('mfaChallenge.enterCode') }}</p>
          <input
            v-model="mfaCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            maxlength="6"
            class="login-input"
            required
          />
          <div v-if="error" class="login-error">{{ error }}</div>
          <button type="submit" class="login-btn btn-admin" :disabled="loading || !mfaCode">
            <span v-if="!loading">{{ t('mfaChallenge.verify') }}</span>
            <span v-else class="btn-spinner" />
          </button>
          <button type="button" class="login-link" @click="useRecoveryCode = true; error = null">
            {{ t('mfaChallenge.useRecoveryCode') }}
          </button>
        </form>

        <form v-else class="login-form" @submit.prevent="handleRecoveryCodeVerify">
          <p class="login-desc">{{ t('mfaChallenge.enterRecoveryCode') }}</p>
          <input
            v-model="recoveryCode"
            type="text"
            placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
            class="login-input"
            required
          />
          <div v-if="error" class="login-error">{{ error }}</div>
          <button type="submit" class="login-btn btn-admin" :disabled="loading || !recoveryCode">
            <span v-if="!loading">{{ t('mfaChallenge.verify') }}</span>
            <span v-else class="btn-spinner" />
          </button>
          <button type="button" class="login-link" @click="useRecoveryCode = false; error = null">
            {{ t('mfaChallenge.backToCode') }}
          </button>
        </form>
      </div>

      <div class="login-footer">
        © 2026 Global Alert &nbsp;·&nbsp; Confidential
        <br />
        <router-link to="/report" class="login-public-link">{{ t('communityReport.form.title') }}</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #070b14;
  position: relative;
  overflow: hidden;
}

.login-bg-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(74, 163, 255, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(74, 163, 255, 0.04) 1px, transparent 1px);
  background-size: 40px 40px;
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 380px;
  background: rgba(12, 19, 36, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(24px);
  box-shadow:
    0 0 0 1px rgba(74, 163, 255, 0.08),
    0 24px 64px rgba(0, 0, 0, 0.6),
    0 0 80px rgba(74, 163, 255, 0.06);
  overflow: hidden;
}

.login-header {
  padding: 28px 28px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.login-logo-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid rgba(74, 163, 255, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 24px rgba(74, 163, 255, 0.2), inset 0 0 20px rgba(74, 163, 255, 0.05);
}

.login-logo-icon {
  font-size: 2.2rem;
}

.login-brand {
  text-align: center;
}

.login-title {
  font-size: 1.8rem;
  font-weight: 800;
  color: #f4f7ff;
  letter-spacing: 0.15em;
  margin: 0;
}

.login-subtitle {
  font-size: 0.72rem;
  color: #8c97b3;
  margin: 4px 0 0;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.login-status {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 230, 118, 0.1);
  border: 1px solid rgba(0, 230, 118, 0.25);
  border-radius: 20px;
  padding: 4px 12px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #00e676;
  box-shadow: 0 0 8px #00e676;
  animation: pulse-dot 2s infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-label {
  font-size: 0.72rem;
  color: #00e676;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.login-divider {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
  margin: 0 28px;
}

.login-body {
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.login-welcome {
  font-size: 1rem;
  font-weight: 600;
  color: #f4f7ff;
  margin: 0;
  text-align: center;
}

.login-desc {
  font-size: 0.75rem;
  color: #8c97b3;
  margin: 0;
  text-align: center;
  line-height: 1.5;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-input {
  width: 100%;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: #f4f7ff;
  font-size: 0.88rem;
}

.login-input:focus {
  outline: none;
  border-color: rgba(74, 163, 255, 0.5);
}

.login-error {
  color: #f87171;
  font-size: 0.78rem;
  text-align: center;
}

.login-link {
  background: none;
  border: none;
  color: #8c97b3;
  font-size: 0.75rem;
  text-decoration: underline;
  cursor: pointer;
  margin-top: 4px;
}

.login-btn {
  width: 100%;
  padding: 13px;
  margin-top: 4px;
  border: none;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: opacity 0.2s, transform 0.15s;
  min-height: 46px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.btn-admin {
  background: linear-gradient(135deg, #1a6fd4, #4aa3ff);
  margin-top: 8px;
}

.login-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.login-footer {
  padding: 12px 28px 20px;
  text-align: center;
  font-size: 0.65rem;
  color: rgba(140, 151, 179, 0.5);
  letter-spacing: 0.04em;
}

.login-public-link {
  color: rgba(140, 151, 179, 0.8);
  text-decoration: underline;
}
</style>
