<script setup>
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth.js'
import { useRouter } from 'vue-router'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(null) // 'admin' | 'user' | null

async function loginAsAdmin() {
  loading.value = 'admin'
  await new Promise(r => setTimeout(r, 600))
  auth.loginAsSuperAdmin()
  router.push('/')
}

async function loginAsUser() {
  loading.value = 'user'
  await new Promise(r => setTimeout(r, 600))
  auth.loginAsViewer()
  router.push('/')
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

        <button class="login-btn btn-admin" :disabled="loading !== null" @click="loginAsAdmin">
          <span v-if="loading !== 'admin'">Super Admin</span>
          <span v-else class="btn-spinner" />
        </button>

        <button class="login-btn btn-user" :disabled="loading !== null" @click="loginAsUser">
          <span v-if="loading !== 'user'">User Entry</span>
          <span v-else class="btn-spinner" />
        </button>

        <div class="login-dev-badge">
          <span class="dev-dot" />
          Development mode — authentication bypassed
        </div>
      </div>

      <div class="login-footer">
        © 2026 Global Alert &nbsp;·&nbsp; Confidential
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

.btn-user {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #c4cee6;
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

.login-dev-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 0.7rem;
  color: #8c97b3;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  padding: 6px 10px;
}

.dev-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ffd600;
  flex-shrink: 0;
}

.login-footer {
  padding: 12px 28px 20px;
  text-align: center;
  font-size: 0.65rem;
  color: rgba(140, 151, 179, 0.5);
  letter-spacing: 0.04em;
}
</style>
