import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

const LS_KEY = 'ga_session';

function loadSession() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session) {
  try {
    if (session) localStorage.setItem(LS_KEY, JSON.stringify(session));
    else localStorage.removeItem(LS_KEY);
  } catch { /* ignore */ }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref(loadSession());

  const isLoggedIn = computed(() => session.value !== null);
  const isSuperAdmin = computed(() => session.value?.role === 'super_admin');
  const countryCode = computed(() => session.value?.countryCode ?? null);

  function loginAsSuperAdmin() {
    session.value = { role: 'super_admin', countryCode: null };
    saveSession(session.value);
  }

  function loginAsViewer() {
    session.value = { role: 'viewer', countryCode: null };
    saveSession(session.value);
  }

  function logout() {
    session.value = null;
    saveSession(null);
  }

  return { session, isLoggedIn, isSuperAdmin, countryCode, loginAsSuperAdmin, loginAsViewer, logout };
});
