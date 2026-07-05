<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth.js'

const { t } = useI18n()
const auth = useAuthStore()

const factors = ref([])
const loading = ref(true)
const error = ref(null)

const enrollStep = ref(null) // null | 'starting' | 'awaiting-code'
const enrollFactorId = ref(null)
const enrollQr = ref(null)
const enrollSecret = ref(null)
const enrollCode = ref('')
const enrolling = ref(false)

const recoveryCodes = ref(null) // shown exactly once, right after a successful enrollment
const requiredForRole = ref(false)
const shouldPromptReEnroll = ref(false)

const activeFactor = computed(() => factors.value[0] ?? null)

async function loadFactors() {
  loading.value = true
  error.value = null
  try {
    factors.value = await auth.mfaListFactors()
    requiredForRole.value = await auth.isMfaRequiredForRoleButUnenrolled()
    // Spec US3 acceptance scenario 4: anyone who has ever used a recovery
    // code and currently has no active factor should be nudged to re-enroll,
    // independent of whether their role's policy makes MFA mandatory.
    shouldPromptReEnroll.value =
      factors.value.length === 0 && (await auth.hasUsedRecoveryCodeHistory())
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

async function startEnroll() {
  error.value = null
  enrolling.value = true
  try {
    const data = await auth.mfaEnroll()
    enrollFactorId.value = data.id
    enrollQr.value = data.totp.qr_code
    enrollSecret.value = data.totp.secret
    enrollStep.value = 'awaiting-code'
  } catch (err) {
    error.value = err.message
  } finally {
    enrolling.value = false
  }
}

async function confirmEnroll() {
  error.value = null
  enrolling.value = true
  try {
    await auth.mfaConfirmEnroll(enrollFactorId.value, enrollCode.value)
    recoveryCodes.value = await auth.generateAndStoreRecoveryCodes(auth.session.id)
    enrollStep.value = null
    enrollCode.value = ''
    await loadFactors()
  } catch (err) {
    error.value = err.message
  } finally {
    enrolling.value = false
  }
}

async function removeFactor(factorId) {
  error.value = null
  try {
    // A mandatory-per-role policy blocks dropping the only active factor to
    // zero (spec US4 acceptance scenario 3) — re-check the live policy, not
    // just the page-load snapshot, since it could have changed since this
    // view opened.
    if (factors.value.length === 1 && (await auth.isMfaRequiredForRole())) {
      error.value = t('accountSecurity.cannotRemoveRequired')
      return
    }
    await auth.mfaUnenroll(factorId)
    await loadFactors()
  } catch (err) {
    error.value = err.message
  }
}

onMounted(loadFactors)
</script>

<template>
  <div class="account-security-page">
    <h1>{{ t('accountSecurity.title') }}</h1>
    <p class="account-security-desc">{{ t('accountSecurity.description') }}</p>

    <div v-if="error" class="account-security-error">{{ error }}</div>

    <div v-if="recoveryCodes" class="recovery-codes-card">
      <h2>{{ t('accountSecurity.recoveryCodesTitle') }}</h2>
      <p class="recovery-codes-warning">{{ t('accountSecurity.recoveryCodesWarning') }}</p>
      <ul class="recovery-codes-list">
        <li v-for="code in recoveryCodes" :key="code">{{ code }}</li>
      </ul>
      <button class="btn-primary" @click="recoveryCodes = null">
        {{ t('accountSecurity.recoveryCodesSaved') }}
      </button>
    </div>

    <div v-else-if="loading" class="account-security-loading">{{ t('app.loading') }}</div>

    <div v-else class="account-security-body">
      <div v-if="requiredForRole && !activeFactor" class="account-security-banner">
        {{ t('accountSecurity.requiredForRole') }}
      </div>
      <div v-else-if="shouldPromptReEnroll" class="account-security-banner">
        {{ t('accountSecurity.reEnrollPrompt') }}
      </div>

      <div v-if="activeFactor" class="active-factor-card">
        <p>{{ t('accountSecurity.factorActive') }}</p>
        <button class="btn-secondary" @click="removeFactor(activeFactor.id)">
          {{ t('accountSecurity.removeFactor') }}
        </button>
      </div>

      <div v-else-if="enrollStep === 'awaiting-code'" class="enroll-card">
        <img v-if="enrollQr" :src="enrollQr" alt="TOTP QR code" class="enroll-qr" />
        <p class="enroll-secret">{{ enrollSecret }}</p>
        <input
          v-model="enrollCode"
          class="enroll-code-input"
          :placeholder="t('accountSecurity.codePlaceholder')"
          maxlength="6"
        />
        <button class="btn-primary" :disabled="enrolling || !enrollCode" @click="confirmEnroll">
          {{ t('accountSecurity.confirm') }}
        </button>
      </div>

      <button v-else class="btn-primary" :disabled="enrolling" @click="startEnroll">
        {{ t('accountSecurity.startEnroll') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.account-security-page {
  max-width: 480px;
  margin: 2rem auto;
  padding: 1.5rem;
}
.account-security-error {
  color: #d33;
  margin-bottom: 1rem;
}
.account-security-banner {
  background: #fff3cd;
  color: #664d03;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}
.recovery-codes-list {
  font-family: monospace;
  font-size: 1.05rem;
  line-height: 1.8;
}
.recovery-codes-warning {
  color: #b45309;
  font-weight: 600;
}
.enroll-qr {
  max-width: 200px;
  display: block;
  margin: 0 auto 0.75rem;
}
.enroll-code-input {
  display: block;
  width: 100%;
  margin: 0.75rem 0;
  padding: 0.5rem;
  font-size: 1.1rem;
  text-align: center;
}
</style>
